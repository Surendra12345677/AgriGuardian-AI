"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Farm, type Recommendation } from "@/lib/api";
import { AgentTrace } from "./AgentTrace";
import { type Lang } from "./LanguageSelector";
import ImpactDashboard, { type Impact } from "./ImpactDashboard";
import FarmMap from "./FarmMap";
type Parsed = {
  advice?: string;
  crop?: string;
  tasks?: (string | { day?: number; action?: string; why?: string })[];
  confidence?: number;
  impact?: Impact;
  risks?: string[];
  _source?: string;
  _reason?: string;
  _modelServed?: string;
  evalScore?: number;
  evalDetails?: { relevance?: number; groundedness?: number; agronomicCorrectness?: number; hallucinationRisk?: number; aggregate?: number; judge?: string };
  evalJudge?: string;
  _basis?: {
    season?: string;
    month?: number;
    latitude?: number;
    longitude?: number;
    soil?: string;
    soilSource?: string;
    rain7dMm?: number;
    shortlist?: string[];
    anchorCrop?: string;
  };
  arize?: {
    operation?: string;
    source?: string;
    note?: string;
    traceId?: string;
    spansExported?: number;
    exporter?: string;
  };
};
export default function AgentPanel({
  farm, language, onLanguageChange,
}: {
  farm?: Farm;
  language: Lang;
  onLanguageChange: (l: Lang) => void;
}) {
  const [crop, setCrop]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rec,  setRec]    = useState<Recommendation | null>(null);
  const [tStart, setTStart] = useState<number | null>(null);
  const [tEnd,   setTEnd]   = useState<number | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [evalPending, setEvalPending] = useState(false);
  const elapsedRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const evalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track which farm the currently-displayed result belongs to. When the
  // user switches the active farm in the FarmContextBar above (same
  // AgentPanel instance, new `farm` prop) we (a) clear the stale result
  // so they don't think it's the new farm's plan, and (b) flag the next
  // ask() so it bypasses the cache. Without this, picking a different
  // farm and immediately replanning could return the previous farm's
  // cached recommendation if everything else (crop/scenario/lang)
  // happened to match.
  const lastFarmIdRef = useRef<string | undefined>(farm?.id);
  const [farmChanged, setFarmChanged] = useState(false);
  useEffect(() => {
    if (!farm) { lastFarmIdRef.current = undefined; return; }
    if (lastFarmIdRef.current && lastFarmIdRef.current !== farm.id) {
      setRec(null);
      setError(null);
      setTStart(null);
      setTEnd(null);
      setFarmChanged(true);
    }
    lastFarmIdRef.current = farm.id;
  }, [farm?.id]);

  // Cleanup eval poll on unmount
  useEffect(() => { return () => { if (evalPollRef.current) clearInterval(evalPollRef.current); }; }, []);

  // Poll for async eval score — runs after rec arrives with null evalScore.
  // The Gemini judge takes ~8-15 s in the background; we poll every 3 s for up to 60 s.
  useEffect(() => {
    if (evalPollRef.current) clearInterval(evalPollRef.current);
    if (!rec) { setEvalPending(false); return; }
    if (rec.evalScore != null) { setEvalPending(false); return; }
    setEvalPending(true);
    const recId = rec.id;
    let attempts = 0;
    evalPollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 20) { clearInterval(evalPollRef.current!); setEvalPending(false); return; }
      try {
        const trend = await api.evalTrend(1);
        const latest = trend.series[0];
        if (latest?.recommendationId === recId && latest.evalScore != null) {
          setRec(prev => prev && prev.id === recId ? {
            ...prev,
            evalScore:   latest.evalScore,
            evalDetails: latest.evalDetails ?? undefined,
            evalJudge:   latest.judge,
          } : prev);
          setEvalPending(false);
          clearInterval(evalPollRef.current!);
        }
      } catch { /* non-fatal */ }
    }, 3000);
  }, [rec?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function ask(opts?: { forceLive?: boolean; cropOverride?: string }) {
    if (!farm) return;
    setBusy(true); setError(null); setRec(null); setTEnd(null);
    setLiveElapsed(0);
    const t0 = performance.now();
    setTStart(t0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setLiveElapsed(Math.floor((performance.now() - t0) / 1000)), 500);
    // First call after switching farms always bypasses the cache.
    const forceLive = !!opts?.forceLive || farmChanged;
    try {
      if (forceLive) {
        // Best-effort cache reset on the server too — ignore errors so the
        // planner still runs even if the admin endpoint is locked down.
        try { await api.clearCache(); } catch { /* non-fatal */ }
      }
      const cropToUse = opts?.cropOverride ?? crop;
      if (opts?.cropOverride !== undefined) setCrop(opts.cropOverride);
      const out = await api.recommend({
        farmId:    farm.id,
        latitude:  farm.latitude,
        longitude: farm.longitude,
        preferredCrop: cropToUse || undefined,
        language,
        scenario: "BASELINE",
        // When the user picks a different crop from the shortlist, OR the
        // active farm just changed, we ALWAYS bypass the cache so they
        // see a fresh plan instead of the previous cached recommendation.
        forceLive: forceLive || !!opts?.cropOverride,
      });
      setRec(out);
      setFarmChanged(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      setTEnd(performance.now());
      setBusy(false);
    }
  }
  const parsed: Parsed = (() => {
    const raw = (rec?.reasoning ?? "").trim();
    if (!raw) return {};
    // 1. Direct parse
    try { return JSON.parse(raw); } catch {}
    // 2. Strip markdown fences
    const noFence = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try { return JSON.parse(noFence); } catch {}
    // 3. Extract first {...} block
    const m = noFence.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    // 4. Last resort — show text as advice
    return { advice: raw };
  })();

  // 5. If advice itself looks like a JSON blob (double-encoded), try to re-parse it
  if (parsed.advice && typeof parsed.advice === "string" && parsed.advice.trimStart().startsWith("{")) {
    try {
      const inner = JSON.parse(parsed.advice) as Parsed;
      if (inner.crop || inner.tasks || inner.impact) Object.assign(parsed, inner);
    } catch {}
  }
  const usedFallback = !!rec
    && !parsed.advice && !parsed.crop && !(parsed.tasks?.length) && !parsed.impact;
  const view: Parsed = parsed;
  const noStructured = usedFallback;
  const latencyMs = tStart && tEnd ? Math.round(tEnd - tStart) : null;
  const conf = view.confidence ?? (rec?.evalScore ?? rec?.confidenceScore ?? 0);
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-100 text-lg flex items-center gap-2">
              <span aria-hidden>🤖</span> Ask the agent
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-md">
              Multi-step plan loop. Every span is exported to Arize AX over OTLP.
            </p>
          </div>
          {farm && (
            <div className="text-right">
              <div className="text-xs text-slate-400">Selected farm</div>
              <div className="text-sm text-slate-200 font-medium">{farm.farmerName}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {farm.latitude.toFixed(2)}, {farm.longitude.toFixed(2)} · {farm.soilType}
              </div>
            </div>
          )}
        </div>
        {!farm ? (
          <p className="mt-4 text-sm text-slate-500 italic">
            Select or onboard a farm in Step 1 above to enable the planner.
          </p>
        ) : (
          <div className="mt-4 flex gap-2 items-end flex-wrap">
            <label className="text-xs text-slate-400 flex-1 space-y-1 block min-w-[200px]">
              <span className="label">Preferred crop (optional)</span>
              <input className="input"
                     placeholder="e.g. wheat, maize, soybean, onion"
                     value={crop}
                     onChange={e => setCrop(e.target.value)} />
            </label>
            <button onClick={() => ask()} disabled={busy} className="btn-primary text-base !py-2.5 !px-5">
              {busy
                ? <span className="flex items-center gap-2"><Spinner /> Planning… <span className="tabular-nums text-emerald-200/70">{liveElapsed}s</span></span>
                : <>▶ Plan my season</>}
            </button>
            <button
              onClick={() => ask({ forceLive: true })}
              disabled={busy}
              title="Skip the result cache and force a fresh Gemini call"
              className="text-sm px-4 py-2.5 rounded-lg border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/[0.06] disabled:opacity-50"
            >
              ⟳ Force live
            </button>
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.04] p-3 text-sm text-red-200 space-y-1">
            <div className="font-semibold text-red-300">Planner failed</div>
            <p className="whitespace-pre-wrap break-words leading-relaxed">{error}</p>
          </div>
        )}
      </div>
      {(busy || rec || error) && (
        <div className="grid lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-2 space-y-4">
            <AgentTrace running={busy} finished={!!rec} errored={!!error} evalPending={evalPending} evalDone={!evalPending && !!rec && rec.evalScore != null} />
            {farm && <FarmMap lat={farm.latitude} lon={farm.longitude} />}
          </div>
          <div className="lg:col-span-3">
            {rec ? (
              <ResultCard
                view={view}
                rec={rec}
                latencyMs={latencyMs}
                conf={conf}
                noStructured={noStructured}
                busy={busy}
                evalPending={evalPending}
                onAsk={ask}
                onSetCrop={setCrop}
              />
            ) : (
              <div className="card p-5 space-y-3">
                <Skeleton h="h-5 w-1/3" />
                <Skeleton h="h-4 w-full" />
                <Skeleton h="h-4 w-5/6" />
                <Skeleton h="h-20 w-full" />
                <Skeleton h="h-4 w-1/2" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className="text-sm font-semibold text-slate-100">{v}</div>
    </div>
  );
}
function BasisCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className="text-[12px] font-medium text-slate-100 truncate" title={v}>{v}</div>
    </div>
  );
}
function Skeleton({ h }: { h: string }) {
  return <div className={`relative overflow-hidden rounded ${h} bg-white/[0.04]`} />;
}
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function ConfidenceRing({ value }: { value: number }) {
  const loading = value < 0;
  const pct = loading ? 0 : Math.max(0, Math.min(1, value));
  const r = 22, c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 56 56" className={`h-14 w-14 -rotate-90 ${loading ? "animate-spin" : ""}`}>
        <circle cx="28" cy="28" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle cx="28" cy="28" r={r} stroke="url(#g)" strokeWidth="6" fill="none"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={loading ? c * 0.75 : off} />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-bold text-emerald-300">
        {loading ? "…" : `${Math.round(pct * 100)}%`}
      </div>
    </div>
  );
}

// ─── Arize observability panel shown at the bottom of each result ────────────
function ArizePanel({ arize, traceId, modelServed, evalScore, evalDetails, evalJudge, evalPending }: {
  arize?: Parsed["arize"];
  traceId?: string;
  modelServed?: string;
  evalScore?: number;
  evalDetails?: Parsed["evalDetails"];
  evalJudge?: string;
  evalPending?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [arizeStatus, setArizeStatus] = useState<{
    exporterEnabled: boolean; mcpEnabled: boolean; projectName: string;
    otlpEndpoint: string; spaceIdHint: string; batchDelayMs: number;
  } | null>(null);

  useEffect(() => {
    api.arizeStatus().then(setArizeStatus).catch(() => {/* non-fatal */});
  }, []);

  const tid       = arize?.traceId || traceId || "";
  const spanCount = arize?.spansExported ?? 10;

  // All env vars — nothing hardcoded, GCP-safe
  const arizeSpaceId = arizeStatus?.spaceIdHint ?? process.env.NEXT_PUBLIC_ARIZE_SPACE_ID    ?? "";
  const arizeProject = arizeStatus?.projectName ?? process.env.NEXT_PUBLIC_ARIZE_PROJECT_NAME ?? "agriguardian-ai";
  const arizeBase    = arizeSpaceId ? `https://app.arize.com/organizations/${arizeSpaceId}` : "https://app.arize.com";
  const arizeUrl     = `${arizeBase}/projects/${arizeProject}/traces`;

  const isConnected = arizeStatus?.exporterEnabled ?? false;

  function copyTrace() {
    if (!tid) return;
    navigator.clipboard.writeText(tid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const FLOW = [
    { icon: "🤖", label: "Agent steps",  desc: `${spanCount} OTel spans` },
    { icon: "📡", label: "OTLP export",  desc: `${arizeStatus?.batchDelayMs ?? 500}ms batch` },
    { icon: "🔍", label: "Arize AX",     desc: "Trace + eval storage" },
    { icon: "⚖️", label: "LLM judge",    desc: "4-dim score + replay" },
  ];

  return (
    <div className="mt-2">
      {/* ── Header bar ── */}
      <div className="label mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-slate-300">
          Arize AX · Observability &amp; Evaluation
        </span>
        {arizeStatus != null ? (
          isConnected ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider animate-pulse">
              live · connected
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-400/15 text-slate-400 font-semibold uppercase tracking-wider">
              exporter disabled
            </span>
          )
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider animate-pulse">
            live
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/15 text-violet-300 font-semibold uppercase tracking-wider">MCP</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-300 font-semibold uppercase tracking-wider">OTLP</span>
        <a href={arizeUrl} target="_blank" rel="noreferrer"
           className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-violet-400/40 text-violet-200 hover:bg-violet-400/10 flex items-center gap-1">
          View in Arize →
        </a>
      </div>

      {/* ── Visual agent flow ── */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {FLOW.map((f, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-center min-w-[80px]">
              <div className="text-base">{f.icon}</div>
              <div className="text-[11px] text-slate-200 font-medium leading-tight">{f.label}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{f.desc}</div>
            </div>
            {i < FLOW.length - 1 && <span className="text-slate-600 text-xs flex-shrink-0">→</span>}
          </div>
        ))}
      </div>

      {/* ── Inline LLM-judge eval scorecard ── */}
      {evalPending && !evalDetails && (
        <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] px-3 py-2.5 flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-violet-300">Arize LLM Judge evaluating…</span>
            <p className="text-[10px] text-slate-400 mt-0.5">Gemini is scoring this plan on 4 quality dimensions. Results appear in ~10–15 s.</p>
          </div>
        </div>
      )}
      {evalDetails && (
        <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-semibold text-violet-300">⚖️ LLM-as-Judge Eval</span>
            {evalJudge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/20 text-violet-200">{evalJudge}</span>
            )}
            {evalScore != null && (
              <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded ${
                evalScore >= 0.75 ? "text-emerald-300 bg-emerald-400/10" : evalScore >= 0.6 ? "text-cyan-300 bg-cyan-400/10" : "text-amber-300 bg-amber-400/10"
              }`}>
                {evalScore >= 0.75 ? "✓ pass" : "⚠ review"} · {evalScore.toFixed(3)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {([
              ["relevance",            "Relevance",    "Plan matches this farm"],
              ["groundedness",         "Groundedness", "Numbers from real tool data"],
              ["agronomicCorrectness", "Agronomic",    "Crop fit for soil + season"],
              ["hallucinationRisk",    "Hallucination","1.0 = nothing fabricated"],
            ] as [keyof NonNullable<Parsed["evalDetails"]>, string, string][]).map(([k, label, tip]) => {
              const v = evalDetails[k] as number | undefined;
              if (v == null) return null;
              const p   = Math.round(v * 100);
              const bar = v >= 0.8 ? "bg-emerald-400" : v >= 0.6 ? "bg-cyan-400" : "bg-amber-400";
              const txt = v >= 0.8 ? "text-emerald-300" : v >= 0.6 ? "text-cyan-300" : "text-amber-300";
              const ico = v >= 0.8 ? "✅" : v >= 0.6 ? "🟡" : "⚠️";
              return (
                <div key={k} title={tip}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-slate-400 flex items-center gap-1"><span>{ico}</span>{label}</span>
                    <span className={`font-bold ${txt}`}>{p}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main info card ── */}
      <div className="rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.06] to-violet-400/[0.04] p-4 space-y-3 text-[13px]">
        {/* What Arize does — plain English */}
        <p className="text-[12px] text-slate-300 leading-relaxed border-b border-white/5 pb-3">
          <span className="font-semibold text-emerald-300">What Arize does: </span>
          Every step this agent runs — from fetching weather to Gemini reasoning — emits an{" "}
          <span className="text-blue-300 font-medium">OpenTelemetry span</span> shipped in real time to Arize AX.
          Judges can open Arize, see the full trace, run automated evals, and replay any failed plan — all without touching code.
        </p>

        {/* Metadata table */}
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          <ArizeRow label="MCP operation"   value={arize?.operation || "search_traces"}          color="text-emerald-200" />
          <ArizeRow label="Project"         value={arizeProject}                                  color="text-slate-100"  />
          <ArizeRow label="Spans exported"  value={`${spanCount} (9 agent + 1 eval)`}             color="text-slate-100"  />
          <ArizeRow label="Reasoning model" value={modelServed || "gemini-3.1-pro-preview"}       color="text-violet-200" />
          <ArizeRow label="Exporter"        value={isConnected ? "OTLP → Arize AX ✓" : arizeStatus ? "disabled (set ARIZE_ENABLED=true)" : "OTLP → Arize AX"}
                    color={isConnected ? "text-emerald-200" : "text-slate-400"} />
          <ArizeRow label="MCP"             value={arizeStatus?.mcpEnabled ? "connected" : "disabled (set MCP_ARIZE_ENABLED=true)"}
                    color={arizeStatus?.mcpEnabled ? "text-emerald-200" : "text-slate-400"} />
          {tid && (
            <div className="sm:col-span-2 flex justify-between gap-2 items-center">
              <span className="text-slate-400 text-[12px]">Trace ID</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className="text-[11px] text-violet-300 font-mono truncate max-w-[200px]" title={tid}>{tid}</code>
                <button type="button" onClick={copyTrace}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-violet-400/20 text-violet-300 hover:bg-violet-400/10 transition">
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        {arize?.note && (
          <p className="pt-2 mt-1 border-t border-emerald-400/15 text-slate-300 leading-relaxed text-[12px]">{arize.note}</p>
        )}

        {/* What judges can do */}
        <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.04] px-3 py-2 text-[11px] text-slate-300 space-y-1">
          <div className="font-semibold text-violet-300 mb-1">What judges can do in Arize AX:</div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {[
              ["🔍 Trace replay",    "See every tool call, its input/output & latency"],
              ["⚖️ LLM evals",       "Auto-score on hallucination, relevance, groundedness"],
              ["🔁 Regression test", "Replay any failed trace to catch regressions"],
              ["📊 Score trends",    "Live aggregate from every run — visible on dashboard"],
            ].map(([k, v]) => (
              <div key={k as string} className="flex gap-1.5">
                <span className="flex-shrink-0">{k}</span>
                <span className="text-slate-500">— {v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArizeRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400 text-[12px]">{label}</span>
      <code className={`${color} font-semibold text-[12px]`}>{value}</code>
    </div>
  );
}

// ─── Beautiful result card ──────────────────────────────────────────────────
function ResultCard({
  view, rec, latencyMs, conf, noStructured, busy, evalPending, onAsk, onSetCrop,
}: {
  view: Parsed;
  rec: Recommendation;
  latencyMs: number | null;
  conf: number;
  noStructured: boolean;
  busy: boolean;
  evalPending: boolean;
  onAsk: (opts?: { forceLive?: boolean; cropOverride?: string }) => void;
  onSetCrop: (c: string) => void;
}) {
  const isOffline = view._source === "offline-fallback";

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════════════
           HERO — Recommended Crop (status + crop + basis + shortlist)
           ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-[#0d2318] via-[#0a1e14] to-[#0f1a2e] overflow-hidden">

        {/* Status strip */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isOffline ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-300 uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />Offline fallback
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live · Gemini 3
              </span>
            )}
            {noStructured && (
              <span className="text-[10px] font-semibold text-amber-300/70 uppercase tracking-widest">· Unstructured</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
            {latencyMs && <span>{(latencyMs / 1000).toFixed(1)}s</span>}
            <span className="text-slate-600">{view._modelServed ?? "gemini-3.1-pro-preview"}</span>
          </div>
        </div>

        {/* Offline billing notice */}
        {isOffline && view._reason?.includes("quota") && (
          <div className="mx-5 mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
            <div className="font-semibold text-amber-300 mb-1">⚠ Gemini 3 quota reached</div>
            <p className="text-[12px] leading-relaxed">
              Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline text-amber-100">aistudio.google.com/apikey</a> → Set up billing. No code changes needed.
            </p>
            <button onClick={() => onAsk({ forceLive: true })} disabled={busy}
              className="mt-2 text-[11px] px-3 py-1 rounded border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">
              ⟳ Retry live
            </button>
          </div>
        )}

        {/* Crop name + confidence ring */}
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/60 font-semibold mb-2">
              Recommended Crop
            </div>
            <div className="text-4xl sm:text-5xl font-black text-white capitalize tracking-tight leading-none flex items-center gap-3">
              <span className="text-3xl">🌱</span> {view.crop ?? "Analysing…"}
            </div>
            {view._basis?.season && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-400/35 bg-emerald-400/10 text-emerald-300 font-medium">
                  {view._basis.season} season
                </span>
                {view._basis.soil && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-slate-400/20 bg-white/[0.05] text-slate-300">
                    {view._basis.soil} soil
                  </span>
                )}
                {view._basis.rain7dMm != null && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-blue-400/25 bg-blue-400/[0.07] text-blue-300">
                    🌧 {Math.round(view._basis.rain7dMm)}mm rain (7d)
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0">
            <ConfidenceRing value={conf} />
          </div>
        </div>

        {/* Shortlist pills */}
        {Array.isArray(view._basis?.shortlist) && view._basis!.shortlist.length > 0 && (
          <div className="px-5 pb-5 border-t border-white/[0.06] pt-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Also suitable for this location</div>
            <div className="flex flex-wrap gap-2">
              {view._basis!.shortlist.map((c, i) => {
                const picked = view.crop && c.toLowerCase() === view.crop.toLowerCase();
                return (
                  <button key={i} type="button" disabled={busy || !!picked}
                    onClick={() => onAsk({ cropOverride: c })}
                    title={picked ? "Currently recommended" : `Re-plan with ${c}`}
                    className={"px-3 py-1 rounded-full text-[12px] border transition-all " + (
                      picked
                        ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200 font-semibold cursor-default"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:opacity-40"
                    )}>
                    {c}{picked ? " ✓" : ""}
                  </button>
                );
              })}
              {view.crop && (
                <button type="button" disabled={busy}
                  onClick={() => { onSetCrop(""); onAsk({ forceLive: true }); }}
                  className="px-3 py-1 rounded-full text-[12px] border border-slate-400/20 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-slate-400/40 disabled:opacity-40 flex items-center gap-1">
                  🔁 Re-plan
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════
           ADVICE — Why this plan works
           ═════════════════════════════════════════════ */}
      {view.advice && !view.advice.trimStart().startsWith("{") && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 py-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-xl">💡</span>
            <h4 className="font-semibold text-slate-100 text-[15px]">Why this plan works for your farm</h4>
          </div>
          <p className="text-[13.5px] text-slate-300 leading-7">{view.advice}</p>
        </div>
      )}

      {/* ═════════════════════════════════════════════════
           PROJECTED IMPACT
           ═════════════════════════════════════════════ */}
      {view.impact && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 py-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-xl">📊</span>
            <h4 className="font-semibold text-slate-100 text-[15px]">Projected impact</h4>
          </div>
          <ImpactDashboard impact={view.impact} />
        </div>
      )}

      {/* ═════════════════════════════════════════════════
           TASK TIMELINE
           ═════════════════════════════════════════════ */}
      {Array.isArray(view.tasks) && view.tasks.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 py-5">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="text-xl">📋</span>
            <h4 className="font-semibold text-slate-100 text-[15px]">Your action plan</h4>
            <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full">
              {view.tasks.length} steps
            </span>
          </div>
          <div className="space-y-1">
            {view.tasks.map((t, i) => {
              const action = typeof t === "string" ? t : t.action ?? "";
              const why    = typeof t === "string" ? "" : (t.why ?? "");
              const day    = typeof t === "string" ? null : (t.day ?? null);
              return (
                <div key={i} className="flex gap-4">
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="h-8 w-8 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-[11px] font-bold text-emerald-300 mt-1">
                      {day ?? (i + 1)}
                    </div>
                    {i < view.tasks!.length - 1 && (
                      <div className="w-px flex-1 bg-emerald-400/[0.12] mt-1 min-h-[16px]" />
                    )}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    {day != null && (
                      <div className="text-[10px] text-emerald-400/60 font-semibold uppercase tracking-widest mb-0.5">Day {day}</div>
                    )}
                    <div className="text-[13.5px] font-medium text-slate-100 leading-snug">{action}</div>
                    {why && (
                      <div className="mt-1.5 text-[12px] text-slate-400 leading-relaxed border-l-2 border-emerald-400/20 pl-3">
                        {why}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════
           RISKS
           ═════════════════════════════════════════════ */}
      {Array.isArray(view.risks) && view.risks.length > 0 && (
        <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.03] px-6 py-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-xl">⚠️</span>
            <h4 className="font-semibold text-slate-100 text-[15px]">Risks to watch</h4>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {view.risks.map((r, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-amber-400/12 bg-amber-400/[0.05] px-4 py-3">
                <span className="text-amber-400 text-base shrink-0 mt-0.5">⚡</span>
                <p className="text-[13px] text-amber-100/90 leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════
           LOCATION BASIS (collapsible)
           ═════════════════════════════════════════════ */}
      {view._basis && (
        <details className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <summary className="px-5 py-3.5 cursor-pointer text-[12px] font-medium text-slate-400 hover:text-slate-200 select-none flex items-center gap-2">
            <span>🗺️</span>
            <span>Why this crop was chosen · location &amp; field data</span>
            <span className="ml-auto text-[10px] text-slate-600">expand</span>
          </summary>
          <div className="border-t border-white/5 px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <BasisCell k="Season"      v={view._basis.season ?? "—"} />
              <BasisCell k="Soil"        v={`${view._basis.soil ?? "?"}${view._basis.soilSource === "farm-record" ? " (farm)" : " (geo)"}`} />
              <BasisCell k="Coordinates" v={view._basis.latitude != null ? `${view._basis.latitude.toFixed(3)}, ${view._basis.longitude?.toFixed(3)}` : "—"} />
              <BasisCell k="Rain (7d)"   v={view._basis.rain7dMm != null ? `${Math.round(view._basis.rain7dMm)} mm` : "—"} />
            </div>
          </div>
        </details>
      )}

      {/* ═════════════════════════════════════════════════
           ARIZE OBSERVABILITY
           ═════════════════════════════════════════════ */}
      <ArizePanel
        arize={view.arize}
        traceId={rec.traceId}
        modelServed={view._modelServed}
        evalScore={view.evalScore ?? rec.evalScore ?? undefined}
        evalDetails={view.evalDetails ?? rec.evalDetails ?? undefined}
        evalJudge={view.evalJudge ?? rec.evalJudge ?? undefined}
        evalPending={evalPending}
      />

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[10px] text-slate-700 px-1">
        <span>rec <code className="text-slate-600">{rec.id.slice(0, 10)}…</code></span>
        {rec.traceId && <span>trace <code className="text-slate-600">{rec.traceId.slice(0, 16)}…</code></span>}
      </div>
    </div>
  );
}

