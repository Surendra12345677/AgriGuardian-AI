"use client";

import { useState } from "react";
import { api, type Farm, type Scenario } from "@/lib/api";
import type { Lang } from "./LanguageSelector";

const SCENARIOS: { key: Scenario; label: string; icon: string; tone: string }[] = [
  { key: "BASELINE",      label: "Baseline",       icon: "🟢", tone: "border-emerald-400/40 text-emerald-200" },
  { key: "DROUGHT",       label: "Drought",        icon: "🔥", tone: "border-amber-400/40 text-amber-200" },
  { key: "PRICE_CRASH",   label: "Price crash",    icon: "📉", tone: "border-rose-400/40 text-rose-200" },
  { key: "PEST_OUTBREAK", label: "Pest outbreak",  icon: "🐛", tone: "border-fuchsia-400/40 text-fuchsia-200" },
];

type Result = { scenario: Scenario; advice: string; confidence: number; impact?: any; crop?: string };

export default function WhatIfScenarios({
  farm, language,
}: { farm?: Farm; language: Lang }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    if (!farm) return;
    setBusy(true); setError(null); setResults([]);
    try {
      // Run sequentially to avoid hammering the Gemini quota
      const out: Result[] = [];
      for (const s of SCENARIOS) {
        const rec = await api.recommend({
          farmId: farm.id,
          latitude: farm.latitude,
          longitude: farm.longitude,
          language,
          scenario: s.key,
        });
        let parsed: any = {};
        try { parsed = JSON.parse(rec.reasoning); } catch {}
        out.push({
          scenario: s.key,
          advice: parsed.advice ?? rec.reasoning?.slice(0, 200) ?? "",
          confidence: parsed.confidence ?? rec.confidenceScore ?? 0,
          impact: parsed.impact,
          crop: parsed.crop,
        });
        setResults([...out]); // progressive render
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="label">What-if simulator</div>
          <h3 className="text-lg font-semibold text-slate-100">Stress-test the plan against 4 realities</h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-md">
            The agent re-runs the full plan for each scenario so the farmer sees how robust the strategy is.
          </p>
        </div>
        <button onClick={runAll} disabled={busy || !farm} className="btn-primary">
          {busy ? "Running scenarios…" : "▶ Run all scenarios"}
        </button>
      </div>

      {error && <p className="text-sm text-red-300 mt-3">{error}</p>}

      {(busy || results.length > 0) && (
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SCENARIOS.map((s, i) => {
            const r = results[i];
            const done = !!r;
            return (
              <div key={s.key}
                   className={`rounded-xl border bg-white/[0.03] p-3 transition
                               ${done ? s.tone : "border-white/10 text-slate-500"}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <span>{s.icon}</span> {s.label}
                  </div>
                  {done ? (
                    <span className="text-[10px] font-mono">
                      {Math.round(r.confidence * 100)}%
                    </span>
                  ) : busy ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  ) : null}
                </div>
                {done ? (
                  <>
                    {r.crop && (
                      <div className="mt-1.5 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
                        → {r.crop}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-300 mt-1 line-clamp-4 leading-snug">
                      {r.advice}
                    </p>
                    {r.impact?.extraIncomeInr != null && (
                      <div className="mt-2 text-[10px] text-slate-400">
                        income Δ:{" "}
                        <span className="text-slate-100 font-semibold">
                          ₹{(r.impact.extraIncomeInr / 1000).toFixed(1)}k
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <div className="h-2 rounded bg-white/[0.06]" />
                    <div className="h-2 w-2/3 rounded bg-white/[0.06]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

