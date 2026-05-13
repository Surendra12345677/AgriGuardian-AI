"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Lang } from "./LanguageSelector";

type Diag = {
  diagnosis?: string;
  confidence?: number;
  explanation?: string;
  treatments?: { step: string; cost: "LOW" | "MED" | "HIGH" }[];
  prevention?: string[];
  urgency?: "LOW" | "MEDIUM" | "HIGH";
};

const SAMPLES = [
  { crop: "wheat", symptoms: "Orange-brown powdery pustules on the upper leaf surface; lower leaves yellowing; warm humid weather past 2 weeks." },
  { crop: "tomato", symptoms: "Dark concentric rings on older leaves; lesions spreading to stems; high overnight humidity." },
  { crop: "cotton", symptoms: "Bolls have small holes; tiny pinkish caterpillars inside; flowering stage." },
];

export default function PlantDoctor({ language }: { language: Lang }) {
  const [crop, setCrop] = useState("wheat");
  const [symptoms, setSymptoms] = useState("");
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!symptoms.trim()) return;
    setBusy(true); setError(null); setDiag(null);
    try {
      const out = await api.diagnose({ crop, symptoms, language });
      let parsed: Diag = {};
      try { parsed = JSON.parse(out.raw); } catch { parsed = { explanation: out.raw }; }
      setDiag(parsed);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const urgencyBadge = (u?: string) => {
    const map: Record<string, string> = {
      LOW:    "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
      MEDIUM: "bg-amber-400/15  text-amber-300  border-amber-400/40",
      HIGH:   "bg-rose-400/15   text-rose-300   border-rose-400/40",
    };
    return `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[u ?? "LOW"]}`;
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="label">Plant Doctor</div>
          <h3 className="text-lg font-semibold text-slate-100">Diagnose a sick crop in 2 seconds</h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-md">
            Describe the symptoms — Gemini matches them to the most likely disease/pest and prescribes treatment.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-1 space-y-2">
          <div>
            <span className="label">Crop</span>
            <input className="input mt-1" value={crop}
                   onChange={e => setCrop(e.target.value)} />
          </div>
          <div>
            <span className="label">Try a sample</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {SAMPLES.map(s => (
                <button key={s.crop}
                        onClick={() => { setCrop(s.crop); setSymptoms(s.symptoms); }}
                        className="chip hover:border-emerald-400/50">
                  {s.crop}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="md:col-span-2 space-y-2">
          <span className="label">Symptoms</span>
          <textarea className="input min-h-[88px] mt-1"
                    placeholder="e.g. yellow patches on lower leaves with white powder underside…"
                    value={symptoms}
                    onChange={e => setSymptoms(e.target.value)} />
          <div className="flex justify-end">
            <button onClick={go} disabled={busy || !symptoms.trim()} className="btn-primary">
              {busy ? "Diagnosing…" : "🩺 Diagnose"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {diag && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[11px] text-slate-400">Likely diagnosis</div>
              <div className="text-lg font-semibold text-emerald-200">
                {diag.diagnosis ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={urgencyBadge(diag.urgency)}>{diag.urgency ?? "LOW"} urgency</span>
              {diag.confidence != null && (
                <span className="chip">{Math.round(diag.confidence * 100)}% conf.</span>
              )}
            </div>
          </div>

          {diag.explanation && (
            <p className="text-sm text-slate-200 leading-relaxed">{diag.explanation}</p>
          )}

          {Array.isArray(diag.treatments) && diag.treatments.length > 0 && (
            <div>
              <div className="label mb-1.5">Treatment plan</div>
              <ol className="space-y-1.5">
                {diag.treatments.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="grid place-items-center h-5 w-5 rounded bg-emerald-400/20
                                     text-emerald-200 text-[10px] font-bold">{i + 1}</span>
                    <span className="text-slate-200 flex-1">{t.step}</span>
                    <span className="chip text-[10px]">{t.cost}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {Array.isArray(diag.prevention) && diag.prevention.length > 0 && (
            <div>
              <div className="label mb-1.5">Prevent next time</div>
              <ul className="text-xs text-slate-300 list-disc list-inside space-y-0.5">
                {diag.prevention.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

