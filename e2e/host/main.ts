/**
 * The host application, reduced to what a host application actually does: import
 * the published entry point, call mount(), keep the handle.
 *
 * The import is `@pi-outpost/embed` rather than a relative path into src, so it
 * resolves through package.json's `exports` map — the same resolution a consumer
 * gets, against the same built bundle. Importing the source would test code we
 * do not ship.
 *
 * React is left to the bundler here, exactly as in a host app: the widget
 * declares it as a peer dependency, so this page is where the single copy comes
 * from. (That there is only one copy is asserted against the artifact, in
 * scripts/check-embed-package.mjs — a bundled second React runs fine in its own
 * tree and would not fail here.)
 */
import { mount, type MountHandle, type Theme } from "@pi-outpost/embed";

declare global {
  interface Window {
    /** Handed to the test so it drives the public API rather than internals. */
    __embed: {
      setTheme(theme: Theme): void;
      unmount(): void;
    };
  }
}

const container = document.querySelector<HTMLElement>("#widget")!;
// The server the widget talks to; the test's global setup puts a real one here.
const params = new URLSearchParams(location.search);
const serverUrl = params.get("server") ?? undefined;
// A host that already authenticates its user supplies the token itself, which
// is what makes the browser preflight every request the widget sends.
const token = params.get("token") ?? undefined;
// Optional on purpose. A host that names a theme overrides the server's
// branding.defaultTheme, so leaving it out is the only way to exercise the
// branding path — and that path is a real one: it is how a deployment sets the
// theme for hosts that do not care to.
const theme = (params.get("theme") ?? undefined) as Theme | undefined;
// Which project the host binds its widget to. Named here rather than chosen in
// the widget: an embedded widget offers no switching, so this parameter is the
// only way to exercise that binding from outside.
const workspace = params.get("workspace") ?? undefined;

// A host that already declares its own install metadata. Off by default so the
// bare page still shows what a widget does to a page that has none; on, it is the
// only way to prove the widget replaces or removes nothing it found there.
if (params.get("hostMeta") !== null) {
  document.title = "host app";
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/host-app.webmanifest";
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  themeColor.content = "#00aa55";
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = "/host-app-icon.png";
  document.head.append(manifest, themeColor, icon);
}

const handle: MountHandle = mount(container, {
  ...(serverUrl === undefined ? {} : { serverUrl }),
  ...(token === undefined ? {} : { token }),
  ...(theme === undefined ? {} : { theme }),
  ...(workspace === undefined ? {} : { workspace }),
});

window.__embed = {
  setTheme: (theme) => handle.setTheme(theme),
  unmount: () => handle.unmount(),
};
