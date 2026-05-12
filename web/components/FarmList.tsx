"use client";

import { type Farm } from "@/lib/api";

export default function FarmList({
  farms, selectedId, onSelect, loading
}: {
  farms: Farm[];
  selectedId?: string;
  onSelect: (f: Farm) => void;
  loading: boolean;
}) {
  if (loading) return <div className="text-sm text-slate-500">Loading farms…</div>;
  if (!farms.length) {
    return (
      <div className="text-sm text-slate-500 italic">
        No farms yet. Create one on the left to get started.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {farms.map(f => {
        const active = f.id === selectedId;
        return (
          <li key={f.id}>
            <button onClick={() => onSelect(f)}
                    className={
                      "w-full text-left rounded-lg border px-3 py-2 transition " +
                      (active
                        ? "bg-leaf-600/10 border-leaf-600"
                        : "bg-white/70 border-emerald-100 hover:border-leaf-500")
                    }>
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.farmerName}</span>
                <span className="text-xs text-slate-500">
                  {f.landSizeAcres} acre · {f.soilType}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {f.latitude.toFixed(3)}, {f.longitude.toFixed(3)} · water {f.waterAvailability}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

