"use client";

import { useState } from "react";
import { api, type Farm, type Recommendation } from "@/lib/api";

type Parsed = {
  advice?: string;
  tasks?: (string | { day?: number; action?: string; why?: string })[];
  confidence?: number;
};

export default function AgentPanel({ farm }: { farm?: Farm }) {
  const [crop, setCrop]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rec,  setRec]    = useState<Recommendation | null>(null);

  async function ask() {
    if (!farm) return;
    setBusy(true); setError(null); setRec(null);
    try {
      const out = await api.recommend({
        farmId:    farm.id,
        latitude:  farm.latitude,
        longitude: farm.longitude,
        preferredCrop: crop || undefined
      });
      setRec(out);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const parsed: Parsed = (() => {
    if (!rec?.reasoning) return {};
    try { return JSON.parse(rec.reasoning); } catch { return { advice: rec.reasoning }; }
  })();

  return (
    <div className="bg-white/80 rounded-xl shadow-sm border border-emerald-100 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-emerald-800 text-lg">Ask the agent</h2>
        <p className="text-xs text-slate-500">
          Triggers the plan → tools → reflect loop. Each run is traced to Arize AX
          and (when MCP is enabled) reads from past evals via the Arize MCP server.
        </p>
      </div>

      {!farm ? (
        <p className="text-sm text-slate-500 italic">
          Select a farm from the list to ask the agent for a plan.
        </p>
      ) : (
        <>
          <div className="flex gap-2 items-end">
            <label className="text-xs text-slate-600 flex-1 space-y-1 block">
              <span>Preferred crop (optional)</span>
              <input className="w-full rounded-md border border-emerald-200 bg-white/70
                                px-3 py-2 text-sm focus:outline-none focus:ring-2
                                focus:ring-leaf-500"
                     placeholder="e.g. maize, soybean, onion"
                     value={crop}
                     onChange={e => setCrop(e.target.value)} />
            </label>
            <button onClick={ask} disabled={busy}
                    className="rounded-lg bg-leaf-600 hover:bg-leaf-700 text-white
                               font-medium px-4 py-2 disabled:opacity-50">
              {busy ? "Planning…" : "Plan my season"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {rec && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>rec id: <code>{rec.id}</code></span>
                <span>
                  confidence:&nbsp;
                  <span className="font-semibold text-emerald-700">
                    {(rec.confidenceScore * 100).toFixed(0)}%
                  </span>
                </span>
              </div>

              {parsed.advice && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-sm whitespace-pre-line">{parsed.advice}</p>
                </div>
              )}

              {Array.isArray(parsed.tasks) && parsed.tasks.length > 0 && (
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  {parsed.tasks.map((t, i) => {
                    if (typeof t === "string") return <li key={i}>{t}</li>;
                    return (
                      <li key={i}>
                        <span className="font-medium">
                          {t.day ? `Day ${t.day}: ` : ""}{t.action}
                        </span>
                        {t.why && <span className="text-slate-500"> — {t.why}</span>}
                      </li>
                    );
                  })}
                </ol>
              )}

              {rec.traceId && (
                <p className="text-[11px] text-slate-400">
                  trace: <code>{rec.traceId}</code>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

