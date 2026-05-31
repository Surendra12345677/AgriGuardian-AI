"use client";

import { useEffect, useRef, useState } from "react";

export type StepKey =
  | "plan" | "arize.mcp" | "weather" | "soil" | "market" | "mongo.mcp"
  | "generate" | "reflect" | "persist" | "eval";

const PIPELINE: { key: StepKey; label: string; sub: string; icon: string; hint: string; ms: number; parallel?: boolean; async?: boolean }[] = [
  { key: "plan",      label: "Plan",           sub: "planner.plan",      icon: "🧭", hint: "Builds the reasoning context from your farm profile",                  ms: 300  },
  // Tools run in parallel after plan — visual ms are staggered only for readability.
  { key: "arize.mcp", label: "Arize MCP",      sub: "tool.arize.mcp",    icon: "📡", hint: "Queries Arize MCP for past eval scores to inform reasoning",           ms: 100, parallel: true },
  { key: "weather",   label: "Weather",        sub: "tool.weather",      icon: "🌤️", hint: "Fetches 7-day rainfall & temperature for your coordinates",           ms: 100, parallel: true },
  { key: "soil",      label: "Soil",           sub: "tool.soil",         icon: "🪨", hint: "Looks up soil texture & nutrient profile for your location",          ms: 100, parallel: true },
  { key: "market",    label: "Market prices",  sub: "tool.market",       icon: "💹", hint: "Queries live commodity prices via Gemini real-time search",           ms: 100, parallel: true },
  { key: "mongo.mcp", label: "MongoDB MCP",    sub: "tool.mongo.mcp",    icon: "🍃", hint: "Retrieves your farm history & previous recommendations",              ms: 500, parallel: true },
  { key: "generate",  label: "Gemini reasons", sub: "gemini.generate",   icon: "✨", hint: "Gemini 3.1 Pro synthesises all signals into a JSON plan",             ms: 12000 },
  { key: "reflect",   label: "Reflect",        sub: "reflector.reflect", icon: "🔁", hint: "Self-critique: reconciles impact numbers & injects location basis",   ms: 400 },
  { key: "persist",   label: "Persist",        sub: "mongo.save",        icon: "💾", hint: "Saves the final plan + trace ID to MongoDB",                         ms: 300 },
  { key: "eval",      label: "Arize eval",     sub: "evaluator.eval",    icon: "⚖️", hint: "LLM judge scores 4 quality dimensions, logs result to Arize AX",     ms: 0, async: true },
];

// Tools that run in parallel (between plan and generate)
const PARALLEL_TOOL_KEYS = new Set<StepKey>(["arize.mcp", "weather", "soil", "market", "mongo.mcp"]);

type Status = "idle" | "active" | "done" | "error" | "async-pending" | "async-done";

export function AgentTrace({
  running,
  finished,
  errored,
  evalPending = false,
  evalDone    = false,
}: {
  running:      boolean;
  finished:     boolean;
  errored:      boolean;
  evalPending?: boolean;
  evalDone?:    boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Advance each step by its realistic expected duration.
  // Parallel tools all complete at once after the slowest one (≈500ms).
  useEffect(() => {
    if (!running) return;
    setActiveIdx(0);
    setElapsed(0);
    startRef.current = Date.now();

    // plan → parallel tools all done together → generate → reflect → persist
    const PLAN_MS      = 300;
    const TOOLS_MS     = 32000; // market tool calls Gemini internally (~30 s is normal)
    const GENERATE_MS  = 12000;
    const REFLECT_MS   = 400;
    const PERSIST_MS   = 300;

    // Find indices so we can jump directly to them
    const planIdx     = PIPELINE.findIndex(s => s.key === "plan");
    const toolStart   = PIPELINE.findIndex(s => s.key === "arize.mcp");
    const toolEnd     = PIPELINE.findIndex(s => s.key === "mongo.mcp");
    const generateIdx = PIPELINE.findIndex(s => s.key === "generate");
    const reflectIdx  = PIPELINE.findIndex(s => s.key === "reflect");
    const persistIdx  = PIPELINE.findIndex(s => s.key === "persist");
    const evalIdx     = PIPELINE.findIndex(s => s.key === "eval");

    const timers: ReturnType<typeof setTimeout>[] = [];

    // After plan finishes, all parallel tools become active simultaneously
    timers.push(setTimeout(() => setActiveIdx(toolStart),     PLAN_MS));
    // All tools done at once — jump to generate
    timers.push(setTimeout(() => setActiveIdx(generateIdx),   PLAN_MS + TOOLS_MS));
    timers.push(setTimeout(() => setActiveIdx(reflectIdx),    PLAN_MS + TOOLS_MS + GENERATE_MS));
    timers.push(setTimeout(() => setActiveIdx(persistIdx),    PLAN_MS + TOOLS_MS + GENERATE_MS + REFLECT_MS));
    timers.push(setTimeout(() => setActiveIdx(evalIdx),       PLAN_MS + TOOLS_MS + GENERATE_MS + REFLECT_MS + PERSIST_MS));

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
  const spanCount  = 9; // OTel spans (plan + 5 tools + generate + reflect + persist)

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
          <span className="text-slate-500">{spanCount} spans · OTLP → Arize</span>
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

      {/* Parallel tools banner */}
      {running && activeIdx >= PIPELINE.findIndex(s => s.key === "arize.mcp") &&
                  activeIdx <= PIPELINE.findIndex(s => s.key === "mongo.mcp") && (
        <div className="mb-2 text-[10px] text-slate-500 font-mono px-1 flex items-center gap-1.5">
          <span className="text-violet-400">⚡</span>
          <span>Tools running in <span className="text-violet-300">parallel</span></span>
        </div>
      )}

      <ol className="space-y-1.5">
        {PIPELINE.map((s, i) => {
          let status: Status = "idle";
          const isParallel = PARALLEL_TOOL_KEYS.has(s.key);
          const toolEnd    = PIPELINE.findIndex(p => p.key === "mongo.mcp");
          const isEval     = s.key === "eval";

          if (isEval) {
            if      (evalDone)    status = "async-done";
            else if (evalPending) status = "async-pending";
            else if (finished)    status = "async-pending";
            else                  status = "idle";
          } else if (errored && i === Math.max(activeIdx, 0)) {
            status = "error";
          } else if (i < activeIdx) {
            // Parallel tools show done even when only the batch index advanced
            status = "done";
          } else if (isParallel && activeIdx >= PIPELINE.findIndex(p => p.key === "arize.mcp") &&
                     activeIdx <= toolEnd + 1 && running) {
            status = "active";
          } else if (i === activeIdx && running) {
            status = "active";
          } else if (finished) {
            status = "done";
          }
          return <Step key={s.key} idx={i} step={s} status={status} />;
        })}
      </ol>
    </div>
  );
}

function Step({ idx, step, status }: {
  idx:    number;
  step:   typeof PIPELINE[number];
  status: Status;
}) {
  const isAsync = step.async;

  const ring =
    status === "done"          ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-300" :
    status === "active"        ? "bg-emerald-400/20 border-emerald-400 text-emerald-200" :
    status === "error"         ? "bg-red-500/15 border-red-400/50 text-red-300" :
    status === "async-pending" ? "bg-violet-400/20 border-violet-400/60 text-violet-200" :
    status === "async-done"    ? "bg-violet-400/15 border-violet-400/40 text-violet-300" :
                                 "bg-white/[0.02] border-white/10 text-slate-500";

  const badge =
    status === "done"          ? <span className="text-emerald-400 text-[10px]">✓ ok</span> :
    status === "active"        ? <span className="text-emerald-300 text-[10px] animate-pulse">running</span> :
    status === "error"         ? <span className="text-red-400 text-[10px]">✕ err</span> :
    status === "async-pending" ? <span className="text-violet-300 text-[10px] animate-pulse">scoring…</span> :
    status === "async-done"    ? <span className="text-violet-400 text-[10px]">✓ scored</span> :
    null;

  const icon =
    status === "active"        ? "•" :
    status === "done"          ? "✓" :
    status === "error"         ? "✕" :
    status === "async-pending" ? "⏳" :
    status === "async-done"    ? "✓" :
    step.icon;

  return (
    <li className="flex items-center gap-3 group" title={step.hint}>
      <span className="font-mono text-[10px] text-slate-500 w-6">{String(idx + 1).padStart(2, "0")}</span>
      <span className={`grid place-items-center h-7 w-7 rounded-full border flex-shrink-0 ${ring} ${status === "active" || status === "async-pending" ? "animate-pulse" : ""}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-sm text-slate-200">{step.label}</div>
          {step.parallel && status !== "idle" && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-violet-400/10 text-violet-400 font-mono border border-violet-400/20">∥</span>
          )}
          {isAsync && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-400/10 text-blue-400 font-mono border border-blue-400/20">async</span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 font-mono">{step.sub}</div>
      </div>
      <span className="flex-shrink-0">{badge}</span>
    </li>
  );
}

