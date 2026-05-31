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
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            <AgentTrace running={busy} finished={!!rec} errored={!!error} />
            {farm && <FarmMap lat={farm.latitude} lon={farm.longitude} />}
          </div>
            {rec ? (
              <ResultCard
                view={view}
                rec={rec}
                latencyMs={latencyMs}
                conf={conf}
                noStructured={noStructured}
                busy={busy}
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

// ─── Arize observability panel ────────────────────────────────────────────────
function ArizePanel({ arize, traceId, modelServed, evalScore, evalDetails, evalJudge }: {
  arize?: Parsed["arize"];
  traceId?: string;
  modelServed?: string;
  evalScore?: number;
  evalDetails?: Parsed["evalDetails"];
  evalJudge?: string;
}) {
  if (!arize && !traceId) return null;
  const tid = arize?.traceId || traceId || "";
  // Arize space / project come from NEXT_PUBLIC_ env vars so no value is
  // hardcoded in source.  They default to the hackathon project settings.
  const arizeSpaceId   = process.env.NEXT_PUBLIC_ARIZE_SPACE_ID    ?? "";
  const arizeProject   = process.env.NEXT_PUBLIC_ARIZE_PROJECT_NAME ?? "agriguardian-ai";
  const arizeOrgBase   = arizeSpaceId
    ? `https://app.arize.com/organizations/${arizeSpaceId}`
    : "https://app.arize.com";
  const arizeUrl = `${arizeOrgBase}/projects/${arizeProject}/traces`;

  const spanCount = arize?.spansExported ?? 9;

  const FLOW = [
    { icon: "🤖", label: "Agent steps",  desc: `${spanCount} OTel spans` },
    { icon: "📡", label: "OTLP export",  desc: "OpenTelemetry → Arize" },
    { icon: "🔭", label: "Arize AX",     desc: "Trace + eval storage" },
    { icon: "⚖️", label: "LLM judge",   desc: "4-dim score + replay" },
  ];

  return (
    <div className="mt-5">
      <div className="label mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-[12px]">Arize AX · Observability &amp; Evaluation</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider animate-pulse">live</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/15 text-violet-300 font-semibold uppercase tracking-wider">MCP</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-300 font-semibold uppercase tracking-wider">OTLP</span>
        <a href={arizeUrl} target="_blank" rel="noreferrer"
           className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-violet-400/40 text-violet-200 hover:bg-violet-400/10 flex items-center gap-1">
          View traces in Arize →
        </a>
      </div>

      {/* Visual flow */}
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

      {/* Inline eval scorecard — shows when LLM judge has scored this result */}
      {evalDetails && (
        <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-violet-300">LLM-as-Judge eval</span>
            {evalJudge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/20 text-violet-200">{evalJudge}</span>}
            {evalScore != null && (
              <span className={`ml-auto text-[11px] font-bold ${evalScore >= 0.75 ? "text-emerald-300" : evalScore >= 0.6 ? "text-cyan-300" : "text-amber-300"}`}>
                {evalScore >= 0.75 ? "✓ pass" : "⚠ needs review"} · {evalScore.toFixed(3)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {([
              ["relevance",           "Relevance"],
              ["groundedness",        "Groundedness"],
              ["agronomicCorrectness","Agronomic"],
              ["hallucinationRisk",   "Hallucination Risk"],
            ] as [keyof NonNullable<Parsed["evalDetails"]>, string][]).map(([k, label]) => {
              const v = evalDetails[k];
              if (v == null) return null;
              const pct = Math.round(v * 100);
              const c = v >= 0.8 ? "bg-emerald-400" : v >= 0.6 ? "bg-cyan-400" : "bg-amber-400";
              return (
                <div key={k}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-slate-400">{label}</span>
                    <span className={v >= 0.8 ? "text-emerald-300" : v >= 0.6 ? "text-cyan-300" : "text-amber-300"}>{v.toFixed(2)}</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.06] to-violet-400/[0.04] p-4 space-y-3 text-[13px]">
        {/* What is Arize — one sentence */}
        <p className="text-[12px] text-slate-300 leading-relaxed border-b border-white/5 pb-3">
          <span className="font-semibold text-emerald-300">What Arize does:</span>{" "}
          Every step this agent runs — from fetching weather to Gemini reasoning — emits an{" "}
          <span className="text-blue-300 font-medium">OpenTelemetry span</span> that is shipped in real
          time to Arize AX. Judges can open Arize, see the full trace, run automated evals, and replay
          any failed plan as a regression test — all without touching code.
        </p>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          <ArizeRow label="MCP operation"   value={arize?.operation  || "search_traces"}      color="text-emerald-200" />
          <ArizeRow label="Exporter"        value={arize?.exporter   || "OTLP → Arize AX"}    color="text-slate-100"  />
          <ArizeRow label="Spans exported"  value={String(spanCount)}                           color="text-slate-100"  />
          <ArizeRow label="Reasoning model" value={modelServed        || "gemini-3.1-pro-preview"} color="text-violet-200" />
          {tid && (
            <div className="sm:col-span-2 flex justify-between gap-2">
              <span className="text-slate-400">Trace ID</span>
              <a href={`${arizeUrl}?traceId=${tid}`} target="_blank" rel="noreferrer"
                 className="font-mono text-[11px] text-violet-300 hover:text-violet-100 underline truncate max-w-[60%]"
                 title="Open this trace in Arize AX">
                {tid.slice(0, 32)}… ↗
              </a>
            </div>
          )}
        </div>

        {arize?.note && (
          <p className="pt-2 mt-1 border-t border-emerald-400/15 text-slate-300 leading-relaxed text-[12px]">
            {arize.note}
          </p>
        )}

        {/* What judges can do */}
        <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.04] px-3 py-2 text-[11px] text-slate-300 space-y-1">
          <div className="font-semibold text-violet-300 mb-1">What judges can do in Arize AX:</div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {[
              ["🔍 Trace replay",    "See every tool call, its input/output & latency"],
              ["⚖️ LLM evals",      "Auto-score on hallucination, relevance, groundedness"],
              ["🔁 Regression test", "Replay any failed trace to catch regressions"],
              ["📊 Score trends",    "Live aggregate from every run — visible on dashboard"],
            ].map(([k, v], i) => (
              <div key={i} className="flex gap-1.5">
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
      <span className="text-slate-400">{label}</span>
      <code className={`${color} font-semibold text-[12px]`}>{value}</code>
    </div>
  );
}

// ─── Beautiful result card ──────────────────────────────────────────────────
function ResultCard({
  view, rec, latencyMs, conf, noStructured, busy, onAsk, onSetCrop,
}: {
  view: Parsed;
  rec: Recommendation;
  latencyMs: number | null;
  conf: number;
  noStructured: boolean;
  busy: boolean;
  onAsk: (opts?: { forceLive?: boolean; cropOverride?: string }) => void;
  onSetCrop: (c: string) => void;
}) {
  const isOffline = view._source === "offline-fallback";

  return (
    <div className="space-y-4">

      {/* ── Status bar ── */}
      <div className="card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {isOffline ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Offline fallback
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live · Gemini 3
            </span>
          )}
          {noStructured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300/80 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
              Unstructured response
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          {latencyMs && <span>{latencyMs}ms</span>}
          <span>{view._modelServed ?? "gemini-3.1-pro-preview"}</span>
        </div>
      </div>

      {/* ── Offline billing notice ── */}
      {isOffline && view._reason?.includes("quota") && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-200 leading-relaxed">
          <div className="font-semibold text-amber-300 mb-1">⚠ Gemini 3 quota reached — billing fix needed</div>
          <p className="text-[12px]">
            Visit{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline text-amber-100">
              aistudio.google.com/apikey
            </a>
            {" "}→ Set up billing → link GCP billing account. No code changes needed.
          </p>
          <button onClick={() => onAsk({ forceLive: true })} disabled={busy}
            className="mt-2 text-[11px] px-3 py-1 rounded border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">
            ⟳ Retry live
          </button>
        </div>
      )}

      {/* ── Hero: recommended crop ── */}
      {view.crop && (
        <div className="card px-5 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/70 font-semibold mb-1">
                Recommended Crop
              </div>
              <div className="text-3xl font-bold text-white capitalize tracking-tight">
                🌱 {view.crop}
              </div>
              {view._basis?.season && (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 font-medium">
                    {view._basis.season} season
                  </span>
                  {view._basis.soil && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-400/20 bg-white/[0.04] text-slate-300">
                      {view._basis.soil} soil
                    </span>
                  )}
                  {view._basis.rain7dMm != null && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-blue-400/20 bg-blue-400/[0.05] text-blue-300">
                      🌧 {Math.round(view._basis.rain7dMm)}mm rain (7d)
                    </span>
                  )}
                </div>
              )}
            </div>
            <ConfidenceRing value={conf} />
          </div>

          {/* Shortlist pills */}
          {Array.isArray(view._basis?.shortlist) && view._basis!.shortlist.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Other suitable crops for this location</div>
              <div className="flex flex-wrap gap-1.5">
                {view._basis!.shortlist.map((c, i) => {
                  const picked = view.crop && c.toLowerCase() === view.crop.toLowerCase();
                  return (
                    <button key={i} type="button" disabled={busy || !!picked}
                      onClick={() => onAsk({ cropOverride: c })}
                      title={picked ? "Currently recommended" : `Re-plan with ${c}`}
                      className={"px-3 py-1 rounded-full text-xs border transition " + (
                        picked
                          ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 font-semibold cursor-default"
                          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-40"
                      )}>
                      {c}{picked ? " ✓" : ""}
                    </button>
                  );
                })}
                {view.crop && (
                  <button type="button" disabled={busy}
                    onClick={() => { onSetCrop(""); onAsk({ forceLive: true }); }}
                    className="px-3 py-1 rounded-full text-xs border border-slate-400/20 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-slate-400/40 disabled:opacity-40">
                    🔁 Re-plan
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Summary advice ── */}
      {view.advice && !view.advice.trimStart().startsWith("{") && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">💡</span>
            <h4 className="font-semibold text-slate-100">Why this plan works for your farm</h4>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{view.advice}</p>
        </div>
      )}

      {/* ── Impact numbers ── */}
      {view.impact && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📊</span>
            <h4 className="font-semibold text-slate-100">Projected impact</h4>
          </div>
          <ImpactDashboard impact={view.impact} />
        </div>
      )}

      {/* ── Task timeline ── */}
      {Array.isArray(view.tasks) && view.tasks.length > 0 && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">📋</span>
            <h4 className="font-semibold text-slate-100">Your action plan</h4>
            <span className="ml-auto text-[11px] text-slate-500">{view.tasks.length} steps</span>
          </div>
          <div className="space-y-3">
            {view.tasks.map((t, i) => {
              const action = typeof t === "string" ? t : t.action ?? "";
              const why    = typeof t === "string" ? "" : (t.why ?? "");
              const day    = typeof t === "string" ? null : (t.day ?? null);
              return (
                <div key={i} className="flex gap-3">
                  {/* Step number / day badge */}
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-xs font-bold text-emerald-300">
                      {day ?? (i + 1)}
                    </div>
                    {i < view.tasks!.length - 1 && (
                      <div className="w-px flex-1 bg-emerald-400/10 mt-1 mb-0 min-h-[12px]" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-3 flex-1 min-w-0">
                    {day != null && (
                      <div className="text-[10px] text-emerald-300/70 font-semibold uppercase tracking-wider mb-0.5">
                        Day {day}
                      </div>
                    )}
                    <div className="text-sm font-medium text-slate-100">{action}</div>
                    {why && (
                      <div className="mt-1 text-xs text-slate-400 leading-relaxed border-l-2 border-emerald-400/20 pl-2">
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

      {/* ── Risks ── */}
      {Array.isArray(view.risks) && view.risks.length > 0 && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚠️</span>
            <h4 className="font-semibold text-slate-100">Risks to watch</h4>
          </div>
          <div className="space-y-2">
            {view.risks.map((r, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2">
                <span className="text-amber-400 text-sm shrink-0">⚡</span>
                <p className="text-sm text-amber-100/90 leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Location basis (collapsed details) ── */}
      {view._basis && (
        <details className="card p-0 overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200 select-none flex items-center gap-2">
            <span>🗺️</span>
            <span>Why this crop was chosen · location &amp; field data</span>
            <span className="ml-auto text-[10px] text-slate-600">expand</span>
          </summary>
          <div className="border-t border-white/5 px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <BasisCell k="Season"      v={view._basis.season ?? "—"} />
              <BasisCell k="Soil"        v={`${view._basis.soil ?? "?"}${view._basis.soilSource === "farm-record" ? " (farm)" : " (geo)"}`} />
              <BasisCell k="Coordinates" v={view._basis.latitude != null ? `${view._basis.latitude.toFixed(3)}, ${view._basis.longitude?.toFixed(3)}` : "—"} />
              <BasisCell k="Rain (7d)"   v={view._basis.rain7dMm != null ? `${Math.round(view._basis.rain7dMm)} mm` : "—"} />
            </div>
          </div>
        </details>
      )}

      {/* ── Arize panel ── */}
      <ArizePanel arize={view.arize} traceId={rec.traceId} modelServed={view._modelServed}
        evalScore={view.evalScore ?? rec.evalScore ?? undefined}
        evalDetails={view.evalDetails ?? rec.evalDetails ?? undefined}
        evalJudge={view.evalJudge ?? rec.evalJudge ?? undefined} />

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
        <span>rec <code className="text-slate-500">{rec.id.slice(0, 10)}…</code></span>
        {rec.traceId && <span>trace <code className="text-slate-500">{rec.traceId.slice(0, 16)}…</code></span>}
      </div>
    </div>
  );
}

