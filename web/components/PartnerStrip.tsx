"use client";

const partners = [
  { name: "Google Cloud", tag: "Agent Builder" },
  { name: "Gemini", tag: "2.5 Flash · Reasoning" },
  { name: "Arize AX", tag: "Observability + MCP" },
  { name: "MongoDB Atlas", tag: "Persistence" },
  { name: "Open-Meteo", tag: "Live weather" },
  { name: "OpenTelemetry", tag: "Distributed tracing" },
  { name: "Spring Boot 4", tag: "JVM backend" },
  { name: "Next.js 15", tag: "Frontend" },
];

export default function PartnerStrip() {
  const row = [...partners, ...partners];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
        <span className="chip">Stack</span>
        <span className="text-xs text-slate-400">Production-grade plumbing in the box</span>
      </div>
      <div className="relative overflow-hidden">
        <div className="flex w-max marquee gap-3 py-4 px-5">
          {row.map((p, i) => (
            <div key={i} className="shrink-0 chip !py-2 !px-3">
              <span className="text-emerald-300 font-semibold">{p.name}</span>
              <span className="text-slate-500">·</span>
              <span>{p.tag}</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0a0f17] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0a0f17] to-transparent" />
      </div>
    </div>
  );
}

