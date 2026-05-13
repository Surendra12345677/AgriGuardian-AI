"use client";
import { useState } from "react";
import { api, type Farm, type Recommendation } from "@/lib/api";
import { AgentTrace } from "./AgentTrace";
import LanguageSelector, { type Lang } from "./LanguageSelector";
import ImpactDashboard, { type Impact } from "./ImpactDashboard";
import FarmMap from "./FarmMap";
type Parsed = {
  advice?: string;
  crop?: string;
  tasks?: (string | { day?: number; action?: string; why?: string })[];
  confidence?: number;
  impact?: Impact;
  risks?: string[];
};
const DEMO_FALLBACK: Parsed = {
  advice:
    "Sow soybean (kharif) on the black-soil block — moisture retention is high and current mandi prices favour pulses. Reserve 0.5 acre for onion (rabi) to smooth cash flow.",
  crop: "Soybean + Onion (split)",
  confidence: 0.74,
  impact: {
    expectedRevenueInr: 92000,
    extraIncomeInr: 38400,
    yieldDeltaPct: 18,
    waterSavingsPct: 22,
    costInr: 28500,
    paybackWeeks: 14,
  },
  tasks: [
    { day: 1,  action: "Deep ploughing + 2t FYM/acre",         why: "Improves soil structure before sowing." },
    { day: 7,  action: "Sow soybean JS-335 @ 75 kg/acre",      why: "Variety suited to medium rainfall belt." },
    { day: 21, action: "First weeding + 20:40:0 NPK basal",    why: "Critical 3-week weed-free window." },
    { day: 45, action: "Foliar spray 2% urea if pod-set lag",  why: "Boosts seed-fill if monsoon stresses the crop." },
  ],
  risks: [
    "Mid-season dry spell can drop yields ~12% — keep 1 protective irrigation in reserve.",
    "Yellow Mosaic Virus pressure in district — scout weekly and rogue infected plants.",
    "Mandi price floor at ₹4,200/q assumed — consider FPO aggregation for bargaining power.",
  ],
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
  async function ask() {
    if (!farm) return;
    setBusy(true); setError(null); setRec(null); setTEnd(null);
    setTStart(performance.now());
    try {
      const out = await api.recommend({
        farmId:    farm.id,
        latitude:  farm.latitude,
        longitude: farm.longitude,
        preferredCrop: crop || undefined,
        language,
        scenario: "BASELINE",
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
  const view: Parsed = usedFallback ? DEMO_FALLBACK : parsed;
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
        <div className="mt-3">
          <span className="label">Reply language</span>
          <div className="mt-1.5">
            <LanguageSelector value={language} onChange={onLanguageChange} />
          </div>
        </div>
        {!farm ? (
          <p className="mt-4 text-sm text-slate-500 italic">
            Pick a farm on the left, or click <em>One-click demo farm</em>.
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
            <button onClick={ask} disabled={busy} className="btn-primary">
              {busy ? <span className="flex items-center gap-2"><Spinner /> Planning…</span>
                    : <>▶ Plan my season</>}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-300 mt-3 break-all">{error}</p>}
      </div>
      {(busy || rec || error) && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <AgentTrace running={busy} finished={!!rec} errored={!!error} />
            {farm && <FarmMap lat={farm.latitude} lon={farm.longitude} />}
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-100">Result</h3>
                {view.crop && (
                  <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider mt-0.5">
                    Recommended crop · {view.crop}
                  </div>
                )}
                {usedFallback && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px]
                                  uppercase tracking-wider text-amber-300/90 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                    Showing curated baseline · model returned no JSON
                  </div>
                )}
              </div>
              <ConfidenceRing value={busy ? -1 : conf} />
            </div>
            {rec ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric k="Latency" v={latencyMs ? `${latencyMs}ms` : "—"} />
                  <Metric k="Model"   v="gemini-2.5-flash" />
                  <Metric k="Tools"   v="5" />
                </div>
                {view.impact && <div className="mt-4"><ImpactDashboard impact={view.impact} /></div>}
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
                    <ol className="space-y-2">
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