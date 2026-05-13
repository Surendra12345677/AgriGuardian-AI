"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import FarmForm from "@/components/FarmForm";
import FarmList from "@/components/FarmList";
import AgentPanel from "@/components/AgentPanel";
import Hero from "@/components/Hero";
import PartnerStrip from "@/components/PartnerStrip";
import HowItWorks from "@/components/HowItWorks";
import WhatIfScenarios from "@/components/WhatIfScenarios";
import PlantDoctor from "@/components/PlantDoctor";
import LanguageSelector, { type Lang } from "@/components/LanguageSelector";

export default function HomePage() {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [selected, setSelect] = useState<Farm | undefined>();
  const [loading, setLoading] = useState(true);
  const [bootError, setBoot]  = useState<string | null>(null);
  const [lang, setLang]       = useState<Lang>("en");

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.listFarms();
      setFarms(list);
      if (!selected && list.length) setSelect(list[0]);
    } catch (err: any) {
      setBoot(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-20">
      <Hero />

      {bootError && (() => {
        const msg = bootError.toLowerCase();
        const isDbDown =
          msg.includes("500") || msg.includes("mongo") ||
          msg.includes("timeout") || msg.includes("connection refused");
        return (
          <div className={`card px-4 py-3 text-sm ${isDbDown ? "border-amber-400/30" : "border-red-400/30"}`}>
            {isDbDown ? (
              <>
                <strong className="text-amber-300">MongoDB is not connected.</strong>
                {" "}Agent + tool endpoints still work. Start MongoDB or set <code>SPRING_DATA_MONGODB_URI</code> to an Atlas cluster.
              </>
            ) : (
              <>
                <strong className="text-red-300">Backend unreachable</strong>{" "}({bootError}).
                Ensure Spring Boot is running on <code>localhost:8080</code>.
              </>
            )}
          </div>
        );
      })()}

      <HowItWorks />

      {/* ── 1 · Onboard a farm ─────────────────────────────────────────── */}
      <SectionHeader
        id="onboard"
        eyebrow="Step 1 · Onboard"
        title={<>Add your farm — location, soil, water, budget.</>}
        sub="The agent grounds every recommendation in this profile. You can edit or add more farms anytime."
      />
      <div className="grid xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <FarmForm onCreated={f => { setFarms(prev => [f, ...prev]); setSelect(f); }} />
        </div>
        <aside className="xl:col-span-1">
          <div className="card p-5 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-100">Your farms</h2>
              <span className="chip">{farms.length}</span>
            </div>
            <FarmList farms={farms} selectedId={selected?.id}
                      onSelect={f => setSelect(f)} loading={loading} />
            {selected && (
              <div className="mt-4 pt-4 border-t border-white/5 text-xs text-slate-400 space-y-1">
                <div className="text-slate-500 uppercase tracking-wider text-[10px]">Active farm</div>
                <div className="text-slate-100 font-medium">{selected.farmerName}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
                </div>
                <div className="text-[11px]">
                  {selected.landSizeAcres} ac · {selected.soilType} · water {selected.waterAvailability}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Shared language selector — placed once, between onboard and the AI sections */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <span className="label">Reply language for the agent</span>
        <LanguageSelector value={lang} onChange={setLang} />
        <span className="text-xs text-slate-500 ml-auto">
          Applies to Plan, What-if and Plant Doctor below.
        </span>
      </div>

      {/* ── 2 · Plan a season ──────────────────────────────────────────── */}
      <SectionHeader
        id="plan"
        eyebrow="Step 2 · Plan"
        title={<>Plan the most profitable season.</>}
        sub="Gemini calls weather, soil and market tools, then emits a JSON plan with a day-by-day task list and projected income."
      />
      {selected ? (
        <AgentPanel farm={selected} language={lang} onLanguageChange={setLang} />
      ) : (
        <NeedFarmCard label="Save a farm above to enable the planner." />
      )}

      {/* ── 3 · What-if ─────────────────────────────────────────────────── */}
      <SectionHeader
        id="scenarios"
        eyebrow="Step 3 · Stress-test"
        title={<>What if it rains less, or prices crash?</>}
        sub="The agent re-runs the full plan against four realistic shocks so you see how robust the strategy actually is."
      />
      {selected ? (
        <WhatIfScenarios farm={selected} language={lang} />
      ) : (
        <NeedFarmCard label="Save a farm above to run scenario stress-tests." />
      )}

      {/* ── 4 · Plant doctor ───────────────────────────────────────────── */}
      <SectionHeader
        id="doctor"
        eyebrow="Step 4 · Diagnose"
        title={<>Sick crop? Describe what you see.</>}
        sub="Doesn&apos;t need a saved farm. Type symptoms in any of the supported languages — Gemini matches them to a likely disease or pest and prescribes treatment."
      />
      <PlantDoctor language={lang} />

      <section id="stack" className="scroll-mt-20 space-y-4">
        <SectionHeader
          eyebrow="Stack"
          title={<>Production-grade plumbing, in the box.</>}
          sub="Every component is observable end-to-end via OpenTelemetry. No vendor lock-in: swap models or stores at the boundary."
        />
        <div className="-mt-2"><PartnerStrip /></div>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function NeedFarmCard({ label }: { label: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-full
                      bg-emerald-400/10 border border-emerald-400/30 text-emerald-300">🌾</div>
      <p className="text-slate-300 text-sm">{label}</p>
      <a href="#onboard" className="btn-ghost text-sm mt-4 inline-flex">
        ↑ Go to onboarding
      </a>
    </div>
  );
}

function SectionHeader({ id, eyebrow, title, sub, action }: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]
                          text-emerald-300/90 font-semibold">
            <span className="h-px w-6 bg-emerald-400/50" />
            {eyebrow}
          </div>
          <h2 className="mt-2 text-3xl md:text-4xl font-bold text-slate-100 tracking-tight">
            {title}
          </h2>
          {sub && (
            <p className="text-slate-400 text-sm md:text-base mt-2 leading-relaxed">
              {sub}
            </p>
          )}
        </div>
        {action}
      </div>
    </section>
  );
}
