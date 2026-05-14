"use client";

import { useEffect, useState } from "react";
import { api, type Farm } from "@/lib/api";
import FarmForm from "@/components/FarmForm";
import FarmList from "@/components/FarmList";
import EditFarmCard from "@/components/EditFarmCard";
import AgentPanel from "@/components/AgentPanel";
import Hero from "@/components/Hero";
import PartnerStrip from "@/components/PartnerStrip";
import HowItWorks from "@/components/HowItWorks";
import WhatIfScenarios from "@/components/WhatIfScenarios";
import PlantDoctor from "@/components/PlantDoctor";
import LanguageSelector, { type Lang } from "@/components/LanguageSelector";
import { useHashRoute } from "@/components/Navbar";

/* ── Step model — used both by the breadcrumb strip and the navigation hash. */
const STEPS = [
  { hash: "onboard",   label: "Onboard",      icon: "👤", hint: "Add your farm" },
  { hash: "plan",      label: "Plan",         icon: "🌾", hint: "Pick a crop & schedule" },
  { hash: "scenarios", label: "What-if",      icon: "🌧️", hint: "Stress-test the plan" },
  { hash: "doctor",    label: "Plant Doctor", icon: "🩺", hint: "Diagnose a sick crop" },
] as const;

export default function HomePage() {
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [selected, setSelect] = useState<Farm | undefined>();
  const [loading, setLoading] = useState(true);
  const [bootError, setBoot]  = useState<string | null>(null);
  const [lang, setLang]       = useState<Lang>("en");
  const [mode, setMode]       = useState<"edit" | "new">("new");
  const [view, navigate]      = useHashRoute();

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.listFarms();
      setFarms(list);
      if (!selected && list.length) {
        setSelect(list[0]);
        setMode("edit");
      }
    } catch (err: any) {
      setBoot(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sections that need an active farm — used to show a friendly "go onboard" card. */
  const needsFarm = ["plan", "scenarios"].includes(view);
  const showStepStrip = ["onboard", "plan", "scenarios", "doctor"].includes(view);
  const showFarmBar   = ["onboard", "plan", "scenarios"].includes(view) && !!selected;

  return (
    <div className="space-y-8">
      {/* ── Boot error banner — visible on every view so DB outages aren't hidden ── */}
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
                {" "}Agent + tool endpoints still work. Start MongoDB or set <code>SPRING_DATA_MONGODB_URI</code>.
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

      {/* ── Sticky context: who are we operating on right now? ── */}
      {showFarmBar && (
        <FarmContextBar
          farm={selected!}
          farms={farms}
          onSwitch={f => { setSelect(f); setMode("edit"); }}
          onEdit={() => { setMode("edit"); navigate("onboard"); }}
        />
      )}

      {/* ── Step progress: 1-2-3-4 with active highlight, click to jump ── */}
      {showStepStrip && (
        <StepStrip current={view} onJump={navigate} hasFarm={!!selected} />
      )}

      {/* ─────────────────────────  VIEWS  ───────────────────────── */}

      {view === "home" && (
        <div className="space-y-12">
          <Hero />
          <HomeQuickStart farms={farms} onJump={navigate} />
          <HowItWorks />
        </div>
      )}

      {view === "onboard" && (
        <ViewShell
          eyebrow="Step 1 · Onboard"
          title="Add your farm — location, soil, water, budget."
          sub="The agent grounds every recommendation in this profile. You can edit or add more farms anytime."
        >
          <div className="grid xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-4">
              {farms.length > 0 && (
                <div className="card p-1.5 inline-flex items-center gap-1">
                  <ModePill
                    active={mode === "edit"}
                    disabled={!selected}
                    onClick={() => setMode("edit")}
                    label="📍 Edit selected farm"
                    hint={selected ? selected.farmerName : "Pick a farm first"}
                  />
                  <ModePill
                    active={mode === "new"}
                    onClick={() => setMode("new")}
                    label="➕ Add a new farm"
                    hint="Onboard another field"
                  />
                </div>
              )}

              {mode === "edit" && selected ? (
                <EditFarmCard
                  farm={selected}
                  onUpdated={f => {
                    setFarms(prev => prev.map(x => x.id === f.id ? f : x));
                    setSelect(f);
                  }}
                  onSwitchToNew={() => setMode("new")}
                />
              ) : (
                <FarmForm
                  selected={mode === "new" ? selected : undefined}
                  onCreated={f => {
                    setFarms(prev => [f, ...prev]);
                    setSelect(f);
                    setMode("edit");
                  }}
                />
              )}

              {selected && (
                <div className="flex justify-end">
                  <button onClick={() => navigate("plan")}
                          className="btn-primary text-sm">
                    Continue to Plan →
                  </button>
                </div>
              )}
            </div>
            <aside className="xl:col-span-1">
              <div className="card p-5 sticky top-20">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-100">Your farms</h2>
                  <span className="chip">{farms.length}</span>
                </div>
                <FarmList farms={farms} selectedId={selected?.id}
                          onSelect={f => { setSelect(f); setMode("edit"); }}
                          loading={loading} />
              </div>
            </aside>
          </div>
        </ViewShell>
      )}

      {view === "plan" && (
        <ViewShell
          eyebrow="Step 2 · Plan"
          title="Plan the most profitable season."
          sub="Gemini calls weather, soil and market tools, then emits a JSON plan with a day-by-day task list and projected income."
          action={<LanguagePill lang={lang} onChange={setLang} />}
        >
          {selected ? (
            <AgentPanel farm={selected} language={lang} onLanguageChange={setLang} />
          ) : (
            <NeedFarmCard onGo={() => navigate("onboard")} label="Save a farm first to enable the planner." />
          )}
        </ViewShell>
      )}

      {view === "scenarios" && (
        <ViewShell
          eyebrow="Step 3 · Stress-test"
          title="What if it rains less, or prices crash?"
          sub="The agent re-runs the full plan against four realistic shocks so you see how robust the strategy actually is."
          action={<LanguagePill lang={lang} onChange={setLang} />}
        >
          {selected ? (
            <WhatIfScenarios farm={selected} language={lang} />
          ) : (
            <NeedFarmCard onGo={() => navigate("onboard")} label="Save a farm first to run scenario stress-tests." />
          )}
        </ViewShell>
      )}

      {view === "doctor" && (
        <ViewShell
          eyebrow="Step 4 · Diagnose"
          title="Sick crop? Describe what you see."
          sub="Doesn't need a saved farm. Type symptoms in any supported language — Gemini matches them to a likely disease or pest and prescribes treatment."
          action={<LanguagePill lang={lang} onChange={setLang} />}
        >
          <PlantDoctor language={lang} />
        </ViewShell>
      )}

      {view === "how" && (
        <ViewShell
          eyebrow="How it works"
          title="A real plan → tools → reflect loop."
          sub="Every run is a multi-step mission. Gemini reasons; the tools take action. You stay in control via the approval step before persistence."
        >
          <HowItWorks />
        </ViewShell>
      )}

      {view === "stack" && (
        <ViewShell
          eyebrow="Stack"
          title="Production-grade plumbing, in the box."
          sub="Every component is observable end-to-end via OpenTelemetry. No vendor lock-in: swap models or stores at the boundary."
        >
          <PartnerStrip />
        </ViewShell>
      )}

      {/* Fallback for any unknown hash */}
      {!["home","onboard","plan","scenarios","doctor","how","stack"].includes(view) && (
        <div className="card p-10 text-center text-slate-300">
          <p className="text-lg">Page not found.</p>
          <button onClick={() => navigate("home")} className="btn-primary mt-4">Back to home</button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

function ViewShell({ eyebrow, title, sub, action, children }: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
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
      {children}
    </section>
  );
}

/**
 * Sticky strip showing the farm every action below operates on, with a
 * one-click switcher so demos can flip between farmers without scrolling
 * back to onboarding. Visible on Onboard / Plan / What-if.
 */
function FarmContextBar({ farm, farms, onSwitch, onEdit }: {
  farm: Farm;
  farms: Farm[];
  onSwitch: (f: Farm) => void;
  onEdit: () => void;
}) {
  return (
    <div className="sticky top-16 z-30 -mx-2 px-2">
      <div className="card !rounded-2xl px-4 lg:px-5 py-3 lg:py-3.5 flex items-center gap-3 lg:gap-4 flex-wrap
                      backdrop-blur-xl bg-[#0a0f17]/85 border-emerald-400/20">
        <div className="grid place-items-center h-10 w-10 lg:h-11 lg:w-11 rounded-xl bg-emerald-400/10
                        border border-emerald-400/30 text-emerald-300 text-lg">👤</div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold">Active farm</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-slate-100 text-base lg:text-lg truncate">{farm.farmerName}</span>
            <span className="font-mono text-[12px] text-slate-400">
              {farm.latitude.toFixed(3)}, {farm.longitude.toFixed(3)}
            </span>
            <span className="text-[12px] text-slate-400">
              · {farm.landSizeAcres} ac · {farm.soilType} · water {farm.waterAvailability}
            </span>
          </div>
        </div>
        {farms.length > 1 && (
          <select
            value={farm.id}
            onChange={e => {
              const f = farms.find(x => x.id === e.target.value);
              if (f) onSwitch(f);
            }}
            className="bg-white/[0.04] border border-white/10 rounded-lg text-sm
                       px-3 py-2 text-slate-100 hover:border-emerald-400/40
                       focus:outline-none focus:border-emerald-400/60 min-w-[140px]"
            title="Switch active farm"
          >
            {farms.map(f => (
              <option key={f.id} value={f.id} className="bg-[#0a0f17]">
                {f.farmerName}
              </option>
            ))}
          </select>
        )}
        <button onClick={onEdit}
                className="btn-primary text-sm !py-2 !px-4 inline-flex items-center gap-1.5">
          <span aria-hidden>✏️</span> Edit farm
        </button>
      </div>
    </div>
  );
}

/**
 * Linear 1-2-3-4 step indicator. Greys out steps that need a farm if none
 * exists yet. Click any step to jump.
 */
function StepStrip({ current, onJump, hasFarm }: {
  current: string;
  onJump: (s: string) => void;
  hasFarm: boolean;
}) {
  const idx = Math.max(0, STEPS.findIndex(s => s.hash === current));
  return (
    <div className="card p-2 flex items-stretch gap-1.5 overflow-x-auto">
      {STEPS.map((s, i) => {
        const active = s.hash === current;
        const done   = i < idx;
        const blocked = !hasFarm && (s.hash === "plan" || s.hash === "scenarios");
        return (
          <button
            key={s.hash}
            onClick={() => onJump(s.hash)}
            disabled={blocked}
            className={[
              "flex-1 min-w-[170px] px-4 py-3 rounded-lg text-left transition flex items-center gap-3",
              active
                ? "bg-emerald-400/10 border border-emerald-400/30"
                : done
                  ? "bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]"
                  : "border border-transparent hover:bg-white/[0.03]",
              blocked ? "opacity-40 cursor-not-allowed" : "",
            ].join(" ")}
            title={blocked ? "Save a farm first" : s.hint}
          >
            <span className={[
              "grid place-items-center h-8 w-8 rounded-full text-sm font-bold shrink-0",
              active
                ? "bg-emerald-400 text-slate-950"
                : done
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : "bg-white/5 text-slate-400 border border-white/10",
            ].join(" ")}>
              {done ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <div className={"text-[15px] font-semibold " + (active ? "text-emerald-200" : "text-slate-100")}>
                <span className="mr-1.5" aria-hidden>{s.icon}</span>{s.label}
              </div>
              <div className="text-[12px] text-slate-400 truncate">{s.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Compact language selector that fits in a section header's action slot. */
function LanguagePill({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="card p-2 inline-flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold px-2">Reply in</span>
      <LanguageSelector value={lang} onChange={onChange} />
    </div>
  );
}

function ModePill({ active, disabled, onClick, label, hint }: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-4 py-2.5 rounded-md text-sm font-medium transition flex items-center gap-2",
        active
          ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/30"
          : "text-slate-300 hover:text-slate-100 border border-transparent",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
      title={hint}
    >
      <span>{label}</span>
      {hint && <span className="text-[11px] text-slate-500 hidden sm:inline">· {hint}</span>}
    </button>
  );
}

function NeedFarmCard({ label, onGo }: { label: string; onGo: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-3 grid place-items-center h-12 w-12 rounded-full
                      bg-emerald-400/10 border border-emerald-400/30 text-emerald-300">🌾</div>
      <p className="text-slate-300 text-sm">{label}</p>
      <button onClick={onGo} className="btn-primary text-sm mt-4 inline-flex">
        ↑ Go to onboarding
      </button>
    </div>
  );
}

/** Big tile cards on the home view that route into the actual app. */
function HomeQuickStart({ farms, onJump }: { farms: Farm[]; onJump: (s: string) => void }) {
  const hasFarm = farms.length > 0;
  const tiles = [
    { hash: "onboard",   icon: "👤", title: hasFarm ? "Manage farms" : "Onboard your first farm",
      sub: hasFarm ? `${farms.length} farm${farms.length === 1 ? "" : "s"} on file — edit, relocate, or add another.`
                   : "60-second setup. Drop a pin, pick soil and budget — that's it.",
      cta: hasFarm ? "Open onboarding →" : "Start →" },
    { hash: "plan",      icon: "🌾", title: "Plan a season",
      sub: "Live Gemini agent picks the most profitable crop and writes a day-by-day schedule.",
      cta: "Generate plan →", needsFarm: true },
    { hash: "scenarios", icon: "🌧️", title: "Stress-test the plan",
      sub: "Re-run against drought, price crash and pest outbreak. See how robust the strategy is.",
      cta: "Run scenarios →", needsFarm: true },
    { hash: "doctor",    icon: "🩺", title: "Diagnose a sick crop",
      sub: "Type symptoms in any supported language. No farm record needed.",
      cta: "Open doctor →" },
  ];
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/90 font-semibold mb-3">
        ── Quick start
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tiles.map(t => {
          const blocked = t.needsFarm && !hasFarm;
          return (
            <button
              key={t.hash}
              onClick={() => onJump(blocked ? "onboard" : t.hash)}
              className="card p-5 text-left hover:border-emerald-400/40 transition group
                         flex flex-col gap-3 min-h-[170px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl" aria-hidden>{t.icon}</span>
                {blocked && (
                  <span className="text-[10px] uppercase tracking-wider text-amber-300/80 chip !py-0.5">
                    needs farm
                  </span>
                )}
              </div>
              <div>
                <div className="font-semibold text-slate-100">{t.title}</div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t.sub}</p>
              </div>
              <div className="mt-auto text-xs text-emerald-300 group-hover:translate-x-0.5 transition">
                {blocked ? "Onboard first →" : t.cta}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
