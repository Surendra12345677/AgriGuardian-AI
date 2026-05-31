"use client";

import { useEffect, useState } from "react";
import { api, type EvalDistribution, type EvalTrend } from "@/lib/api";

const DIMS: [string, string, string, string][] = [
  ["relevance",            "Plan relevance",      "Does the plan match this farm's soil, location, and season?",             "Checks the plan is for THIS farm, not a generic one"],
  ["groundedness",         "Numbers are real",    "Are yield/income estimates backed by real tool data?",                    "Prevents made-up numbers"],
  ["agronomicCorrectness", "Right crop choice",   "Is the recommended crop a good fit for this season + soil + location?",   "Agronomist-level accuracy check"],
  ["hallucinationRisk",    "No false information","Did the AI invent anything that wasn't in the tools' real data?",         "1.0 = nothing was fabricated"],
];

export function EvalQualityCard({ refreshMs = 6000 }: { refreshMs?: number }) {
  const [dist,        setDist]        = useState<EvalDistribution | null>(null);
  const [trend,       setTrend]       = useState<EvalTrend | null>(null);
  const [arizeStatus, setArizeStatus] = useState<{ exporterEnabled: boolean; mcpEnabled: boolean; projectName: string; otlpEndpoint: string; spaceIdHint: string } | null>(null);
  const [err,         setErr]         = useState<string | null>(null);

  useEffect(() => {
    api.arizeStatus().then(setArizeStatus).catch(() => {});
  }, []);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const [d, t] = await Promise.all([api.evalDistribution(100), api.evalTrend(20)]);
        if (!stopped) { setDist(d); setTrend(t); setErr(null); }
      } catch (e: unknown) {
        if (!stopped) setErr(e instanceof Error ? e.message : "eval feed unavailable");
      }
    }
    tick();
    const id = setInterval(tick, refreshMs);
    return () => { stopped = true; clearInterval(id); };
  }, [refreshMs]);

  const bucketMax  = dist ? Math.max(1, ...dist.buckets.map(b => b.count)) : 1;
  const pass       = dist?.passRate;
  const avg        = dist?.averageScore;
  const series     = trend?.series ?? [];
  const scores     = series.map(p => p.evalScore).filter((s): s is number => s != null);
  const latest     = series[series.length - 1] as (typeof series[number] & { evalDetails?: Record<string, number | string> }) | undefined;
  const dims       = latest?.evalDetails as Record<string, number | string> | undefined;
  const judgeUsed  = (dims?.judge as string) ?? latest?.judge;
  const delta      = trend?.deltaScore ?? null;

  const isConnected = arizeStatus?.exporterEnabled ?? false;
  const projectName = arizeStatus?.projectName ?? process.env.NEXT_PUBLIC_ARIZE_PROJECT_NAME ?? "agriguardian-ai";
  const spaceId     = arizeStatus?.spaceIdHint  ?? process.env.NEXT_PUBLIC_ARIZE_SPACE_ID    ?? "";
  const arizeBase   = spaceId ? `https://app.arize.com/organizations/${spaceId}` : "https://app.arize.com";
  const arizeUrl    = `${arizeBase}/projects/${projectName}/traces`;

  const trendBadge =
    delta == null   ? null
    : delta > 0.02  ? { label: "Getting better ↑", color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20" }
    : delta < -0.02 ? { label: "Needs attention ↓", color: "text-amber-300 bg-amber-400/10 border-amber-400/20" }
    : { label: "Consistent →", color: "text-slate-300 bg-white/[0.04] border-white/10" };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">🔬</span>
            <span className="text-[14px] font-semibold text-slate-100">Plan Quality Monitor</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-400/15 text-violet-300 font-semibold uppercase tracking-wide border border-violet-400/20">
              Arize AI
            </span>
            {arizeStatus != null && (
              isConnected
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wide border border-emerald-400/20 animate-pulse">live</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-400/10 text-slate-400 font-semibold uppercase tracking-wide border border-slate-400/15">offline</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Every plan is auto-scored by a second AI judge and sent to Arize AX via OTLP
          </p>
        </div>
        {dist && (
          <span className="shrink-0 text-[11px] text-slate-500 font-mono bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full">
            {dist.scored} scored
          </span>
        )}
      </div>

      {/* ── Overall stats ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Overall score"  value={fmt(avg)}   tone="emerald" tip="Average quality score (0–1)" />
        <Stat label="Plans passing"  value={pct(pass)}  tone="cyan"    tip="% plans scoring ≥ 0.70" />
        <Stat label="Failed plans"   value={dist ? String(dist.failures) : "—"}
              tone={(dist?.failures ?? 0) > 0 ? "amber" : "slate"}
              tip="Plans scoring below 0.60" />
      </div>

      {/* Trend badge */}
      {trendBadge && (
        <div className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full border ${trendBadge.color}`}>
          📈 Quality trend: {trendBadge.label}
          {delta != null && (
            <span className="font-mono text-[10px] opacity-70">
              ({delta >= 0 ? "+" : ""}{delta.toFixed(3)})
            </span>
          )}
        </div>
      )}

      {/* ── Score over time chart ── */}
      {scores.length > 0 && (
        <div>
          <div className="text-[11px] text-slate-400 font-medium mb-2">
            📊 Quality score — last {scores.length} plans
          </div>
          <Sparkline values={scores} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>Oldest</span>
            <span>Most recent</span>
          </div>
        </div>
      )}

      {/* ── 4 quality dimensions (always visible, no tooltips) ── */}
      {dims ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[12px] font-semibold text-slate-300">✅ Last plan&apos;s quality checks</span>
            {judgeUsed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/15 font-mono ml-auto">
                {judgeUsed}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {DIMS.map(([key, label]) => {
              const v = typeof dims[key] === "number" ? dims[key] as number
                      : typeof dims[key.replace(/([A-Z])/g, "_$1").toLowerCase()] === "number"
                        ? dims[key.replace(/([A-Z])/g, "_$1").toLowerCase()] as number
                        : undefined;
              if (v == null) return null;
              const pct100   = Math.round(v * 100);
              const barColor = v >= 0.8 ? "bg-emerald-400" : v >= 0.6 ? "bg-cyan-400" : "bg-amber-400";
              const txtColor = v >= 0.8 ? "text-emerald-300" : v >= 0.6 ? "text-cyan-300" : "text-amber-300";
              const ico      = v >= 0.8 ? "✅" : v >= 0.6 ? "🟡" : "⚠️";
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{ico}</span>
                      <span className="text-[12px] font-medium text-slate-200">{label}</span>
                    </div>
                    <span className={`text-[13px] font-bold tabular-nums ${txtColor}`}>{pct100}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[12px] text-slate-400 font-medium mb-2.5">🔍 What gets checked (shown after first plan)</div>
          <div className="space-y-2">
            {DIMS.map(([, label, , detail]) => (
              <div key={label} className="flex items-start gap-2 text-[11px] text-slate-400">
                <span className="mt-0.5 text-violet-400 shrink-0">◆</span>
                <span><span className="text-slate-300 font-medium">{label}</span> — {detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Arize details (collapsible) — histogram + explanation + nav steps ── */}
      <details className="group rounded-xl border border-violet-400/15 bg-violet-400/[0.04] overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer flex items-center gap-2 text-[12px] font-medium text-violet-300 select-none hover:text-violet-200 list-none">
          <span>🔗</span>
          <span>View traces in Arize AX</span>
          <span className="ml-auto text-[10px] text-slate-500 font-normal group-open:hidden">project: {projectName}</span>
          <span className="ml-auto text-[10px] text-slate-500 font-normal hidden group-open:inline">‹ collapse</span>
        </summary>
        <div className="border-t border-violet-400/10 px-4 pb-4 pt-3 space-y-4">

          {/* Score distribution histogram */}
          {dist && (
            <div>
              <div className="text-[11px] text-slate-400 font-medium mb-2">
                📉 Score distribution · {dist.buckets.length} buckets
              </div>
              <div className="flex items-end gap-0.5 h-12">
                {dist.buckets.map((b, i) => {
                  const barH = bucketMax ? Math.max(4, (b.count / bucketMax) * 100) : 4;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group/bar relative">
                      <div
                        className={`w-full rounded-sm ${i >= 7 ? "bg-emerald-400/70" : i >= 6 ? "bg-cyan-400/60" : "bg-amber-400/50"}`}
                        style={{ height: `${barH}%` }}
                      />
                      {/* custom tooltip on hover — no native browser popup */}
                      <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[9px] bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/bar:opacity-100 pointer-events-none z-10 transition-opacity">
                        {b.label}: {b.count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>Low (0.0)</span>
                <span className="text-emerald-600">High (1.0)</span>
              </div>
              <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                In <span className="text-violet-300 font-medium">Arize AX</span>: Each bar = one agent run scored by Gemini LLM-as-judge on 4 dimensions.
                Spans tagged <code className="text-emerald-300 text-[10px]">eval.label=pass/fail</code> stream via OTLP in real time.
                Click any trace ID above to open the full span tree in Arize.
              </p>
            </div>
          )}

          {/* Navigation steps */}
          <div className="text-[11px] text-slate-400 space-y-1.5">
            <div className="flex gap-2"><span className="text-violet-300 shrink-0">①</span><span>Go to <span className="font-mono text-slate-200">app.arize.com</span> and log in</span></div>
            <div className="flex gap-2"><span className="text-violet-300 shrink-0">②</span><span>Select project <span className="font-mono text-emerald-300">{projectName}</span></span></div>
            <div className="flex gap-2"><span className="text-violet-300 shrink-0">③</span><span>Click <span className="text-slate-100 font-medium">Traces</span> — every agent run is here</span></div>
            <div className="flex gap-2"><span className="text-violet-300 shrink-0">④</span><span>Click any trace to see all spans, tool I/O, and eval scores</span></div>
          </div>
          <a href={arizeUrl} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-violet-400/40 text-violet-200 hover:bg-violet-400/10 transition font-medium">
            Open Arize AX →
          </a>
        </div>
      </details>

      {err && (
        <div className="text-[11px] text-amber-400/80 rounded-xl border border-amber-400/10 bg-amber-400/[0.04] px-4 py-2.5">
          Quality monitor offline — scores appear after the first plan runs.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, tip }: { label: string; value: string; tone: "emerald" | "cyan" | "amber" | "slate"; tip?: string }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "cyan" ? "text-cyan-300" : tone === "amber" ? "text-amber-300" : "text-slate-300";
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-3 text-center" title={tip}>
      <div className={`text-[20px] font-black tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{label}</div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="h-8 grid place-items-center text-[10px] text-slate-500">no runs yet</div>;
  const w = 240, h = 36, pad = 3;
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
  const [lx, ly] = pts[pts.length - 1].split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block w-full">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(110 231 183)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(110 231 183)" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="url(#sparkGrad)" strokeWidth="1.5" />
      <circle cx={lx} cy={ly} r="3" fill="rgb(110 231 183)" />
      <text x={w - 3} y={10} textAnchor="end" fontSize="9" fill="rgb(148 163 184)" fontFamily="monospace">{last.toFixed(3)}</text>
    </svg>
  );
}

function fmt(v: number | null | undefined) { return v == null ? "—" : v.toFixed(3); }
function pct(v: number | null | undefined) { return v == null ? "—" : `${Math.round(v * 100)}%`; }

