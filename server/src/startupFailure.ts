/**
 * A server that cannot begin listening, and how it says so.
 *
 * Every other failure this binary can have already goes through `complain()` and an
 * exit code — a bad flag, a failed `init`, a refused `build-exe`. Binding the port
 * was the one that did not, so it arrived as an unhandled rejection and a stack
 * trace: where the code was, rather than what the operator must do.
 *
 * The second half is where the sentence lands. A process started from a file manager
 * on Windows *owns* its console window: the window exists because the process does,
 * and closes when it exits. There is no scrollback to return to and no terminal
 * behind it. The same `console.error` is permanent from a shell and a flash from a
 * double-click, and nothing in the message can tell the difference — so the process
 * has to.
 */
import { spawnSync } from "node:child_process";

/**
 * The line an operator reads when the bind failed.
 *
 * The occupied port is the case worth naming: it is the one that happens, it is the
 * one with an answer, and the answer is a flag. Everything else still gets a
 * sentence rather than a trace — an unknown reason is not a reason to fall back to
 * printing the stack.
 */
export function bindFailureMessage(error: unknown, host: string, port: number): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const address = `${endpointHost(host)}:${port}`;
  if (code === "EADDRINUSE") {
    return `cannot start: ${address} is already in use — something is listening there already; "--port <n>" starts this one somewhere else`;
  }
  if (code === "EACCES") {
    // Only a privileged port gets the privileged-port explanation. A high port can be
    // refused too — a reserved range, a policy, a security product — and telling that
    // operator to find a port above 1024 sends them to look at the one they already
    // have.
    const why = port < 1024 ? "a port below 1024 needs privileges" : "the system refused it";
    return `cannot start: not allowed to bind ${address} — ${why}; "--port <n>" chooses another`;
  }
  if (code === "EADDRNOTAVAIL") {
    return `cannot start: ${address} is not an address of this machine — "--host <addr>" chooses another`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `cannot start: could not listen on ${address} — ${detail}`;
}

/**
 * The host as it appears in an endpoint.
 *
 * A literal IPv6 address needs its brackets, or `::1` and port 3141 read as
 * `::1:3141` — which is a plausible IPv6 address and names no port at all. The same
 * reasoning, and the same treatment, as `browsableUrl` in openBrowser.ts.
 */
function endpointHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

/** The parent's image name, or undefined where the question could not be answered. */
export type ParentProbe = () => string | undefined;

export interface ConsoleOwnership {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** The parent's image name. Supplied rather than looked up, so this stays a decision. */
  parent?: string | undefined;
}

/**
 * Whether this console dies with this process.
 *
 * Not "is a terminal attached": `stdin.isTTY` is true for a double-clicked window
 * *and* for a shell, so it separates nothing. It only says a person could type. The
 * question is whether the window is ours, and the parent answers it — a console
 * spawned by the file manager has `explorer.exe` above it; a shell has the shell.
 *
 * Only a confident yes holds anything. No parent, a probe that failed, a platform
 * with no answer: all exit immediately, which is what happened before this existed.
 * A signal that cannot be read degrades to today's behaviour rather than to a
 * process that hangs.
 */
export function ownsItsConsole({ platform = process.platform, env = process.env, parent }: ConsoleOwnership = {}): boolean {
  // First, and for the same reason `shouldOpenBrowser` asks it first: a runner has
  // nobody watching, and a runner that waits for a keypress waits for its timeout.
  if (env.CI !== undefined && env.CI !== "" && env.CI !== "false") return false;
  // Elsewhere a terminal outlives the process that printed into it, so there is
  // nothing to hold: the message is already where the operator can read it.
  if (platform !== "win32") return false;
  return parent?.trim().toLowerCase() === "explorer.exe";
}

/**
 * Who launched us, on the platform where it decides something.
 *
 * `/FO CSV /NH` rather than the default layout: `tasklist` localises its headers and
 * aligns its columns to the locale's widths, and neither survives being parsed. The
 * image name itself is not localised. Run once, only after a bind has already
 * failed — the successful start never pays for this.
 */
export const parentImageName: ParentProbe = () => {
  if (process.platform !== "win32") return undefined;
  const ppid = process.ppid;
  if (!Number.isInteger(ppid) || ppid <= 0) return undefined;
  const result = spawnSync("tasklist", ["/FI", `PID eq ${ppid}`, "/FO", "CSV", "/NH"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  return parseTasklistImageName(result.stdout ?? "");
};

/**
 * The image name out of one CSV row, or undefined.
 *
 * `tasklist` answers a filter that matched nothing with a sentence rather than an
 * empty result — "INFO: No tasks are running which match the specified criteria" —
 * and exits zero while doing it. A parser that trusts the exit code alone would take
 * the first word of that sentence for a process name.
 */
export function parseTasklistImageName(stdout: string): string | undefined {
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.trim().length > 0);
  if (line === undefined) return undefined;
  const quoted = /^"([^"]*)"/.exec(line.trim());
  if (quoted === null) return undefined;
  const name = quoted[1].trim();
  return name.length > 0 ? name : undefined;
}

/** The stream this waits on, narrowed to what it uses so a test can supply one. */
export interface Holdable {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume: () => unknown;
  pause: () => unknown;
  once: (event: "data", listener: () => void) => unknown;
}

/**
 * Hold the window until the operator dismisses it.
 *
 * A key, not a timeout: the window is the only copy of the message there is, and
 * there is no honest number of seconds after which to throw it away. Where raw mode
 * is unavailable this returns rather than degrading into a wait nothing can end.
 */
export async function waitForAKey(stdin: Holdable = process.stdin): Promise<void> {
  const setRawMode = stdin.setRawMode;
  if (stdin.isTTY !== true || typeof setRawMode !== "function") return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      try {
        setRawMode.call(stdin, false);
      } catch {
        // Restoring the terminal is a courtesy; the process is about to exit anyway.
      }
      stdin.pause();
      resolve();
    };
    try {
      setRawMode.call(stdin, true);
    } catch {
      resolve();
      return;
    }
    stdin.resume();
    stdin.once("data", done);
  });
}
