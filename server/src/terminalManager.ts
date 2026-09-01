/**
 * Terminal session manager for pi-outpost.
 *
 * Spawns and manages interactive pseudo-terminals (PTY) via node-pty,
 * piping input/output through the WebSocket protocol.
 */
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import type * as pty from "node-pty";
import type { WebSocket } from "ws";

const execFileAsync = promisify(execFile);

let ptyModule: typeof pty | null = null;
let ptyLoadError: Error | null = null;

async function getPty(): Promise<typeof pty> {
  if (ptyModule) return ptyModule;
  if (ptyLoadError) throw ptyLoadError;
  try {
    const mod = await import("node-pty");
    ptyModule = ((mod as any).default || mod) as typeof pty;
    return ptyModule;
  } catch (err) {
    ptyLoadError = err instanceof Error ? err : new Error(String(err));
    throw ptyLoadError;
  }
}

export interface TerminalSession {
  terminalId: string;
  ptyProcess: pty.IPty;
  socket: WebSocket;
  cwd: string;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private socketToTerminals = new Map<WebSocket, Set<string>>();

  /**
   * Determine the default shell for the host platform.
   */
  getDefaultShell(): { shell: string; args: string[] } {
    if (process.platform === "win32") {
      const shell = process.env.COMSPEC || "powershell.exe";
      return { shell, args: [] };
    }
    const shell = process.env.SHELL || (os.platform() === "darwin" ? "/bin/zsh" : "/bin/bash");
    // Start interactive shell
    return { shell, args: ["-i"] };
  }

  /**
   * Open a new interactive terminal session.
   */
  async open(
    socket: WebSocket,
    terminalId: string,
    cwd: string,
    cols = 80,
    rows = 24,
    onData: (terminalId: string, data: string) => void,
    onExit: (terminalId: string, exitCode?: number) => void,
  ): Promise<TerminalSession> {
    // If an existing session with this ID exists for this socket, close it first
    if (this.sessions.has(terminalId)) {
      this.close(terminalId);
    }

    const { shell, args } = this.getDefaultShell();
    const resolvedCwd = path.resolve(cwd);

    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    const pty = await getPty();
    const ptyProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: Math.max(10, cols),
      rows: Math.max(5, rows),
      cwd: resolvedCwd,
      env,
    });

    const session: TerminalSession = {
      terminalId,
      ptyProcess,
      socket,
      cwd: resolvedCwd,
    };

    this.sessions.set(terminalId, session);

    let termSet = this.socketToTerminals.get(socket);
    if (!termSet) {
      termSet = new Set();
      this.socketToTerminals.set(socket, termSet);
    }
    termSet.add(terminalId);

    ptyProcess.onData((data: string) => {
      onData(terminalId, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.cleanupSession(terminalId);
      onExit(terminalId, exitCode);
    });

    return session;
  }

  /**
   * Send input characters / keystrokes to a terminal.
   */
  write(terminalId: string, data: string): boolean {
    const session = this.sessions.get(terminalId);
    if (!session) return false;
    session.ptyProcess.write(data);
    return true;
  }

  /**
   * Resize a terminal session (SIGWINCH).
   */
  resize(terminalId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(terminalId);
    if (!session) return false;
    const safeCols = Math.max(10, cols);
    const safeRows = Math.max(5, rows);
    try {
      session.ptyProcess.resize(safeCols, safeRows);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Query the current working directory of a terminal process.
   */
  async getCwd(terminalId: string): Promise<string | undefined> {
    const session = this.sessions.get(terminalId);
    if (!session) return undefined;
    const pid = session.ptyProcess.pid;

    if (process.platform === "linux") {
      try {
        const link = await fs.readlink(`/proc/${pid}/cwd`);
        return link;
      } catch {
        return session.cwd;
      }
    }

    if (process.platform === "darwin") {
      try {
        const { stdout } = await execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
        const match = stdout.split("\n").find((line) => line.startsWith("n"));
        if (match) {
          return match.slice(1);
        }
      } catch {
        return session.cwd;
      }
    }

    return session.cwd;
  }

  /**
   * Close a specific terminal session.
   */
  close(terminalId: string): boolean {
    const session = this.sessions.get(terminalId);
    if (!session) return false;
    try {
      session.ptyProcess.kill();
    } catch {
      // Process might already be dead
    }
    this.cleanupSession(terminalId);
    return true;
  }

  /**
   * Clean up all terminal sessions associated with a disconnected socket.
   */
  closeAllForSocket(socket: WebSocket): void {
    const termSet = this.socketToTerminals.get(socket);
    if (!termSet) return;
    for (const termId of termSet) {
      const session = this.sessions.get(termId);
      if (session) {
        try {
          session.ptyProcess.kill();
        } catch {
          // Ignore
        }
        this.sessions.delete(termId);
      }
    }
    this.socketToTerminals.delete(socket);
  }

  /**
   * Close all terminal sessions across all sockets (e.g. on server shutdown).
   */
  closeAll(): void {
    for (const session of this.sessions.values()) {
      try {
        session.ptyProcess.kill();
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();
    this.socketToTerminals.clear();
  }

  private cleanupSession(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (session) {
      const termSet = this.socketToTerminals.get(session.socket);
      if (termSet) {
        termSet.delete(terminalId);
        if (termSet.size === 0) {
          this.socketToTerminals.delete(session.socket);
        }
      }
      this.sessions.delete(terminalId);
    }
  }
}
