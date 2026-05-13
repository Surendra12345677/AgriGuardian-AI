"use client";

import { useEffect, useState } from "react";

type LinkDef = { label: string; section: string; tab?: "plan" | "scenarios" | "doctor" };

const LINKS: LinkDef[] = [
  { label: "Live Agent",   section: "workspace", tab: "plan" },
  { label: "What-if",      section: "workspace", tab: "scenarios" },
  { label: "Plant Doctor", section: "workspace", tab: "doctor" },
  { label: "How it works", section: "how" },
  { label: "Stack",        section: "stack" },
];

export default function Navbar() {
  const [active, setActive] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = Array.from(new Set(LINKS.map(l => l.section)));
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  function go(l: LinkDef) {
    if (l.tab) {
      window.dispatchEvent(new CustomEvent("ag:tab", { detail: l.tab }));
    }
    document.getElementById(l.section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  }

  // Active highlight: workspace uses sub-tab via a shared tab state we read from a data attr.
  const [activeTab, setActiveTab] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: any) => setActiveTab(e.detail);
    window.addEventListener("ag:tab-changed", handler);
    return () => window.removeEventListener("ag:tab-changed", handler);
  }, []);

  function isActive(l: LinkDef) {
    if (l.section !== active) return false;
    if (l.tab && activeTab && l.tab !== activeTab) return false;
    return true;
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
      <div className="mx-auto max-w-7xl px-5 lg:px-8 h-16 flex items-center justify-between gap-4">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="flex items-center gap-3 shrink-0">
          <span className="relative grid place-items-center h-9 w-9 rounded-xl
                           bg-gradient-to-br from-emerald-400 to-emerald-600
                           text-slate-950 font-black shadow-lg shadow-emerald-500/30">
            AG
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400
                             ring-2 ring-[#05070b] animate-pulse" />
          </span>
          <div className="leading-tight text-left">
            <div className="font-semibold text-slate-100 tracking-tight">
              AgriGuardian <span className="text-emerald-400">AI</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Plan · Reason · Act
            </div>
          </div>
        </button>

        <nav className="hidden lg:flex items-center gap-1 bg-white/[0.03] border border-white/5
                        rounded-full p-1">
          {LINKS.map(l => {
            const a = isActive(l);
            return (
              <button key={l.label} onClick={() => go(l)}
                      className={
                        "px-3.5 py-1.5 text-sm rounded-full transition " +
                        (a
                          ? "bg-emerald-400/15 text-emerald-200 shadow-inner shadow-emerald-500/10"
                          : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]")
                      }>
                {l.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a className="hidden sm:inline-flex btn-ghost text-xs !py-1.5 !px-3"
             href="/swagger-ui.html" target="_blank" rel="noreferrer">API</a>
          <a className="hidden sm:inline-flex btn-ghost text-xs !py-1.5 !px-3"
             href="https://github.com/Surendra12345677/AgriGuardian-AI"
             target="_blank" rel="noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.73.5.5 5.74.5 12.04c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.37-3.88-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a10.95 10.95 0 0 1 5.74 0c2.19-1.48 3.15-1.17 3.15-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.7 5.36-5.27 5.65.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56 4.56-1.53 7.85-5.84 7.85-10.93C23.5 5.74 18.27.5 12 .5z" />
            </svg>
            GitHub
          </a>
          <button onClick={() => go({ label: "x", section: "workspace", tab: "plan" })}
                  className="btn-primary text-sm !py-2 !px-3.5">
            Try the agent
          </button>
          <button className="lg:hidden btn-ghost !p-2"
                  aria-label="Menu" onClick={() => setOpen(o => !o)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open
                ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/5 bg-[#05070b]/95 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-5 py-3 flex flex-col gap-1">
            {LINKS.map(l => (
              <button key={l.label} onClick={() => go(l)}
                      className="text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/[0.04]">
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
