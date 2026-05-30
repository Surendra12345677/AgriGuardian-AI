"use client";

/**
 * Arize-style "agent quality" card: live score-distribution histogram + trend
 * sparkline + headline pass-rate + per-dimension eval breakdown.
 */
import { useEffect, useState } from "react";
import { api, type EvalDistribution, type EvalTrend, type EvalTrendPoint } from "@/lib/api";

export function EvalQualityCard({ refreshMs = 6000 }: { refreshMs?: number }) {
  const [dist, setDist] = useState<EvalDistribution | null>(null);
  const [trend, setTrend] = useState<EvalTrend | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const [d, t] = await Promise.all([
          api.evalDistribution(100),
          api.evalTrend(20),
        ]);
        if (!stopped) { setDist(d); setTrend(t); setErr(null); }
      } catch (e: unknown) {
        if (!stopped) setErr(e instanceof Error ? e.message : "eval feed unavailable");
      }
    }
    tick();
    const id = setInterval(tick, refreshMs);
    return () => { stopped = true; clearInterval(id); };
  }, [refreshMs]);

  const max = dist ? Math.max(1, ...dist.buckets.map(b => b.count)) : 1;
  const pass = dist?.passRate;
  const avg  = dist?.averageScore;
  const series = trend?.series ?? [];
  const scores = series.map(p => p.evalScore).filter((s): s is number => s != null);

  // Derive per-dimension averages from the trend series (evalDetails if available)
  const latest = series[series.length - 1] as (EvalTrendPoint & { evalDetails?: Record<string, number> }) | undefined;
  const dims = latest ? (latest as any).evalDetails as Record<string, number> | undefined : undefined;

  // Trend direction label
  const delta = trend?.deltaScore;
  const trendLabel = delta == null ? null : delta > 0.02 ? "improving ↑" : delta < -0.02 ? "declining ↓" : "stable →";
  const trendColor = delta == null ? "text-slate-400" : delta > 0.02 ? "text-emerald-300" : delta < -0.02 ? "text-amber-300" : "text-slate-300";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="chip">arize.evals</span>
          <span className="text-xs text-slate-400">live quality baseline</span>
        </div>
        <div className="flex items-center gap-2">
          {trendLabel && (
            <span className={`text-[10px] font-semibold ${trendColor}`}>{trendLabel}</span>
          )}
          <span className="text-[11px] text-slate-500 font-mono">
            {dist ? `${dist.scored}/${dist.count} scored` : "—"}
          </span>
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="avg score"   value={fmt(avg)}        tone="emerald" />
        <Stat label="pass rate"   value={pct(pass)}       tone="cyan" />
        <Stat label="failures"    value={dist ? String(dist.failures) : "—"} tone={(dist?.failures ?? 0) > 0 ? "amber" : "slate"} />
      </div>

      {/* Per-dimension breakdown — only shown when evalDetails available */}
      {dims && (
        <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="text-[10px] text-slate-500 font-mono mb-2 flex items-center gap-2">
            <span>eval dimensions · last run</span>
            <span className="px-1.5 py-0.5 rounded bg-violet-400/15 text-violet-300 text-[9px] font-semibold uppercase">llm-judge</span>
          </div>
          <div className="space-y-1.5">
            {([
              ["relevance",              "Relevance",              "Does the plan address the farm scenario?"],
              ["groundedness",           "Groundedness",           "Are impact numbers backed by tool outputs?"],
              ["agronomicCorrectness",   "Agronomic Correctness",  "Does the crop fit season + soil + location?"],
              ["hallucinationRisk",      "Hallucination Risk",     "1 = no fabrication detected"],
            ] as [string, string, string][]).map(([key, label, tip]) => {
              const v = dims[key] ?? dims[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
              if (v == null) return null;
              const pct100 = Math.round(v * 100);
              const color = v >= 0.8 ? "bg-emerald-400" : v >= 0.6 ? "bg-cyan-400" : "bg-amber-400";
              return (
                <div key={key} title={tip}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-400">{label}</span>
                    <span className={v >= 0.8 ? "text-emerald-300" : v >= 0.6 ? "text-cyan-300" : "text-amber-300"}>
                      {v.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sparkline */}
      <div className="mb-3">
        <div className="text-[10px] text-slate-500 font-mono mb-1">eval.score.aggregate · last {scores.length} runs</div>
        <Sparkline values={scores} />
        {trend?.deltaScore != null && trend.series.length >= 2 && (
          <div className="text-[10px] text-slate-500 mt-1">
            Δ first→latest:{" "}
            <span className={trend.deltaScore >= 0 ? "text-emerald-300" : "text-amber-300"}>
              {trend.deltaScore >= 0 ? "+" : ""}{trend.deltaScore.toFixed(3)}
            </span>
          </div>
        )}
      </div>

      {/* Histogram */}
      <div>
        <div className="text-[10px] text-slate-500 font-mono mb-1">score distribution · 10 buckets</div>
        <div className="flex items-end gap-1 h-20">
          {(dist?.buckets ?? new Array(10).fill({ count: 0, label: "" })).map((b, i) => {
            const h = max ? Math.max(2, (b.count / max) * 100) : 2;
            const passing = i >= 7;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${passing ? "bg-emerald-400/70" : i >= 6 ? "bg-cyan-400/60" : "bg-amber-400/50"}`}
                  style={{ height: `${h}%` }}
                  title={`${b.label}  count=${b.count}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
          <span>0.0</span><span>0.5</span><span>1.0</span>
        </div>
      </div>

      {/* What judges see in Arize */}
      <div className="mt-3 rounded-lg border border-violet-400/10 bg-violet-400/[0.03] px-3 py-2 text-[10px] text-slate-400 leading-relaxed">
        <span className="text-violet-300 font-semibold">In Arize AX: </span>
        Each bar = one agent run scored by Gemini LLM-as-judge on 4 dimensions.
        Spans tagged <code className="text-violet-200">eval.label=pass/fail</code> stream via OTLP in real time.
        Click any trace ID above to open the full span tree in Arize.
      </div>

      {err && (
        <div className="text-[11px] text-amber-400/80 mt-3">
          {err} — once a recommendation runs, scores flow here via the same
          OTel pipeline that ships them to Arize AX.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "cyan" | "amber" | "slate" }) {
  const color =
    tone === "emerald" ? "text-emerald-300" :
    tone === "cyan"    ? "text-cyan-300" :
    tone === "amber"   ? "text-amber-300" :
                         "text-slate-300";
  return (
    <div className="rounded-md bg-white/[0.03] border border-white/10 px-2 py-1.5">
      <div className="text-[10px] text-slate-500 font-mono">{label}</div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <div className="h-8 grid place-items-center text-[10px] text-slate-500">no runs yet</div>;
  }
  const w = 240, h = 32, pad = 2;
  const min = Math.min(...values, 0.5);
  const max = Math.max(...values, 1.0);
  const span = Math.max(0.01, max - min);
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = "M" + pts.join(" L");
  const last = values[values.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block w-full">
      <path d={path} fill="none" stroke="rgb(110 231 183)" strokeWidth="1.5" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill="rgb(110 231 183)" />
      <text x={w - 4} y={10} textAnchor="end" fontSize="9" fill="rgb(148 163 184)" fontFamily="monospace">
        {last.toFixed(3)}
      </text>
    </svg>
  );
}

function fmt(v: number | null | undefined) { return v == null ? "—" : v.toFixed(3); }
function pct(v: number | null | undefined) { return v == null ? "—" : `${Math.round(v * 100)}%`; }
