/**
 * Opening the interface in the operator's browser, once the server is listening.
 *
 * Anyone who starts this reads an address off the terminal and pastes it into a
 * browser. The software can do that itself — and for an executable launched from a
 * file manager it must, because there is no terminal for that address to be read
 * from at all.
 */
import { spawn } from "node:child_process";

export interface OpenDecision {
  /** Set by --open / --no-open, which win over everything. */
  explicit?: boolean;
  /** Set in configuration, for a deployment that never wants one. */
  configured?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

/**
 * Whether a browser should be opened at all.
 *
 * The obvious test — "is stdout a terminal" — gets the most important case exactly
 * backwards: a double-clicked executable has no terminal, and is precisely where
 * nobody will read a printed address. So the question is whether a browser can be
 * *shown*: macOS and Windows always have a desktop; on Linux a display server has to
 * be named. A container, a service and a remote shell all fail that test on their
 * own, without needing to be recognised individually.
 */
export function shouldOpenBrowser({
  explicit,
  configured,
  platform = process.platform,
  env = process.env,
}: OpenDecision = {}): boolean {
  if (explicit !== undefined) return explicit;
  if (configured !== undefined) return configured;
  // A CI runner has a display often enough to matter, and never a person watching.
  if (env.CI !== undefined && env.CI !== "" && env.CI !== "false") return false;
  if (platform === "darwin" || platform === "win32") return true;
  return Boolean(env.DISPLAY ?? env.WAYLAND_DISPLAY);
}

/**
 * The address to open, from what the server actually bound.
 *
 * Not from the configuration: a port of 0 means the operating system picks, and the
 * configured value is then a number nobody is listening on. The wildcard addresses
 * are not reachable as themselves either — a browser has to be sent somewhere it can
 * connect, which is the loopback of the same family.
 */
export function browsableUrl(address: { address: string; port: number; family?: string }): string {
  const host =
    address.address === "0.0.0.0" || address.address === "::" || address.address === ""
      ? "127.0.0.1"
      : address.address;
  // A literal IPv6 address needs its brackets back before it is a URL.
  const authority = host.includes(":") ? `[${host}]` : host;
  return `http://${authority}:${address.port}/`;
}

/** The platform's own opener. Nothing here parses a browser preference — the OS holds it. */
function openerFor(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  // `start` is a shell builtin, not a program; the empty string is the window title
  // the first quoted argument would otherwise be taken for.
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

/**
 * Launch it, detached, and never let it matter.
 *
 * A browser that will not start is not a reason for a server to stop, or even to
 * exit non-zero: the address is printed either way, which is what the operator would
 * have used before this existed.
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const { command, args } = openerFor(platform, url);
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.on("error", () => resolve(false));
      // Unref'd, or a browser the OS keeps as a child would hold the server open
      // past Ctrl-C — which is how "the process will not die" bugs are born.
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}
