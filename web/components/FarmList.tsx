"use client";

import { type Farm } from "@/lib/api";

export default function FarmList({
  farms, selectedId, onSelect, onDelete, loading
}: {
  farms: Farm[];
  selectedId?: string;
  onSelect: (f: Farm) => void;
  onDelete?: (f: Farm) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0,1,2].map(i => (
          <div key={i} className="h-14 rounded-lg bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    );
  }
  if (!farms.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02]
                      p-4 text-center text-sm text-slate-400">
        No farms yet. Fill in the form above to onboard your first one.
      </div>
    );
  }

  return (
    <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1
                   [&::-webkit-scrollbar]:w-1.5
                   [&::-webkit-scrollbar-thumb]:bg-white/10
                   [&::-webkit-scrollbar-thumb]:rounded-full">
      {farms.map(f => {
        const active = f.id === selectedId;
        return (
          <li key={f.id}>
            <div className="group relative">
              <button onClick={() => onSelect(f)}
                      className={
                        "w-full text-left rounded-xl border px-3 py-2.5 transition relative pr-9 " +
                        (active
                          ? "bg-emerald-400/[0.08] border-emerald-400/40 shadow-inner shadow-emerald-500/10"
                          : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]")
                      }>
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-emerald-400" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className={"font-medium truncate " +
                    (active ? "text-emerald-100" : "text-slate-200")}>
                    {f.farmerName}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {f.landSizeAcres} ac · {f.soilType}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  {f.latitude.toFixed(3)}, {f.longitude.toFixed(3)} · water {f.waterAvailability}
                </p>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onDelete(f); }}
                  title={`Delete ${f.farmerName}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2
                             opacity-0 group-hover:opacity-100 transition
                             text-slate-500 hover:text-red-400 p-1.5 rounded-md
                             hover:bg-red-400/10"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
