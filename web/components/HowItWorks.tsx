"use client";

const steps = [
  {
    n: "01", title: "Plan",
    body: "Gemini decomposes the farmer's goal into an ordered tool plan. Arize MCP is consulted first for prior similar runs.",
    chip: "planner.plan", icon: "🧭" },
  { n: "02", title: "Tools",
    body: "Live calls: Open-Meteo (weather), Soil profile, Market price simulator, Arize MCP (eval history), MongoDB MCP (action).",
    chip: "tool.* spans", icon: "🛠️" },
  { n: "03", title: "Generate",
    body: "Gemini 2.5 Flash receives the grounded tool outputs and emits a JSON plan: advice + day-by-day tasks + confidence.",
    chip: "gemini.generate", icon: "✨" },
  { n: "04", title: "Reflect & Persist",
    body: "The agent self-critiques and persists the approved plan to MongoDB Atlas. Every span is exported to Arize AX over OTLP.",
    chip: "reflector.reflect → mongo", icon: "💾" },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 space-y-6">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]
                        text-emerald-300/90 font-semibold">
          <span className="h-px w-6 bg-emerald-400/50" />
          Why this isn&apos;t a chatbot
        </div>
        <h2 className="mt-2 text-3xl md:text-4xl font-bold text-slate-100 tracking-tight">
          A real <span className="text-emerald-400">plan → tools → reflect</span> loop
        </h2>
        <p className="text-slate-400 text-sm md:text-base mt-2">
          Every run is a multi-step mission. Gemini reasons; the tools take action. You stay
          in control via the approval step before persistence.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <div key={s.n}
               className="group relative rounded-2xl border border-white/10 bg-white/[0.03]
                          p-5 hover:border-emerald-400/30 hover:bg-white/[0.05] transition">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-emerald-400/80">{s.n}</span>
              <span className="text-lg opacity-80 group-hover:opacity-100">{s.icon}</span>
            </div>
            <div className="font-semibold text-slate-100 mt-1">{s.title}</div>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">{s.body}</p>
            <div className="mt-3">
              <span className="chip font-mono text-[10px]">{s.chip}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px
                              bg-gradient-to-r from-emerald-400/50 to-transparent" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
