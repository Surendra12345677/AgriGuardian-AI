"use client";

import { useEffect, useRef, useState } from "react";

export type StepKey =
  | "plan" | "arize.mcp" | "weather" | "soil" | "market" | "mongo.mcp"
  | "generate" | "reflect" | "persist";

const PIPELINE: { key: StepKey; label: string; sub: string; icon: string; hint: string; ms: number }[] = [
  { key: "plan",      label: "Plan",           sub: "planner.plan",     icon: "🧭", hint: "Builds the reasoning context from your farm profile",        ms: 300  },
  // Tools now run in parallel — they start simultaneously after 'plan'.
  // The UI shows them sequentially for readability; each visual step adds
  // only its marginal contribution to the total (slowest tool ≈ 1.5s).
  { key: "arize.mcp", label: "Arize MCP",      sub: "tool.arize.mcp",   icon: "📡", hint: "Pulls past trace history via Model Context Protocol",        ms: 400  },
  { key: "weather",   label: "Weather",        sub: "tool.weather",     icon: "🌤️", hint: "Fetches 7-day rainfall & temperature for your coordinates",  ms: 400  },
  { key: "soil",      label: "Soil",           sub: "tool.soil",        icon: "🪨", hint: "Looks up soil texture & nutrient profile for your location", ms: 300  },
  { key: "market",    label: "Market prices",  sub: "tool.market",      icon: "💹", hint: "Queries live commodity prices via Gemini real-time search",  ms: 400  },
  { key: "mongo.mcp", label: "MongoDB MCP",    sub: "tool.mongo.mcp",   icon: "🍃", hint: "Retrieves your farm history & previous recommendations",     ms: 300  },
  { key: "generate",  label: "Gemini reasons", sub: "gemini.generate",  icon: "✨", hint: "Gemini 3.1 Pro synthesises all signals into a JSON plan",    ms: 12000 },
  { key: "reflect",   label: "Reflect",        sub: "reflector.reflect",icon: "🔁", hint: "Self-critique pass — reconciles impact numbers & injects location basis", ms: 400 },
  { key: "persist",   label: "Persist",        sub: "mongo.save",       icon: "💾", hint: "Saves the final plan + trace ID to MongoDB",                ms: 300  },
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
  const [activeIdx, setActiveIdx] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Advance each step by its realistic expected duration
  useEffect(() => {
    if (!running) return;
    setActiveIdx(0);
    setElapsed(0);
    startRef.current = Date.now();

    // Schedule each step transition based on cumulative ms
    let cumulative = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    PIPELINE.forEach((step, i) => {
      cumulative += step.ms;
      const t = setTimeout(() => setActiveIdx(i + 1), cumulative);
      timers.push(t);
    });

    // Live elapsed counter
    const ticker = setInterval(() => {
      if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(ticker);
    };
  }, [running]);

  useEffect(() => {
    if (finished) setActiveIdx(PIPELINE.length);
    if (errored)  setActiveIdx(-1);
  }, [finished, errored]);

  const activeStep = PIPELINE[Math.min(activeIdx, PIPELINE.length - 1)];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="chip">agent.run</span>
          <span className="text-xs text-slate-400">
            {running ? "executing…" : finished ? "completed" : errored ? "failed" : "idle"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          {running && (
            <span className="text-emerald-300 tabular-nums">{elapsed}s elapsed</span>
          )}
          <span className="text-slate-500">{PIPELINE.length} spans · OTLP → Arize</span>
        </div>
      </div>

      {/* Live status bar */}
      {running && activeStep && (
        <div className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-[12px] text-emerald-200 font-medium">{activeStep.label}</span>
          <span className="text-[11px] text-slate-400 truncate">— {activeStep.hint}</span>
        </div>
      )}

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
    status === "active" ? "bg-emerald-400/20 border-emerald-400 text-emerald-200" :
    status === "error"  ? "bg-red-500/15 border-red-400/50 text-red-300" :
                          "bg-white/[0.02] border-white/10 text-slate-500";

  return (
    <li className="flex items-center gap-3 group" title={step.hint}>
      <span className="font-mono text-[10px] text-slate-500 w-6">{String(idx + 1).padStart(2, "0")}</span>
      <span className={`grid place-items-center h-7 w-7 rounded-full border flex-shrink-0 ${ring} ${status === "active" ? "animate-pulse" : ""}`}>
        {status === "active" ? "•" : status === "done" ? "✓" : status === "error" ? "✕" : step.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">{step.label}</div>
        <div className="text-[10px] text-slate-500 font-mono">{step.sub}</div>
      </div>
      <span className={`text-[10px] flex-shrink-0 ${status === "done" ? "text-emerald-400" : status === "active" ? "text-emerald-300 animate-pulse" : "text-slate-600"}`}>
        {status === "done"   && "✓ ok"}
        {status === "active" && "running"}
        {status === "error"  && "✕ err"}
      </span>
    </li>
  );
}

