import { createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Theme as WireTheme } from "@pi-outpost/shared";
import { App, type AppHandle } from "@pi-outpost/ui";
// eslint-disable-next-line import/no-unresolved -- resolved at build time via the `?inline` query (raw CSS string)
import css from "web/index.css?inline";

/**
 * Theme the widget starts in. Spelled out here rather than re-exported from
 * @pi-outpost/shared: that package is private to this repo, so a published
 * `mount.d.ts` importing from it would resolve to nothing in a consumer's
 * project. The assignment below keeps the two in step.
 */
export type Theme = "light" | "dark" | "system";
type Identical<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
// Drift makes Identical resolve to never, so this assignment stops compiling.
const themeMatchesProtocol: Identical<Theme, WireTheme> = true;
void themeMatchesProtocol;

export interface MountOptions {
  /** pi-outpost backend origin, e.g. "https://api.example.com". Defaults to same-origin as the host page. */
  serverUrl?: string;
  /** Initial theme; falls back to the server's branding.defaultTheme, then "system". */
  theme?: Theme;
  /** Auth token for servers with `server.token` set — the host app supplies it, no token screen shown. */
  token?: string;
}

export interface MountHandle {
  /** Unmounts the React tree. `container` itself is left in the DOM (with an empty shadow root). */
  unmount(): void;
  setTheme(theme: Theme): void;
}

/**
 * Mounts pi-outpost into `container` inside a Shadow DOM, fully isolated from the
 * host page's CSS in both directions (Tailwind's reset never touches the host page,
 * and the host page's styles never bleed into the widget).
 */
/** Marks the one registration, so a second widget on the page does not add another. */
const PROPERTY_REGISTRATION_ID = "pi-outpost-custom-properties";

/**
 * Registers the stylesheet's typed custom properties on the document.
 *
 * `@property` registers on the document or not at all: inside a shadow tree —
 * and inside an adopted stylesheet in particular — the rule is parsed and
 * ignored. Tailwind v4 leans on it. `.border` is `border-style:
 * var(--tw-border-style); border-width: 1px`, and with the property
 * unregistered that `var()` resolves to nothing, which makes `border-style`
 * invalid at computed-value time and leaves it `none`. The width and the colour
 * arrive, the line does not: every border in the widget was silently missing,
 * cards, menus, composer and tables alike. It reads as a flat design rather than
 * as a bug, which is why it survived this long.
 *
 * A registration declares the type and initial value of a custom property; it
 * paints nothing by itself. `--tw-*` is Tailwind's own namespace, so this stays
 * out of the host page's way — the one thing that must cross the boundary here,
 * because the boundary is exactly what breaks it.
 */
function registerCustomProperties(cssText: string): void {
  if (typeof document === "undefined" || document.getElementById(PROPERTY_REGISTRATION_ID)) return;
  const registrations = cssText.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g);
  if (registrations === null) return;
  const style = document.createElement("style");
  style.id = PROPERTY_REGISTRATION_ID;
  style.textContent = registrations.join("\n");
  document.head.appendChild(style);
}

export function mount(container: HTMLElement, options: MountOptions = {}): MountHandle {
  const shadow = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  registerCustomProperties(css);

  // Chrome 97 silently drops <style> elements >~512 KB inside Shadow DOM;
  // Tailwind v4 is ~1.5 MB, so we use the constructable stylesheet API instead.
  const canUseConstructableSheets =
    typeof CSSStyleSheet !== "undefined" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function";
  if (canUseConstructableSheets) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    (shadow as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }

  // Same id as the standalone app's mount point — reuses index.css's `#root { height: 100% }`
  // rule as-is inside the shadow tree.
  const wrapper = document.createElement("div");
  wrapper.id = "root";
  shadow.appendChild(wrapper);

  const appRef = createRef<AppHandle>();
  const root: Root = createRoot(wrapper);
  root.render(
    createElement(App, {
      ref: appRef,
      serverUrl: options.serverUrl,
      rootElement: container,
      initialTheme: options.theme,
      token: options.token,
    }),
  );

  return {
    unmount() {
      root.unmount();
    },
    setTheme(theme) {
      appRef.current?.setTheme(theme);
    },
  };
}
