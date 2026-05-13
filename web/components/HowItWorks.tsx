"use client";

const steps = [
  {
    n: "01", title: "Plan",
    body: "Gemini decomposes the farmer's goal into an ordered tool plan. Arize MCP is consulted first for prior similar runs.",
    chip: "planner.plan",
  },
  {
    n: "02", title: "Tools",
    body: "Live calls: Open-Meteo (weather), Soil profile, Market price simulator, Arize MCP (eval history), MongoDB MCP (action).",
    chip: "tool.* spans",
  },
  {
    n: "03", title: "Generate",
    body: "Gemini 2.5 Flash receives the grounded tool outputs and emits a JSON plan: advice + day-by-day tasks + confidence.",
    chip: "gemini.generate",
  },
  {
    n: "04", title: "Reflect & Persist",
    body: "The agent self-critiques and persists the approved plan to MongoDB Atlas. Every span is exported to Arize AX over OTLP.",
    chip: "reflector.reflect → mongo",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 space-y-5">
      <div>
        <div className="label">Why this isn't a chatbot</div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-100">
          A real <span className="text-emerald-400">plan → tools → reflect</span> loop
        </h2>
        <p className="text-slate-400 text-sm mt-1 max-w-2xl">
          Every run is a multi-step mission. Gemini reasons; the tools take action. You stay in control via
          the approval step before persistence.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <div key={s.n} className="card p-5 relative">
            <div className="text-emerald-400/80 text-xs font-mono">{s.n}</div>
            <div className="font-semibold text-slate-100 mt-1">{s.title}</div>
            <p className="text-sm text-slate-400 mt-2">{s.body}</p>
            <div className="mt-3"><span className="chip font-mono text-[10px]">{s.chip}</span></div>
            {i < steps.length - 1 && (
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-emerald-400/30" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

