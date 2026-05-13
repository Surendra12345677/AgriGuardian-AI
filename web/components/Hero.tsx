"use client";

export default function Hero({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5
                        bg-gradient-to-b from-[#070b12] to-[#05080d] p-7 md:p-14">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full
                      bg-emerald-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full
                      bg-sky-500/10 blur-3xl" />

      <div className="relative grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30
                          bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-wider
                          text-emerald-300 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · Gemini 2.5 · Arize MCP · MongoDB
          </div>

          <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight
                         leading-[1.05] text-slate-50">
            Doubling smallholder farmer income,
            <span className="block bg-gradient-to-r from-emerald-300 via-emerald-400 to-lime-300
                             bg-clip-text text-transparent">
              one season at a time.
            </span>
          </h1>

          <p className="mt-5 text-slate-300/90 text-base md:text-lg max-w-2xl">
            An autonomous Gemini agent picks the most profitable crop for a farmer&apos;s soil,
            weather and budget. It writes the season plan in their own language, projects the
            <strong className="text-emerald-300"> ₹ they&apos;ll earn</strong>, stress-tests
            it against drought and price crashes, and even diagnoses sick plants.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={onTryDemo} className="btn-primary !px-5 !py-3 text-base">
              ▶ Run the agent on a demo farm
            </button>
            <a href="#how" className="btn-ghost !px-5 !py-3 text-base">
              See how it works
            </a>
          </div>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
            <Stat k="Income lift"   v="+₹38k" sub="per acre / season" />
            <Stat k="Languages"     v="7"     sub="incl. Hindi · Marathi · Tamil" />
            <Stat k="Tools"         v="5"     sub="weather · soil · market · …" />
            <Stat k="Trace export"  v="OTLP"  sub="every span → Arize AX" />
          </div>
        </div>

        {/* Right: Mini agent-pipeline preview */}
        <div className="lg:col-span-5">
          <div className="relative rounded-2xl border border-white/10 bg-[#06090f]/80
                          backdrop-blur-md shadow-2xl shadow-emerald-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5
                            bg-gradient-to-r from-white/[0.04] to-transparent">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
              <span className="ml-2 text-[11px] font-mono text-slate-500">agent.run · trace</span>
              <span className="ml-auto text-[10px] text-emerald-300">● live</span>
            </div>
            <div className="p-4 space-y-2 font-mono text-[12px]">
              <Trace label="planner.plan"        ms="48" />
              <Trace label="tool.arize.mcp"      ms="120" />
              <Trace label="tool.weather"        ms="312" />
              <Trace label="tool.soil"           ms="190" />
              <Trace label="tool.market"         ms="86" />
              <Trace label="tool.mongo.mcp"      ms="74" />
              <Trace label="gemini.generate"     ms="2410" highlight />
              <Trace label="reflector.reflect"   ms="22" />
              <Trace label="mongo.save"          ms="38" />
              <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">9 spans · gemini-2.5-flash</span>
                <span className="text-emerald-300 font-semibold">+₹38,400 projected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Trace({ label, ms, highlight }: { label: string; ms: string; highlight?: boolean }) {
  return (
    <div className={"flex items-center gap-2 rounded-md px-2 py-1.5 " +
                    (highlight ? "bg-emerald-400/[0.08]" : "")}>
      <span className="grid place-items-center h-4 w-4 rounded-full text-[9px] font-bold
                       bg-emerald-400/20 text-emerald-300">✓</span>
      <span className="text-slate-300">{label}</span>
      <span className="ml-auto text-slate-500">{ms} ms</span>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
      <div className="text-2xl font-bold text-emerald-300 leading-tight">{v}</div>
      <div className="text-[11px] text-slate-500 leading-tight">{sub}</div>
    </div>
  );
}
