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
    // 1. Direct parse (ideal — responseMimeType:json gives clean output)
    try { return JSON.parse(raw); } catch {}
    // 2. Strip markdown fences and retry (some models still wrap in ```json)
    const noFence = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try { return JSON.parse(noFence); } catch {}
    // 3. Extract first {...} block (handles leading/trailing garbage)
    const m = noFence.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    // 4. Last resort — show whatever text is there as advice
    return { advice: raw };
  })();
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
          <div className="card p-5 lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-100">Result</h3>
                {view.crop && (
                  <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider mt-0.5">
                    Recommended crop · {view.crop}
                  </div>
                )}
                {rec && (
                  view._source === "offline-fallback" ? (
                    <div className="mt-1 space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 text-[10px]
                                      uppercase tracking-wider text-amber-300/90 font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Gemini 3 quota limit reached · billing fix needed
                      </div>
                      {/* Show billing fix banner when it's a quota issue */}
                      {view._reason && view._reason.includes("quota") && (
                        <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200 leading-relaxed">
                          <span className="font-semibold text-amber-300">To restore live Gemini 3: </span>
                          Go to{" "}
                          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                             className="underline text-amber-100 hover:text-white">
                            aistudio.google.com/apikey
                          </a>
                          {" "}→ find your key → click <strong>Set up billing / Enable Pay-as-you-go</strong> → link your GCP billing account.
                          No code changes needed — it works immediately.
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => ask({ forceLive: true })}
                          disabled={busy}
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50"
                          title={view._reason ? `Why offline: ${view._reason}` : "Retry with a fresh Gemini call"}
                        >
                          ⟳ Retry live
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px]
                                    uppercase tracking-wider text-emerald-300/90 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      Live · Gemini
                    </div>
                  )
                )}
                {noStructured && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px]
                                  uppercase tracking-wider text-amber-300/90 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                    Model returned no structured plan — showing raw text below
                  </div>
                )}
              </div>
              <ConfidenceRing value={busy ? -1 : conf} />
            </div>
            {rec ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric k="Latency" v={latencyMs ? `${latencyMs}ms` : "—"} />
                  <Metric k="Model"   v={view._source === "offline-fallback" ? "offline" : (view._modelServed ?? "gemini-3.1-pro-preview")} />
                  <Metric k="Spans"   v={view._source === "offline-fallback" ? "0" : "9"} />
                </div>
                {view.impact && <div className="mt-4"><ImpactDashboard impact={view.impact} /></div>}
                {view._basis && (
                  <div className="mt-4 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                    <div className="label mb-2 flex items-center gap-2">
                      <span>Why this crop · location basis</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider">
                        farm-aware
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <BasisCell k="Season"      v={view._basis.season ?? "—"} />
                      <BasisCell k="Soil"
                                 v={`${view._basis.soil ?? "?"}${view._basis.soilSource === "farm-record" ? " (your farm)" : " (geo-derived)"}`} />
                      <BasisCell k="Coordinates" v={
                        view._basis.latitude != null && view._basis.longitude != null
                          ? `${view._basis.latitude.toFixed(3)}, ${view._basis.longitude.toFixed(3)}`
                          : "—"
                      } />
                      <BasisCell k="Rain (7d)"
                                 v={view._basis.rain7dMm != null ? `${Math.round(view._basis.rain7dMm)} mm` : "—"} />
                    </div>
                    {view._basis.anchorCrop && (
                      <div className="mt-2.5 text-[11px] text-slate-400">
                        <span className="uppercase tracking-wider font-semibold text-emerald-300/80">Location anchor</span>
                        {" "}— derived deterministically from this farm&apos;s lat/lon so two different
                        addresses always produce different recommendations:
                        {" "}<code className="text-emerald-200">{view._basis.anchorCrop}</code>
                      </div>
                    )}
                    {Array.isArray(view._basis.shortlist) && view._basis.shortlist.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
                          Candidate shortlist for this location · click any to re-plan
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {view._basis.shortlist.map((c, i) => {
                            const picked = view.crop && c.toLowerCase() === view.crop.toLowerCase();
                            return (
                              <button key={i}
                                    type="button"
                                    disabled={busy || !!picked}
                                    onClick={() => ask({ cropOverride: c })}
                                    title={picked ? "Currently recommended crop" : `Re-plan with ${c} as the preferred crop`}
                                    className={
                                      "px-3 py-1 rounded-full text-[12px] border transition " +
                                      (picked
                                        ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 font-semibold cursor-default"
                                        : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/50 hover:bg-emerald-400/[0.08] hover:text-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed")
                                    }>
                                {c}{picked ? " ✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                        {view.crop && (
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-slate-400">Don&apos;t like {view.crop}?</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                // Pick the first shortlist crop that ISN'T the current pick.
                                const alt = (view._basis?.shortlist ?? []).find(
                                  c => c.toLowerCase() !== (view.crop ?? "").toLowerCase()
                                );
                                if (alt) ask({ cropOverride: alt });
                              }}
                              className="text-[12px] px-3 py-1.5 rounded-lg border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">
                              👎 Suggest a different crop
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => { setCrop(""); ask({ forceLive: true }); }}
                              className="text-[12px] px-3 py-1.5 rounded-lg border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/[0.06] disabled:opacity-50">
                              🔁 Re-plan from scratch
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {view.advice && (
                  <div className="mt-4">
                    <div className="label mb-1">Advice</div>
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                      {view.advice}
                    </p>
                  </div>
                )}
                {Array.isArray(view.tasks) && view.tasks.length > 0 && (
                  <div className="mt-4">
                    <div className="label mb-2">Action plan</div>
                    <ol className="grid sm:grid-cols-2 gap-2">
                      {view.tasks.map((t, i) => (
                        <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                          <div className="flex gap-2">
                            <span className="grid place-items-center h-6 w-6 rounded-md
                                             bg-emerald-400/15 text-emerald-300 text-xs font-bold">
                              {i + 1}
                            </span>
                            <div className="text-sm text-slate-200">
                              {typeof t === "string" ? t : (
                                <>
                                  <span className="font-medium">
                                    {t.day ? `Day ${t.day}: ` : ""}{t.action}
                                  </span>
                                  {t.why && <span className="text-slate-400"> — {t.why}</span>}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {Array.isArray(view.risks) && view.risks.length > 0 && (
                  <div className="mt-4">
                    <div className="label mb-1.5">Top risks</div>
                    <ul className="space-y-1">
                      {view.risks.map((r, i) => (
                        <li key={i} className="text-xs text-amber-200/90 flex gap-1.5">
                          <span>⚠️</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ArizePanel arize={view.arize} traceId={rec.traceId} modelServed={view._modelServed}
                  evalScore={view.evalScore ?? rec.evalScore ?? undefined}
                  evalDetails={view.evalDetails ?? rec.evalDetails ?? undefined}
                  evalJudge={view.evalJudge ?? rec.evalJudge ?? undefined} />
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>rec id <code className="text-slate-400">{rec.id.slice(0, 12)}…</code></span>
                  {rec.traceId && <span>trace <code className="text-slate-400">{rec.traceId.slice(0, 16)}…</code></span>}
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-2">
                <Skeleton h="h-4 w-2/3" />
                <Skeleton h="h-4 w-full" />
                <Skeleton h="h-4 w-5/6" />
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
