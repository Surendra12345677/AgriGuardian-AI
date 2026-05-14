"use client";
import { useEffect } from "react";

/**
 * Tiny global side-effect: when a <input type="number"> is focused and
 * the user scrolls the mouse wheel, Chrome/Firefox change the value as
 * if they hit the up/down arrow. That's terrible UX in a long form —
 * scrolling the page to read a field below silently changes the number
 * above. We blur the focused number input on wheel so the page just
 * scrolls normally.
 */
export default function NumberInputGuards() {
  useEffect(() => {
    function onWheel() {
      const el = document.activeElement as HTMLInputElement | null;
      if (el && el.tagName === "INPUT" && el.type === "number") el.blur();
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}

