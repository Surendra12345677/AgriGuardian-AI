"use client";

export type Lang = "en" | "hi" | "mr" | "ta" | "te" | "bn" | "pa";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "bn", label: "বাংলা" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
];

export default function LanguageSelector({
  value, onChange,
}: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LANGS.map(l => (
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
      ))}
    </div>
  );
}

