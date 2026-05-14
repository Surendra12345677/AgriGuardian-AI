"use client";

export type Lang =
  | "en" | "hi" | "mr" | "ta" | "te" | "bn" | "pa"
  // European locales — added so EU smallholders (Spain, France, Germany,
  // Italy, Portugal, Netherlands) can read the agent's plan in their own
  // language. The backend prompt also branches on these codes.
  | "es" | "fr" | "de" | "it" | "pt" | "nl";

const LANGS: { code: Lang; label: string; group: "in" | "eu" }[] = [
  { code: "en", label: "English",   group: "in" },
  { code: "hi", label: "हिन्दी",      group: "in" },
  { code: "mr", label: "मराठी",      group: "in" },
  { code: "ta", label: "தமிழ்",      group: "in" },
  { code: "te", label: "తెలుగు",     group: "in" },
  { code: "bn", label: "বাংলা",       group: "in" },
  { code: "pa", label: "ਪੰਜਾਬੀ",      group: "in" },
  { code: "es", label: "Español",   group: "eu" },
  { code: "fr", label: "Français",  group: "eu" },
  { code: "de", label: "Deutsch",   group: "eu" },
  { code: "it", label: "Italiano",  group: "eu" },
  { code: "pt", label: "Português", group: "eu" },
  { code: "nl", label: "Nederlands",group: "eu" },
];

export default function LanguageSelector({
  value, onChange,
}: { value: Lang; onChange: (l: Lang) => void }) {
  const indian   = LANGS.filter(l => l.group === "in");
  const european = LANGS.filter(l => l.group === "eu");
  const renderBtn = (l: { code: Lang; label: string }) => (
    <button key={l.code}
            onClick={() => onChange(l.code)}
            className={
              "rounded-md px-3 py-1.5 text-sm border transition " +
              (value === l.code
                ? "bg-emerald-400/20 border-emerald-400/60 text-emerald-200 font-semibold"
                : "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20 hover:text-slate-100")
            }>
      {l.label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {indian.map(renderBtn)}
      <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold pr-1">EU</span>
      {european.map(renderBtn)}
    </div>
  );
}

