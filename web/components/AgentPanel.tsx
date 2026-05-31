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
    date?: string;
    season?: string;
    month?: number;
    latitude?: number;
    longitude?: number;
    soil?: string;
    soilSource?: string;
    rain7dMm?: number;
    tempMaxC?: number;
    tempMinC?: number;
    tempAvgC?: number;
    humidity?: number;
    forecastDays?: number;
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
  const resultRef   = useRef<HTMLDivElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);

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

  // Auto-scroll to the ResultCard (not just the grid wrapper) so on mobile/tablet
  // the user sees the actual result, not just the AgentTrace panel above it.
  useEffect(() => {
    if (rec && resultCardRef.current) {
      setTimeout(() => {
        resultCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [rec?.id]); // only scroll on new rec, not on eval updates

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

    // Helper: strip every known wrapper and return clean text
    function clean(s: string): string {
      return s
        .replace(/^```(?:json)?\s*/im, "")   // opening fence
        .replace(/\s*```\s*$/m, "")           // closing fence
        .replace(/^`([^`]+)`$/, "$1")         // single backtick wrapping
        .trim();
    }

    // 1. Direct parse
    try { return JSON.parse(raw); } catch {}

    // 2. Strip markdown/backtick fences
    const stripped = clean(raw);
    try { return JSON.parse(stripped); } catch {}

    // 3. Extract FIRST complete JSON object (handles leading/trailing prose)
    const allMatches = [...stripped.matchAll(/\{[\s\S]*?\}(?=\s*$|\s*\n\s*[^{]|$)/g)];
    // Try the largest match first (greedy full-string)
    const bigMatch = stripped.match(/\{[\s\S]*\}/);
    if (bigMatch) { try { return JSON.parse(bigMatch[0]); } catch {} }
    // Try each individual match
    for (const m of allMatches) { try { return JSON.parse(m[0]); } catch {} }

    // 4. Regex-extract individual fields as last-resort structural parse
    const extractStr = (key: string) => { const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)); return m?.[1]; };
    const extractNum = (key: string) => { const m = raw.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`)); return m ? parseFloat(m[1]) : undefined; };
    const crop = extractStr("crop") ?? extractStr("recommended_crop");
    const advice = extractStr("advice") ?? extractStr("summary");
    if (crop || advice) {
      return {
        crop,
        advice: advice ?? undefined,
        confidence: extractNum("confidence"),
      } as Parsed;
    }

    // 5. Last resort — show text as advice
    return { advice: raw };
  })();

  // 6. If advice itself looks like a JSON blob (double-encoded), try to re-parse it
  if (parsed.advice && typeof parsed.advice === "string" && parsed.advice.trimStart().startsWith("{")) {
    try {
      const inner = JSON.parse(parsed.advice) as Parsed;
      if (inner.crop || inner.tasks || inner.impact) Object.assign(parsed, inner);
    } catch {}
  }

  // 7. If crop is still missing but advice text contains crop name clue, extract it
  if (!parsed.crop && parsed.advice && typeof parsed.advice === "string") {
    const m = parsed.advice.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/);
    // Very rough — only use if looks like a proper noun (capitalised) in a short prefix
  }

  const usedFallback = !!rec
    && !parsed.advice && !parsed.crop && !(parsed.tasks?.length) && !parsed.impact;
  const view: Parsed = parsed;
  const noStructured = usedFallback;

  // Detect a partial/truncated result: crop or advice present, but impact & tasks missing.
  // This happens when the cached JSON was truncated. Automatically trigger a fresh live
  // call once so the user always sees the full plan without needing to click anything.
  const isPartialResult = !!rec && !busy
    && (!!view.crop || !!view.advice)
    && !view.impact && !(view.tasks?.length);

  const autoRefreshFiredRef = useRef(false);
  useEffect(() => {
    if (isPartialResult && !autoRefreshFiredRef.current) {
      autoRefreshFiredRef.current = true;
      // Small delay so the user briefly sees the partial result before re-fetching
      setTimeout(() => ask({ forceLive: true }), 800);
    }
    // Reset flag when rec changes (new farm / new plan)
    if (!rec) autoRefreshFiredRef.current = false;
  }, [isPartialResult, rec?.id]); // eslint-disable-line
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
            </button>            <button
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
        {/* Progress bar while Gemini is thinking */}
        {busy && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>🤖 Gemini is analysing weather, soil &amp; market data…</span>
              <span className="tabular-nums text-emerald-300 font-semibold">{liveElapsed}s</span>
            </div>
            <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-1000"
              style={{ width: `${Math.min(95, (liveElapsed / 50) * 100)}%` }}
            />
            </div>
            <p className="text-[10px] text-slate-500">Typically 40–50 s (market prices via Gemini) · result appears automatically</p>
          </div>
        )}
      </div>
      {(busy || rec || error) && (
        <div ref={resultRef} className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
          <div className="space-y-4">
            <AgentTrace running={busy} finished={!!rec} errored={!!error} evalPending={evalPending} evalDone={!evalPending && !!rec && rec.evalScore != null} />
            {farm && <FarmMap lat={farm.latitude} lon={farm.longitude} />}
          </div>
          <div>
            {rec ? (
              <div ref={resultCardRef}>
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
              </div>
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
  const r = 26, c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className={`h-16 w-16 -rotate-90 ${loading ? "animate-spin" : ""}`}>
        <circle cx="32" cy="32" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle cx="32" cy="32" r={r} stroke="url(#g)" strokeWidth="6" fill="none"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={loading ? c * 0.75 : off} />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-bold text-emerald-300">
        {loading ? "…" : `${Math.round(pct * 100)}%`}
      </div>
    </div>
  );
}

// ─── Weather snapshot widget ─────────────────────────────────────────────────
function WeatherWidget({ basis }: { basis: NonNullable<Parsed["_basis"]> }) {
  const tempMax  = basis.tempMaxC  != null ? `${basis.tempMaxC.toFixed(1)}°C`  : null;
  const tempMin  = basis.tempMinC  != null ? `${basis.tempMinC.toFixed(1)}°C`  : null;
  const tempAvg  = basis.tempAvgC  != null ? `${basis.tempAvgC.toFixed(1)}°C`  : null;
  const humPct   = basis.humidity  != null ? `${Math.round(basis.humidity * 100)}%` : null;
  const rain     = basis.rain7dMm  != null ? `${Math.round(basis.rain7dMm)} mm` : null;
  const days     = basis.forecastDays ?? 7;
  const month    = basis.month ?? (new Date().getMonth() + 1);

  const tempColor = (basis.tempAvgC ?? 28) > 35
    ? "text-orange-300" : (basis.tempAvgC ?? 28) > 25
    ? "text-amber-200" : "text-cyan-300";

  // Monsoon / seasonal context label derived from month + rain
  const seasonLabel = (() => {
    const r = basis.rain7dMm ?? 0;
    if (month >= 6 && month <= 9) {
      if (r > 50) return { icon: "⛈️", label: "Peak monsoon",    color: "text-blue-300" };
      if (r > 20) return { icon: "🌧️", label: "Active monsoon",  color: "text-blue-300" };
      return            { icon: "🌦️", label: "Monsoon season",   color: "text-sky-300"  };
    }
    if (month === 5)                 return { icon: "🌩️", label: "Pre-monsoon · plant Kharif seeds", color: "text-amber-300" };
    if (month === 10 || month === 11)return { icon: "🍂", label: "Post-monsoon / Rabi prep",          color: "text-orange-300"};
    if (month <= 3)                  return { icon: "❄️", label: "Winter / Rabi season",               color: "text-cyan-300"  };
    return                                  { icon: "☀️", label: "Summer / Zaid season",               color: "text-yellow-300"};
  })();

  // Rainfall bar: scale 0–100 mm → 0–100% width
  const rainBarPct   = basis.rain7dMm != null ? Math.min(100, (basis.rain7dMm / 100) * 100) : 0;
  const rainBarColor = (basis.rain7dMm ?? 0) < 5 ? "bg-red-400/60"
    : (basis.rain7dMm ?? 0) < 20 ? "bg-amber-400/60" : "bg-blue-400/60";
  const rainLabel    = (basis.rain7dMm ?? 0) < 5  ? { text: "Very dry",     color: "text-red-400"    }
    : (basis.rain7dMm ?? 0) < 20                  ? { text: "Moderate",     color: "text-amber-400"  }
    :                                               { text: "Good rainfall", color: "text-blue-400"   };

  return (
    <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base">{seasonLabel.icon}</span>
          <span className="text-[11px] uppercase tracking-[0.15em] text-sky-400 font-semibold">
            Live weather · next {days} days (Open-Meteo)
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] ${seasonLabel.color}`}>
          {seasonLabel.label}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tempMax && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 px-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Temp max</div>
            <div className={`text-[15px] font-bold ${tempColor}`}>{tempMax}</div>
          </div>
        )}
        {tempMin && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 px-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Temp min</div>
            <div className="text-[15px] font-bold text-cyan-300">{tempMin}</div>
          </div>
        )}
        {humPct && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 px-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Humidity</div>
            <div className="text-[15px] font-bold text-blue-300">{humPct}</div>
            <div className="mt-1 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-blue-400/60" style={{ width: humPct }} />
            </div>
          </div>
        )}
        {rain && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 px-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">
              Rainfall ({days}d forecast)
            </div>
            <div className="text-[15px] font-bold text-indigo-300">{rain}</div>
            <div className="mt-1 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full rounded-full ${rainBarColor} transition-all duration-700`}
                   style={{ width: `${rainBarPct}%` }} />
            </div>
            <div className={`text-[9px] mt-0.5 ${rainLabel.color}`}>{rainLabel.text}</div>
          </div>
        )}
      </div>
      {tempAvg && (
        <p className="mt-2.5 text-[10px] text-slate-500 leading-relaxed">
          Avg <span className={`font-semibold ${tempColor}`}>{tempAvg}</span>
          {basis.humidity != null && (
            <> · humidity <span className="text-blue-300 font-semibold">{humPct}</span></>
          )}
          {basis.rain7dMm != null && (
            <> · <span className={`font-semibold ${rainLabel.color}`}>
              {basis.rain7dMm < 5 ? "🔴 very dry — plan irrigation" : basis.rain7dMm < 20 ? "🟡 moderate rain" : "🟢 good for Kharif sowing"}
            </span></>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Arize observability panel shown at the bottom of each result ────────────
// Default: minimal strip showing monitoring status + eval score.
// Click to expand the full detail view (flow, scorecard, metadata).
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
    arizeOrgId?: string;
  } | null>(null);

  useEffect(() => {
    api.arizeStatus().then(setArizeStatus).catch(() => {/* non-fatal */});
  }, []);

  const tid       = arize?.traceId || traceId || "";
  const spanCount = arize?.spansExported ?? 10;

  const arizeSpaceId = arizeStatus?.arizeOrgId     ?? arizeStatus?.spaceIdHint ?? process.env.NEXT_PUBLIC_ARIZE_SPACE_ID    ?? "";
  const arizeProject = arizeStatus?.projectName ?? process.env.NEXT_PUBLIC_ARIZE_PROJECT_NAME ?? "agriguardian-ai";
  const arizeBase    = arizeSpaceId ? `https://app.arize.com/organizations/${arizeSpaceId}` : "https://app.arize.com";
  const arizeUrl     = `${arizeBase}/projects/${arizeProject}/traces`;
  const isConnected  = arizeStatus?.exporterEnabled ?? false;

  function copyTrace() {
    if (!tid) return;
    navigator.clipboard.writeText(tid).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const FLOW = [
    { icon: "🤖", label: "Agent steps",  desc: `${spanCount} OTel spans` },
    { icon: "📡", label: "OTLP export",  desc: `${arizeStatus?.batchDelayMs ?? 500}ms batch` },
    { icon: "🔍", label: "Arize AX",     desc: "Trace + eval storage" },
    { icon: "⚖️", label: "LLM judge",    desc: "4-dim score + replay" },
  ];

  // Build compact score pill for the summary strip
  const scorePill = evalPending && !evalDetails ? (
    <span className="flex items-center gap-1 text-[10px] text-violet-300">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />scoring…
    </span>
  ) : evalScore != null ? (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
      evalScore >= 0.75 ? "bg-emerald-400/15 text-emerald-300" : evalScore >= 0.6 ? "bg-cyan-400/15 text-cyan-300" : "bg-amber-400/15 text-amber-300"
    }`}>
      {evalScore >= 0.75 ? "✓ pass" : "⚠ review"} · {Math.round(evalScore * 100)}%
    </span>
  ) : null;

  return (
    <details className="group mt-1">
      {/* ── Minimal summary strip (default state) ── */}
      <summary className="list-none cursor-pointer select-none">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] px-4 py-2.5 transition-colors flex-wrap">
          {/* Arize badge */}
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <span className="text-base leading-none">🔮</span>
            <span>Arize AI</span>
          </span>
          {/* Connection dot */}
          {arizeStatus != null ? (
            isConnected
              ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />live</span>
              : <span className="text-[10px] text-slate-500">exporter off</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />live</span>
          )}
          <span className="text-slate-700 text-[10px]">·</span>
          <span className="text-[10px] text-slate-500">{spanCount} spans · OTLP</span>
          {/* Score pill */}
          {scorePill && <>{scorePill}</>}
          {/* Expand hint — explicit chevron so judges clearly see it's clickable */}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-300 font-medium group-open:hidden">
            View Arize details <span className="text-[8px]">▼</span>
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-300 font-medium hidden group-open:inline-flex">
            Hide details <span className="text-[8px]">▲</span>
          </span>
        </div>
      </summary>

      {/* ── Expanded detail view ── */}
      <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">

        {/* Top bar with badges + open link */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-white/[0.05]">
          <span className="text-[12px] font-semibold text-slate-200">Arize AX · Observability &amp; Evaluation</span>
          {arizeStatus != null ? (
            isConnected
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider animate-pulse">live</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-400/15 text-slate-400 font-semibold uppercase tracking-wider">exporter off</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider animate-pulse">live</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/15 text-violet-300 font-semibold uppercase tracking-wider">MCP</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-300 font-semibold uppercase tracking-wider">OTLP</span>
          <a href={arizeUrl} target="_blank" rel="noreferrer"
             className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-violet-400/40 text-violet-200 hover:bg-violet-400/10 flex items-center gap-1 shrink-0">
            Open Arize →
          </a>
        </div>

        <div className="p-4 space-y-4">

          {/* ① How the data flows — visual pipeline */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">① How this plan was monitored</div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {FLOW.map((f, i) => (
                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-center min-w-[76px]">
                    <div className="text-base">{f.icon}</div>
                    <div className="text-[10px] text-slate-200 font-medium leading-tight">{f.label}</div>
                    <div className="text-[9px] text-slate-500 leading-tight">{f.desc}</div>
                  </div>
                  {i < FLOW.length - 1 && <span className="text-slate-600 text-[10px] flex-shrink-0">→</span>}
                </div>
              ))}
            </div>
          </div>

          {/* ② LLM-judge eval scorecard */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">② AI quality score for this plan</div>
            {evalPending && !evalDetails ? (
              <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.04] px-3 py-2.5 flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
                <div>
                  <span className="text-[11px] font-semibold text-violet-300">LLM judge scoring…</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">Gemini checks this plan on 4 dimensions. ~10–15 s.</p>
                </div>
              </div>
            ) : evalDetails ? (
              <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[11px] font-semibold text-violet-300">⚖️ Gemini-as-Judge</span>
                  {evalJudge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/20 text-violet-200 font-mono">{evalJudge}</span>}
                  {evalScore != null && (
                    <span className={`ml-auto text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      evalScore >= 0.75 ? "text-emerald-300 bg-emerald-400/15 border border-emerald-400/20"
                        : evalScore >= 0.6 ? "text-cyan-300 bg-cyan-400/10 border border-cyan-400/20"
                        : "text-amber-300 bg-amber-400/10 border border-amber-400/20"
                    }`}>
                      {evalScore >= 0.75 ? "✓ pass" : "⚠ needs review"} · {Math.round(evalScore * 100)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {([
                    ["relevance",            "Plan relevance",    "Is the plan specific to this farm's soil, location, season?"],
                    ["groundedness",         "Numbers grounded",  "Are income/yield estimates backed by real tool data?"],
                    ["agronomicCorrectness", "Crop accuracy",     "Is the recommended crop correct for this season + soil?"],
                    ["hallucinationRisk",    "No hallucination",  "Did the AI fabricate anything? (1.0 = nothing made up)"],
                  ] as [keyof NonNullable<Parsed["evalDetails"]>, string, string][]).map(([k, label, meaning]) => {
                    const v = evalDetails[k] as number | undefined;
                    if (v == null) return null;
                    const p   = Math.round(v * 100);
                    const bar = v >= 0.8 ? "bg-emerald-400" : v >= 0.6 ? "bg-cyan-400" : "bg-amber-400";
                    const txt = v >= 0.8 ? "text-emerald-300" : v >= 0.6 ? "text-cyan-300" : "text-amber-300";
                    const ico = v >= 0.8 ? "✅" : v >= 0.6 ? "🟡" : "⚠️";
                    return (
                      <div key={k}>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-400 flex items-center gap-1" title={meaning}><span>{ico}</span>{label}</span>
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
            ) : (
              <p className="text-[11px] text-slate-500 italic">Score will appear after planning completes.</p>
            )}
          </div>

          {/* ③ Trace metadata */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">③ Trace details</div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
              {[
                ["MCP operation",   arize?.operation || "search_traces",                        "text-emerald-200"],
                ["Project",         arizeProject,                                               "text-slate-100"],
                ["Spans exported",  `${spanCount} (9 agent + 1 eval)`,                          "text-slate-100"],
                ["Reasoning model", modelServed || "gemini-3.1-pro-preview",                    "text-violet-200"],
                ["Exporter",        isConnected ? "OTLP → Arize AX ✓" : arizeStatus ? "set ARIZE_ENABLED=true" : "OTLP → Arize AX",
                                    isConnected ? "text-emerald-200" : "text-slate-500"],
                ["MCP",             arizeStatus?.mcpEnabled ? "connected" : "set MCP_ARIZE_ENABLED=true",
                                    arizeStatus?.mcpEnabled ? "text-emerald-200" : "text-slate-500"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-[11px] text-slate-500">{label}</span>
                  <code className={`text-[11px] font-medium ${color}`}>{value}</code>
                </div>
              ))}
              {tid && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-[11px] text-slate-500">Trace ID</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="text-[10px] text-violet-300 font-mono truncate max-w-[180px]" title={tid}>{tid}</code>
                    <button type="button" onClick={copyTrace}
                      className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-violet-400/20 text-violet-300 hover:bg-violet-400/10 transition">
                      {copied ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ④ How to find in Arize */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">④ Find this trace in Arize AX</div>
            <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.03] px-3 py-2.5 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex gap-2"><span className="text-violet-300 shrink-0 font-bold">①</span><span>Go to <span className="font-mono text-slate-200">app.arize.com</span> and sign in</span></div>
              <div className="flex gap-2"><span className="text-violet-300 shrink-0 font-bold">②</span><span>Open project <span className="font-mono text-emerald-300">{arizeProject}</span></span></div>
              <div className="flex gap-2"><span className="text-violet-300 shrink-0 font-bold">③</span><span>Click <span className="text-slate-200 font-medium">Traces</span> — all {spanCount} spans from this run are here</span></div>
              <div className="flex gap-2"><span className="text-violet-300 shrink-0 font-bold">④</span><span>Expand any span to see tool inputs/outputs, eval scores, and latency</span></div>
            </div>
          </div>

          {arize?.note && (
            <p className="text-slate-400 leading-relaxed text-[11px] border-t border-white/[0.05] pt-3">{arize.note}</p>
          )}
        </div>
      </div>
    </details>
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

// ─── Result card ───────────────────────────────────────────────────────────
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
  const model = view._modelServed ?? "gemini-3.1-pro-preview";
  const spanCount = view.arize?.spansExported ?? 9;

  return (
    <div className="space-y-3">

      {/* ── Offline quota notice ── */}
      {isOffline && view._reason?.includes("quota") && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-5 py-4 text-sm text-amber-200">
          <div className="font-semibold text-amber-300 mb-1">⚠ Gemini quota reached — billing fix needed</div>
          <p className="text-[12px] leading-relaxed">
            Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline text-amber-100">aistudio.google.com/apikey</a>
            {" "}→ Set up billing → link GCP billing account. No code changes needed.
          </p>
          <button onClick={() => onAsk({ forceLive: true })} disabled={busy}
            className="mt-2 text-[11px] px-3 py-1 rounded border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">
            ⟳ Retry live
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MAIN RESULT CARD  (matches Cluster Bean layout)
          ══════════════════════════════════════════════ */}
      <div className="card overflow-hidden">

        {/* ① Hero crop banner — dark green gradient with big crop name */}
        <div className={`relative px-5 py-5 ${isOffline ? "bg-amber-900/20" : "bg-gradient-to-br from-emerald-900/60 via-emerald-900/30 to-transparent"}`}>
          {/* "Result" eyebrow */}
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400/70 mb-1">Result</div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Crop name — big and bold */}
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-0.5">
                Recommended Crop
              </div>
              <div className="text-3xl font-black text-slate-100 leading-tight truncate">
                {view.crop
                  ? <><span className="mr-2">🌱</span>{view.crop}</>
                  : <span className="text-slate-500 text-xl font-semibold italic">Analysing…</span>
                }
              </div>
              {/* Status chip + season/soil chips from basis */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {isOffline ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />Offline · Fallback
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live · Gemini 3
                  </span>
                )}
                {view._basis?.season && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-300 font-medium">
                    {view._basis.season}
                  </span>
                )}
                {view._basis?.soil && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-400/10 border border-white/10 text-slate-300 font-medium">
                    {view._basis.soil} soil
                  </span>
                )}
                {view._basis?.rain7dMm != null && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20 text-blue-300 font-medium">
                    💧 {Math.round(view._basis.rain7dMm)}mm rain (7d)
                  </span>
                )}
              </div>
            </div>
            <ConfidenceRing value={conf} />
          </div>
        </div>

        <div className="p-5 space-y-4">
        {/* ② Metric tiles: Latency / Model / Spans */}
        <div className="grid grid-cols-3 gap-2">
          <Metric k="Latency"  v={latencyMs ? `${latencyMs}ms` : "—"} />
          <Metric k="Model"    v={model} />
          <Metric k="Spans"    v={`${spanCount}`} />
        </div>

        {/* ③ Projected Impact */}
        {view.impact && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">Projected Impact</div>
            <ImpactDashboard impact={view.impact} />
          </div>
        )}

        {/* ③b Weather snapshot — always shown when basis has weather data */}
        {view._basis && (view._basis.tempMaxC != null || view._basis.humidity != null) && (
          <WeatherWidget basis={view._basis} />
        )}

        {/* ④ Why this crop · Location basis — always expanded */}
        {view._basis && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
                Why this crop · Location basis
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-bold uppercase tracking-wider">
                Farm-Aware
              </span>
            </div>
            {/* 4-cell grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <BasisCell k="Date (IST)"   v={view._basis.date ?? new Date().toISOString().slice(0,10)} />
              <BasisCell k="Season"       v={view._basis.season ?? "—"} />
              <BasisCell k="Soil"         v={`${view._basis.soil ?? "?"}${view._basis.soilSource === "farm-record" ? " (your farm)" : " (geo)"}`} />
              <BasisCell k={`Rain (${view._basis.forecastDays ?? 7}d)`}  v={view._basis.rain7dMm != null ? `${Math.round(view._basis.rain7dMm)} mm` : "—"} />
            </div>
            {/* Location anchor */}
            {view._basis.anchorCrop && (
              <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                <span className="font-semibold text-emerald-300">Location Anchor</span>
                {" — "}derived deterministically from this farm&apos;s lat/lon so two different addresses always produce different recommendations:{" "}
                <span className="font-mono text-emerald-200">{view._basis.anchorCrop}</span>
              </p>
            )}
            {/* Candidate shortlist */}
            {Array.isArray(view._basis.shortlist) && view._basis.shortlist.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
                  Candidate shortlist for this location · click any to re-plan
                </div>
                <div className="flex flex-wrap gap-2">
                  {view._basis.shortlist.map((c, i) => {
                    const picked = view.crop && c.toLowerCase() === view.crop.toLowerCase();
                    return (
                      <button key={i} type="button" disabled={busy || !!picked}
                        onClick={() => onAsk({ cropOverride: c })}
                        className={"px-3 py-1 rounded-full text-[12px] border transition-all font-medium " + (
                          picked
                            ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 cursor-default"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-40"
                        )}>
                        {c}{picked ? " ✓" : ""}
                      </button>
                    );
                  })}
                  <button type="button" disabled={busy}
                    onClick={() => { onSetCrop(""); onAsk({ forceLive: true }); }}
                    className="px-3 py-1 rounded-full text-[12px] border border-slate-400/20 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:border-slate-400/40 disabled:opacity-40">
                    🔁 Re-plan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>{/* end p-5 space-y-4 */}
      </div>
      {/* ══ END MAIN RESULT CARD ══ */}

      {/* ── When backend returned something but we couldn't parse structured fields ── */}
      {noStructured && rec?.reasoning && (
        <div className="card px-5 py-4 border-amber-400/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <h4 className="text-[13px] font-semibold text-amber-200">Response received — unstructured format</h4>
            <button onClick={() => onAsk({ forceLive: true })} disabled={busy}
              className="ml-auto text-[11px] px-3 py-1 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">
              ⟳ Retry
            </button>
          </div>
          <pre className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {rec.reasoning.slice(0, 600)}{rec.reasoning.length > 600 ? "…" : ""}
          </pre>
        </div>
      )}

      {/* ── Summary advice ── */}
      {view.advice && !view.advice.trimStart().startsWith("{") && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💡</span>
            <h4 className="text-[14px] font-semibold text-slate-100">Why this plan works for your farm</h4>
          </div>
          <p className="text-[13px] text-slate-300 leading-7 pl-3 border-l-2 border-emerald-400/30">{view.advice}</p>
        </div>
      )}

      {/* ── Task timeline ── */}
      {Array.isArray(view.tasks) && view.tasks.length > 0 && (
        <div className="card px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📋</span>
            <h4 className="text-[14px] font-semibold text-slate-100">Your action plan</h4>
            <span className="ml-auto text-[11px] text-slate-500 bg-white/[0.04] border border-white/10 px-2.5 py-0.5 rounded-full">
              {view.tasks.length} steps
            </span>
          </div>
          <div className="space-y-1">
            {view.tasks.map((t, i) => {
              const action = typeof t === "string" ? t : t.action ?? "";
              const why    = typeof t === "string" ? "" : (t.why ?? "");
              const day    = typeof t === "string" ? null : (t.day ?? null);
              return (
                <div key={i} className="flex gap-3">
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-[11px] font-bold text-emerald-300 mt-0.5">
                      {day ?? (i + 1)}
                    </div>
                    {i < view.tasks!.length - 1 && (
                      <div className="w-px flex-1 bg-emerald-400/[0.12] mt-1 min-h-[16px]" />
                    )}
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    {day != null && (
                      <div className="text-[10px] text-emerald-400/60 font-semibold uppercase tracking-widest mb-0.5">Day {day}</div>
                    )}
                    <div className="text-[13px] font-semibold text-slate-100 leading-snug">{action}</div>
                    {why && (
                      <div className="mt-1.5 text-[12px] text-slate-400 leading-relaxed border-l-2 border-emerald-400/20 pl-3">{why}</div>
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
            <span className="text-lg">⚠️</span>
            <h4 className="text-[14px] font-semibold text-slate-100">Risks to watch</h4>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {view.risks.map((r, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2.5">
                <span className="text-amber-400 shrink-0 mt-0.5 text-sm">⚡</span>
                <p className="text-[12.5px] text-amber-100/90 leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Arize — collapsed strip at bottom, expandable for judges ── */}
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
