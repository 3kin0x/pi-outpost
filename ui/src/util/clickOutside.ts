import { useEffect, useRef, type RefObject } from "react";

/**
 * Whether a pointer event started inside `node`.
 *
 * `event.target` is retargeted at a shadow boundary: a listener on `document`
 * sees the widget's host element, never the button that was really pressed. So
 * `node.contains(event.target)` answers "no" for every click inside the embed,
 * and a menu that closes on an outside click closes on all of them — including
 * the click meant to pick an item, which mousedown kills before it can fire.
 *
 * The composed path keeps each node the event travelled through, shadow trees
 * included, so it gives the same answer in the widget as in the standalone app.
 */
export function eventHitsNode(event: Event, node: Node | null): boolean {
  if (!node) return false;
  const path = event.composedPath();
  if (path.length > 0) return path.includes(node);
  // No composed path (a synthetic event in a test) — the plain question still holds.
  const target = event.target as Node | null;
  return target !== null && node.contains(target);
}

/** Ref for the menu's outermost element; a pointer press anywhere else closes it. */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(onClose: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !eventHitsNode(event, ref.current)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}
