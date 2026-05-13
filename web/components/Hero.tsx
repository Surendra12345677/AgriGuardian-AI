"use client";

export default function Hero({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#06090f] p-8 md:p-14 glow">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative max-w-4xl">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="chip">⚡ Google Cloud Agent Builder</span>
          <span className="chip">🧠 Gemini 2.5</span>
          <span className="chip">🩺 Plant Doctor (vision)</span>
          <span className="chip">🗣️ 7 Indian languages</span>
          <span className="chip">📈 Arize MCP</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-slate-50">
          Doubling smallholder farmer income,
          <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-lime-300 bg-clip-text text-transparent">
            {" "}one season at a time.
          </span>
        </h1>

        <p className="mt-5 text-slate-300/90 text-base md:text-lg max-w-2xl">
          AgriGuardian is an autonomous Gemini agent that picks the most profitable crop for a farmer's
          soil, weather and budget — gives the season plan in their own language, projects the
          <strong className="text-emerald-300"> ₹ they'll earn</strong>, stress-tests it against drought
          and price crashes, and even diagnoses sick plants. Every step is traced over OTLP to Arize AX.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={onTryDemo} className="btn-primary">
            ▶ Run the agent on a demo farm
          </button>
          <a href="#scenarios" className="btn-ghost">What-if scenarios</a>
          <a href="#doctor" className="btn-ghost">🩺 Plant Doctor</a>
          <a href="#how" className="btn-ghost">How it works</a>
          <a href="https://github.com/Surendra12345677/AgriGuardian-AI"
             target="_blank" rel="noreferrer" className="btn-ghost">★ GitHub</a>
        </div>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
          <Stat k="Income lift" v="+₹38k" sub="avg projected per acre/season" />
          <Stat k="Languages"   v="7"     sub="Hindi · Marathi · Tamil · …" />
          <Stat k="Tools"       v="5"     sub="weather · soil · market · arize · mongo" />
          <Stat k="Trace export" v="OTLP" sub="every span → Arize AX" />
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
      <div className="text-xl font-bold text-emerald-300">{v}</div>
      <div className="text-[11px] text-slate-500 leading-tight">{sub}</div>
    </div>
  );
}
