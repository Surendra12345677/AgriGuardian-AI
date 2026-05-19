"use client";

/**
 * Locale picker — restricted to English + the six EU languages the
 * hackathon judges (US / Europe) are most likely to read. Indian
 * regional scripts have been removed from the panel to keep the
 * judge-facing dashboard uncluttered and Western-readable; the backend
 * prompt still accepts any ISO code so a future build can re-enable
 * them by extending this list without touching the agent.
 */
export type Lang =
  | "en"
  | "es" | "fr" | "de" | "it" | "pt" | "nl";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "es", label: "Español",    flag: "🇪🇸" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "it", label: "Italiano",   flag: "🇮🇹" },
  { code: "pt", label: "Português",  flag: "🇵🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
];

export default function LanguageSelector({
  value, onChange,
}: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LANGS.map(l => (
        <button key={l.code}
                type="button"
                onClick={() => onChange(l.code)}
                className={
                  "rounded-md px-3 py-1.5 text-sm border transition inline-flex items-center gap-1.5 " +
                  (value === l.code
                    ? "bg-emerald-400/20 border-emerald-400/60 text-emerald-100 font-semibold"
                    : "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20 hover:text-slate-100")
                }>
          <span aria-hidden className="text-xs">{l.flag}</span>{l.label}
        </button>
      ))}
    </div>
  );
}

