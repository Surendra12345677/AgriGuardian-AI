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
import type { Lang } from "@/components/LanguageSelector";

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

  async function loadDemoFarm() {
    try {
      const created = await api.createFarm({
        farmerName: "Demo Farmer",
        contact: "+91-99999-00000",
        latitude: 28.61,
        longitude: 77.20,
        landSizeAcres: 2.5,
        waterAvailability: "MEDIUM",
        soilType: "LOAM",
        budgetInr: 60000,
      });
      setFarms(prev => [created, ...prev]);
      setSelect(created);
      document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      setBoot(err.message);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-12">
      <Hero onTryDemo={loadDemoFarm} />
      <PartnerStrip />

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

      <section id="demo" className="scroll-mt-20 space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="label">Live demo</div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-100">
              Plan a season — get a real ₹ impact estimate
            </h2>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              The agent calls Weather → Soil → Market → Mongo, then reasons with Gemini in your language and emits
              a season plan with concrete revenue, yield and water projections.
            </p>
          </div>
          <button onClick={loadDemoFarm} className="btn-ghost text-sm">
            ⚡ One-click demo farm
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <FarmForm onCreated={f => { setFarms(prev => [f, ...prev]); setSelect(f); }} />
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-100">Your farms</h2>
                <span className="chip">{farms.length}</span>
              </div>
              <FarmList farms={farms} selectedId={selected?.id}
                        onSelect={setSelect} loading={loading} />
            </div>
          </div>

          <div className="lg:col-span-2">
            <AgentPanel farm={selected} language={lang} onLanguageChange={setLang} />
          </div>
        </div>
      </section>

      <section id="scenarios" className="scroll-mt-20 space-y-3">
        <div>
          <div className="label">What-if simulator</div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-100">
            Will the plan survive a drought? A price crash?
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            The agent re-runs the entire planning loop under 4 stress scenarios so the farmer
            adopts a plan that's robust — not just optimistic.
          </p>
        </div>
        <WhatIfScenarios farm={selected} language={lang} />
      </section>

      <section id="doctor" className="scroll-mt-20 space-y-3">
        <div>
          <div className="label">Plant Doctor</div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-100">
            Sick crop? Get a diagnosis in seconds — in your language.
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Describe the symptoms; Gemini matches the most likely disease or pest, ranks
            treatments by cost, and tells the farmer how to prevent it next season.
          </p>
        </div>
        <PlantDoctor language={lang} />
      </section>
    </div>
  );
}
