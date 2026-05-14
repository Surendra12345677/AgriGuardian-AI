"use client";

import { useEffect, useState } from "react";

type LinkDef = { label: string; section: string; icon?: string };

const LINKS: LinkDef[] = [
  { label: "Home",         section: "home",      icon: "🏠" },
  { label: "Onboard",      section: "onboard",   icon: "👤" },
  { label: "Plan",         section: "plan",      icon: "🌾" },
  { label: "What-if",      section: "scenarios", icon: "🌧️" },
  { label: "Plant Doctor", section: "doctor",    icon: "🩺" },
  { label: "How it works", section: "how",       icon: "⚙️" },
  { label: "Stack",        section: "stack",     icon: "🧱" },
];

/**
 * Derive the active section from `location.hash`. Defaults to "home".
 * Exported so the page can mirror the same routing logic without duplicating
 * the hash parser.
 */
export function useHashRoute(): [string, (s: string) => void] {
  const [hash, setHash] = useState<string>("home");
  useEffect(() => {
    const read = () => {
      const h = (window.location.hash || "#home").replace(/^#/, "");
      setHash(h || "home");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function nav(s: string) {
    if (typeof window === "undefined") return;
    window.location.hash = s;
    // Also scroll back to the top so the new view starts at the header.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return [hash, nav];
}

export default function Navbar() {
  const [active, nav] = useHashRoute();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function go(l: LinkDef) {
    nav(l.section);
    setOpen(false);
  }

  return (
    <header
      className={
        "sticky top-0 z-40 transition-all border-b " +
        (scrolled
          ? "border-white/10 bg-[#05070b]/85 backdrop-blur-xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]"
          : "border-transparent bg-transparent backdrop-blur-md")
      }
    >
      <div className="mx-auto w-full max-w-[1760px] 2xl:max-w-[2100px] 3xl:max-w-[2560px] px-5 lg:px-8 xl:px-12 2xl:px-16 h-20 xl:h-[88px] 2xl:h-24 flex items-center justify-between gap-5">
        <button onClick={() => go({ label: "Home", section: "home" })}
                className="flex items-center gap-3 xl:gap-3.5 shrink-0">
          <span className="relative grid place-items-center h-11 w-11 xl:h-12 xl:w-12 2xl:h-14 2xl:w-14 rounded-2xl
                           bg-gradient-to-br from-emerald-400 to-emerald-600
                           text-slate-950 font-black text-lg xl:text-xl 2xl:text-2xl shadow-lg shadow-emerald-500/30">
            AG
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-400
                             ring-2 ring-[#05070b] animate-pulse" />
          </span>
          <div className="leading-tight text-left">
            <div className="font-semibold text-slate-100 tracking-tight text-base sm:text-lg xl:text-xl 2xl:text-2xl">
              AgriGuardian <span className="text-emerald-400">AI</span>
            </div>
            <div className="text-[11px] xl:text-[12px] 2xl:text-[13px] uppercase tracking-[0.2em] text-slate-500">
              Plan · Reason · Act
            </div>
          </div>
        </button>

        <nav className="hidden lg:flex items-center gap-1.5 bg-white/[0.03] border border-white/5
                        rounded-full p-1.5 xl:p-2">
          {LINKS.map(l => {
            const a = l.section === active;
            return (
              <button key={l.label} onClick={() => go(l)}
                      className={
                        "px-4 py-2 xl:px-5 xl:py-2.5 2xl:px-6 2xl:py-3 text-[15px] xl:text-base 2xl:text-[17px] font-medium rounded-full transition flex items-center gap-2 " +
                        (a
                          ? "bg-emerald-400/15 text-emerald-200 shadow-inner shadow-emerald-500/10"
                          : "text-slate-300 hover:text-slate-50 hover:bg-white/[0.05]")
                      }>
                <span className="text-base xl:text-lg 2xl:text-xl opacity-90" aria-hidden>{l.icon}</span>
                {l.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 xl:gap-3">
          <a className="hidden sm:inline-flex btn-ghost text-sm xl:text-[15px] 2xl:text-base !py-2 !px-3.5 xl:!py-2.5 xl:!px-4 2xl:!py-3 2xl:!px-5"
             href="/swagger-ui.html" target="_blank" rel="noreferrer">API</a>
          <a className="hidden sm:inline-flex btn-ghost text-sm xl:text-[15px] 2xl:text-base !py-2 !px-3.5 xl:!py-2.5 xl:!px-4 2xl:!py-3 2xl:!px-5 items-center gap-1.5"
             href="https://github.com/Surendra12345677/AgriGuardian-AI"
             target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.73.5.5 5.74.5 12.04c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.37-3.88-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a10.95 10.95 0 0 1 5.74 0c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.7 5.36-5.27 5.65.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.56-1.53 7.85-5.84 7.85-10.93C23.5 5.74 18.27.5 12 .5z" />
            </svg>
            GitHub
          </a>
          <button onClick={() => go({ label: "Get started", section: "onboard" })}
                  className="btn-primary text-sm xl:text-[15px] 2xl:text-base !py-2.5 !px-4 xl:!py-3 xl:!px-5 2xl:!py-3.5 2xl:!px-6">
            Get started
          </button>
          <button className="lg:hidden btn-ghost !p-2.5"
                  aria-label="Menu" onClick={() => setOpen(o => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open
                ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/5 bg-[#05070b]/95 backdrop-blur-xl">
          <div className="mx-auto max-w-[1760px] 2xl:max-w-[2100px] 3xl:max-w-[2560px] px-5 lg:px-8 xl:px-12 2xl:px-16 py-3 flex flex-col gap-1">
            {LINKS.map(l => {
              const a = l.section === active;
              return (
                <button key={l.label} onClick={() => go(l)}
                        className={
                          "text-left px-3.5 py-2.5 rounded-lg text-base flex items-center gap-2.5 " +
                          (a
                            ? "bg-emerald-400/15 text-emerald-200"
                            : "text-slate-200 hover:bg-white/[0.05]")
                        }>
                  <span className="text-lg" aria-hidden>{l.icon}</span>{l.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
