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

type WorkspaceTab = "plan" | "scenarios" | "doctor";

export default function HomePage() {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [selected, setSelect] = useState<Farm | undefined>();
  const [loading, setLoading] = useState(true);
  const [bootError, setBoot]  = useState<string | null>(null);
  const [lang, setLang]       = useState<Lang>("en");
  const [tab,  setTab]        = useState<WorkspaceTab>("plan");

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
      setTab("plan");
      document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      setBoot(err.message);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for tab-switch requests from the Navbar.
  useEffect(() => {
    const handler = (e: any) => {
      const next = e.detail as WorkspaceTab;
      if (next === "plan" || next === "scenarios" || next === "doctor") setTab(next);
    };
    window.addEventListener("ag:tab", handler);
    return () => window.removeEventListener("ag:tab", handler);
  }, []);

  // Broadcast tab changes so the Navbar can highlight the active sub-tab.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ag:tab-changed", { detail: tab }));
  }, [tab]);

  return (
    <div className="space-y-16">
      <Hero onTryDemo={loadDemoFarm} />

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

      {/* ── Unified workspace ──────────────────────────────────────────── */}
      <section id="workspace" className="scroll-mt-20 space-y-5">
        <SectionHeader
          eyebrow="Live workspace"
          title={<>Pick a farm. Then plan, stress-test, or diagnose.</>}
          sub="One workspace, three modes. The selected farm is shared across the agent, the what-if simulator, and the plant doctor."
          action={
            <button onClick={loadDemoFarm} className="btn-ghost text-sm">
              ⚡ One-click demo farm
            </button>
          }
        />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT: farm picker */}
          <div className="lg:col-span-1 space-y-6">
            <FarmForm onCreated={f => { setFarms(prev => [f, ...prev]); setSelect(f); setTab("plan"); }} />
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-100">Your farms</h2>
                <span className="chip">{farms.length}</span>
              </div>
              <FarmList farms={farms} selectedId={selected?.id}
                        onSelect={f => { setSelect(f); }} loading={loading} />
            </div>
          </div>

          {/* RIGHT: tabbed workspace */}
          <div className="lg:col-span-2 space-y-4">
            <WorkspaceTabs tab={tab} setTab={setTab} hasFarm={!!selected} />

            {tab === "plan"      && <AgentPanel       farm={selected} language={lang} onLanguageChange={setLang} />}
            {tab === "scenarios" && <WhatIfScenarios  farm={selected} language={lang} />}
            {tab === "doctor"    && <PlantDoctor      language={lang} />}
          </div>
        </div>
      </section>

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

function WorkspaceTabs({
  tab, setTab, hasFarm,
}: {
  tab: WorkspaceTab;
  setTab: (t: WorkspaceTab) => void;
  hasFarm: boolean;
}) {
  const items: { key: WorkspaceTab; label: string; icon: string; sub: string; needsFarm: boolean }[] = [
    { key: "plan",      icon: "🤖", label: "Plan a season",   sub: "Agent loop",            needsFarm: true },
    { key: "scenarios", icon: "🧪", label: "What-if",          sub: "4 stress tests",        needsFarm: true },
    { key: "doctor",    icon: "🩺", label: "Plant Doctor",     sub: "Diagnose symptoms",     needsFarm: false },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 grid grid-cols-3 gap-1.5">
      {items.map(it => {
        const active = tab === it.key;
        const disabled = it.needsFarm && !hasFarm;
        return (
          <button key={it.key}
                  disabled={disabled}
                  onClick={() => setTab(it.key)}
                  className={
                    "rounded-xl px-3 py-2.5 text-left transition relative " +
                    (active
                      ? "bg-emerald-400/[0.10] border border-emerald-400/40 shadow-inner shadow-emerald-500/10"
                      : "border border-transparent hover:bg-white/[0.04]") +
                    (disabled ? " opacity-40 cursor-not-allowed" : "")
                  }
                  title={disabled ? "Pick or onboard a farm first" : undefined}>
            <div className="flex items-center gap-2">
              <span className="text-base">{it.icon}</span>
              <span className={"text-sm font-semibold " + (active ? "text-emerald-100" : "text-slate-200")}>
                {it.label}
              </span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5 ml-7">
              {it.sub}
            </div>
          </button>
        );
      })}
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
