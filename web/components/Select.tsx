"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Dark-themed dropdown — renders its list via a React portal at document.body
 * using `position:fixed` coordinates so it escapes any backdrop-filter /
 * transform stacking context (backdrop-blur-md on .card clips absolute
 * children, causing the list to show only 1 visible row).
 */
export default function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  displayMap,
}: {
  value: T;
  options: readonly T[] | T[];
  onChange: (v: T) => void;
  className?: string;
  displayMap?: Partial<Record<T, string>>;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o === value))
  );
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  function lbl(o: T) {
    return displayMap?.[o] ?? o;
  }

  function calcPos() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropStyle({ position: "fixed", top: r.bottom + 4, left: r.left, width: r.width, zIndex: 99999 });
    }
  }

  function toggle() { calcPos(); setOpen((o) => !o); }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() { setOpen(false); }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => Math.min(options.length - 1, h + 1)); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); setHover((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter")     { e.preventDefault(); pick(hover); }
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [open, hover]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(i: number) {
    const v = options[i];
    if (v !== undefined) onChange(v);
    setOpen(false);
  }

  const dropdown =
    open && mounted
      ? createPortal(
          <ul
            role="listbox"
            style={dropStyle}
            className="max-h-60 overflow-auto rounded-xl border border-emerald-400/30
                       bg-[#0b1520] shadow-2xl shadow-black/60 ring-1 ring-white/5 py-1"
          >
            {options.map((o, i) => {
              const sel = o === value;
              const hov = i === hover;
              return (
                <li
                  key={o + i}
                  role="option"
                  aria-selected={sel}
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={(e) => { e.preventDefault(); pick(i); }}
                  className={
                    "px-3 py-2 text-sm cursor-pointer select-none flex items-center justify-between gap-2 " +
                    (sel
                      ? "bg-emerald-500/20 text-emerald-100 font-semibold"
                      : hov ? "bg-white/10 text-slate-100" : "text-slate-300")
                  }
                >
                  <span>{lbl(o)}</span>
                  {sel && (
                    <svg className="h-3.5 w-3.5 text-emerald-300 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd"/>
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <div className={"relative " + (className ?? "")}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex items-center justify-between gap-2 cursor-pointer
                   hover:border-white/20 focus:border-emerald-500/60"
      >
        <span className="truncate text-slate-100">{lbl(value)}</span>
        <svg
          className={"h-4 w-4 text-slate-400 shrink-0 transition-transform duration-150 " + (open ? "rotate-180" : "")}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd"/>
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
