"use client";

import { useEffect, useState } from "react";

export type StepKey =
  | "plan" | "arize.mcp" | "weather" | "soil" | "market" | "mongo.mcp"
  | "generate" | "reflect" | "persist";

const PIPELINE: { key: StepKey; label: string; sub: string; icon: string }[] = [
  { key: "plan",      label: "Plan",            sub: "planner.plan",          icon: "🧭" },
  { key: "arize.mcp", label: "Arize MCP",       sub: "tool.arize.mcp",        icon: "📊" },
  { key: "weather",   label: "Weather",         sub: "tool.weather",          icon: "🌤️" },
  { key: "soil",      label: "Soil",            sub: "tool.soil",             icon: "🪨" },
  { key: "market",    label: "Market",          sub: "tool.market",           icon: "💹" },
  { key: "mongo.mcp", label: "MongoDB MCP",     sub: "tool.mongo.mcp",        icon: "🍃" },
  { key: "generate",  label: "Gemini reasons",  sub: "gemini.generate",       icon: "✨" },
  { key: "reflect",   label: "Reflect",         sub: "reflector.reflect",     icon: "🔁" },
  { key: "persist",   label: "Persist",         sub: "mongo.save",            icon: "💾" },
];

type Status = "idle" | "active" | "done" | "error";

export function AgentTrace({
  running,
  finished,
  errored,
}: {
  running: boolean;
  finished: boolean;
  errored: boolean;
}) {
  // Drive a synthetic timeline that *looks* live while the actual REST call is in flight.
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    if (!running) return;
    setActiveIdx(0);
    const t = setInterval(() => {
      setActiveIdx(i => Math.min(i + 1, PIPELINE.length - 1));
    }, 280);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (finished) setActiveIdx(PIPELINE.length); // mark all done
    if (errored) setActiveIdx(-1);
  }, [finished, errored]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="chip">agent.run</span>
          <span className="text-xs text-slate-400">
            {running ? "executing…" : finished ? "completed" : errored ? "failed" : "idle"}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">9 spans · OTLP → Arize</div>
      </div>

      <ol className="space-y-1.5">
        {PIPELINE.map((s, i) => {
          let status: Status = "idle";
          if (errored && i === Math.max(activeIdx, 0)) status = "error";
          else if (i < activeIdx) status = "done";
          else if (i === activeIdx && running) status = "active";
          else if (finished) status = "done";
          return <Step key={s.key} idx={i} step={s} status={status} />;
        })}
      </ol>
    </div>
  );
}

function Step({ idx, step, status }: {
  idx: number;
  step: typeof PIPELINE[number];
  status: Status;
}) {
  const ring =
    status === "done"   ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-300" :
    status === "active" ? "bg-emerald-400/20 border-emerald-400 text-emerald-200 pulse" :
    status === "error"  ? "bg-red-500/15 border-red-400/50 text-red-300" :
                          "bg-white/[0.02] border-white/10 text-slate-500";

  return (
    <li className="flex items-center gap-3">
      <span className="font-mono text-[10px] text-slate-500 w-6">{String(idx + 1).padStart(2, "0")}</span>
      <span className={`grid place-items-center h-7 w-7 rounded-full border ${ring}`}>
        {status === "active" ? "•" : status === "done" ? "✓" : status === "error" ? "✕" : step.icon}
      </span>
      <div className="flex-1">
        <div className="text-sm text-slate-200">{step.label}</div>
        <div className="text-[10px] text-slate-500 font-mono">{step.sub}</div>
      </div>
      <span className="text-[10px] text-slate-500">
        {status === "done"   && "✓ ok"}
        {status === "active" && "running"}
        {status === "error"  && "error"}
      </span>
    </li>
  );
}

