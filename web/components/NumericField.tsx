"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number input that lets the user edit naturally.
 *
 * <p>The naive pattern
 * {@code <input type="number" value={n} onChange={e => set(Number(e.target.value))}/>}
 * is broken for partial edits: backspacing the only digit yields
 * {@code Number("") === 0}, the controlled value snaps back to "0",
 * and the user is left with a literal "01" they cannot fix without
 * deleting both characters. We keep a string <i>draft</i> that mirrors
 * what the user is typing and only commit a parsed number to the
 * parent's state when the draft is a valid finite number. On blur we
 * clamp + sync from the prop so the displayed text always agrees with
 * the committed value when focus leaves the field.</p>
 */
export default function NumericField({
  value, onChange, min, max, step, placeholder, className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  // Keep a local string draft so partial edits like "", "0.", "0.1" don't
  // get reformatted to "0" by the parent on every keystroke.
  const [draft, setDraft] = useState<string>(formatNumber(value));
  const focused = useRef(false);

  // When the parent's value changes (and we're not currently typing),
  // mirror it into the draft so external updates (e.g. switching the
  // selected farm) are reflected.
  useEffect(() => {
    if (!focused.current) setDraft(formatNumber(value));
  }, [value]);

  function commit(s: string) {
    const trimmed = s.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") return; // wait for more input
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    let v = n;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    if (v !== value) onChange(v);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      autoComplete="off"
      placeholder={placeholder}
      className={className ?? "input"}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        // On blur, snap the visible text back to the canonical formatted
        // value so the field never shows a stale partial like "0." or "".
        const n = Number(draft.trim());
        if (!draft.trim() || !Number.isFinite(n)) {
          setDraft(formatNumber(value));
        } else {
          let v = n;
          if (min !== undefined && v < min) v = min;
          if (max !== undefined && v > max) v = max;
          if (v !== value) onChange(v);
          setDraft(formatNumber(v));
        }
      }}
      onChange={e => {
        // Accept digits, a single decimal separator, and an optional leading sign.
        const raw = e.target.value.replace(/,/g, ".");
        if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
          setDraft(raw);
          commit(raw);
        }
      }}
      step={step}
      min={min}
      max={max}
    />
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Avoid trailing ".0" noise (e.g. show "2" not "2.0").
  return Number.isInteger(n) ? String(n) : String(n);
}

