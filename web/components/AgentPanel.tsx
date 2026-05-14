"use client";
import { useState } from "react";
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
  _source?: string;     // "offline-fallback" when Gemini quota was saved
  _reason?: string;
  _basis?: {
    season?: string;
    month?: number;
    latitude?: number;
    longitude?: number;
    soil?: string;
    soilSource?: string;
    rain7dMm?: number;
    shortlist?: string[];
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
  async function ask(opts?: { forceLive?: boolean }) {
    if (!farm) return;
    setBusy(true); setError(null); setRec(null); setTEnd(null);
    setTStart(performance.now());
    try {
      if (opts?.forceLive) {
        // Best-effort cache reset on the server too — ignore errors so the
        // planner still runs even if the admin endpoint is locked down.
        try { await api.clearCache(); } catch { /* non-fatal */ }
      }
      const out = await api.recommend({
        farmId:    farm.id,
        latitude:  farm.latitude,
        longitude: farm.longitude,
        preferredCrop: crop || undefined,
        language,
        scenario: "BASELINE",
        forceLive: opts?.forceLive,
      });
      setRec(out);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTEnd(performance.now());
      setBusy(false);
    }
  }
  const parsed: Parsed = (() => {
    const raw = (rec?.reasoning ?? "").trim();
    if (!raw) return {};
    try { return JSON.parse(raw); } catch {}
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { advice: raw };
  })();
  const usedFallback = !!rec
    && !parsed.advice && !parsed.crop && !(parsed.tasks?.length) && !parsed.impact;
  const view: Parsed = parsed;
  const noStructured = usedFallback;
  const latencyMs = tStart && tEnd ? Math.round(tEnd - tStart) : null;
  const conf = view.confidence ?? (rec?.confidenceScore ?? 0);
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
            <button onClick={() => ask()} disabled={busy} className="btn-primary">
              {busy ? <span className="flex items-center gap-2"><Spinner /> Planning…</span>
                    : <>▶ Plan my season</>}
            </button>
            <button
              onClick={() => ask({ forceLive: true })}
              disabled={busy}
              title="Skip the result cache and force a fresh Gemini call"
              className="text-xs px-3 py-2 rounded-lg border border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/[0.06] disabled:opacity-50"
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
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <div className="inline-flex items-center gap-1 text-[10px]
                                      uppercase tracking-wider text-amber-300/90 font-semibold"
                           title={view._reason || ""}>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                        Offline plan · Gemini quota saved
                      </div>
                      <button
                        onClick={() => ask({ forceLive: true })}
                        disabled={busy}
                        className="text-[10px] px-2 py-0.5 rounded border border-amber-300/40 text-amber-200 hover:bg-amber-300/10 disabled:opacity-50"
                        title={view._reason ? `Why offline: ${view._reason}` : "Retry with a fresh Gemini call"}
                      >
                        ⟳ Retry live
                      </button>
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
                  <Metric k="Model"   v={view._source === "offline-fallback" ? "offline" : "gemini-2.5-flash"} />
                  <Metric k="Tools"   v="5" />
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
                          ? `${view._basis.latitude.toFixed(2)}, ${view._basis.longitude.toFixed(2)}`
                          : "—"
                      } />
                      <BasisCell k="Rain (7d)"
                                 v={view._basis.rain7dMm != null ? `${Math.round(view._basis.rain7dMm)} mm` : "—"} />
                    </div>
                    {Array.isArray(view._basis.shortlist) && view._basis.shortlist.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                          Candidate shortlist for this location
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {view._basis.shortlist.map((c, i) => {
                            const picked = view.crop && c.toLowerCase() === view.crop.toLowerCase();
                            return (
                              <span key={i}
                                    className={
                                      "px-2 py-0.5 rounded-full text-[11px] border " +
                                      (picked
                                        ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 font-semibold"
                                        : "border-white/10 bg-white/[0.04] text-slate-300")
                                    }>
                                {c}{picked ? " ✓" : ""}
                              </span>
                            );
                          })}
                        </div>
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
                {view.arize || rec.traceId ? (
                  <div className="mt-4">
                    <div className="label mb-1.5 flex items-center gap-2">
                      <span>Arize AX · partner telemetry</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-semibold uppercase tracking-wider">
                        live
                      </span>
                    </div>
                    <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">MCP operation</span>
                        <code className="text-emerald-200">{view.arize?.operation || "search_traces"}</code>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Source</span>
                        <code className="text-slate-200">{view.arize?.source || "arize-mcp"}</code>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Spans exported</span>
                        <code className="text-slate-200">
                          {view.arize?.spansExported ?? 9} via {view.arize?.exporter || "OTLP → Arize AX"}
                        </code>
                      </div>
                      {(view.arize?.traceId || rec.traceId) && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Trace id</span>
                          <code className="text-slate-300">
                            {(view.arize?.traceId || rec.traceId || "").slice(0, 16)}…
                          </code>
                        </div>
                      )}
                      {view.arize?.note && (
                        <p className="pt-1.5 mt-1.5 border-t border-emerald-400/10 text-slate-300 leading-relaxed">
                          {view.arize.note}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
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