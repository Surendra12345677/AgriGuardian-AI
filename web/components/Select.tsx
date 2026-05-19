"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dark-themed dropdown that replaces the native &lt;select&gt;.
 *
 * <p>The native control renders its option list using the operating
 * system's default menu — bright white background on Windows / most
 * browsers — which clashes badly with the app's dark theme (the screen
 * the judges see shows faint, near-unreadable option labels on a white
 * sheet). This component renders the menu in-DOM, fully Tailwind-styled
 * to match the rest of the dashboard, keeps keyboard navigation
 * (arrows / Enter / Esc), and dispatches a typed value back to the
 * caller exactly like a native select would.</p>
 */
export default function Select<T extends string>({
  value, options, onChange, className,
}: {
  value: T;
  options: readonly T[] | T[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [hover, setHover] = useState<number>(() =>
    Math.max(0, options.findIndex(o => o === value))
  );
  const ref = useRef<HTMLDivElement | null>(null);

  // Click-away + escape close the menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(i: number) {
    const v = options[i];
    if (v !== undefined) onChange(v);
    setOpen(false);
  }

  return (
    <div className={"relative " + (className ?? "")} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHover(h => Math.min(options.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setHover(h => Math.max(0, h - 1));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            pick(hover);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex items-center justify-between gap-2 cursor-pointer
                   focus:border-emerald-500/60 hover:border-white/20"
      >
        <span className="truncate text-slate-100">{value}</span>
        <svg className={"h-4 w-4 text-slate-400 transition " + (open ? "rotate-180" : "")}
             viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd"/>
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg
                     border border-emerald-400/30 bg-[#0a1118] shadow-xl shadow-black/40
                     ring-1 ring-emerald-400/10 backdrop-blur-md py-1"
        >
          {options.map((o, i) => {
            const selected = o === value;
            const isHover  = i === hover;
            return (
              <li
                key={o + i}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHover(i)}
                onClick={() => pick(i)}
                className={
                  "px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-2 " +
                  (selected
                    ? "bg-emerald-400/15 text-emerald-100 font-semibold"
                    : isHover
                      ? "bg-white/10 text-slate-100"
                      : "text-slate-200")
                }
              >
                <span>{o}</span>
                {selected && <span className="text-emerald-300" aria-hidden>✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

