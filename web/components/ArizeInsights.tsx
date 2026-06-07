"use client";

type EvalDetails = {
  relevance?: number;
  groundedness?: number;
  agronomicCorrectness?: number;
  hallucinationRisk?: number;
  aggregate?: number;
  judge?: string;
};

const THRESHOLD = 0.70;

export function ArizeInsights({
  evalDetails,
  evalScore,
  evalJudge,
  showTrendPanel = false,
}: {
  evalDetails?: EvalDetails | null;
  evalScore?:   number | null;
  evalJudge?:   string | null;
  showTrendPanel?: boolean;
}) {
  if (!evalDetails && evalScore == null) return null;

  const dims = evalDetails
    ? Object.entries(evalDetails)
        .filter(([k, v]) => k !== "aggregate" && k !== "judge" && typeof v === "number")
        .map(([k, v]) => ({
          key: k,
          score: v as number,
          label: getDimLabel(k),
          pass: (v as number) >= THRESHOLD,
          icon: getIcon(k),
          hint: getHint(k),
          actionItems: getActionItems(k, v as number)
        }))
        .sort((a, b) => a.score - b.score)
    : [];

  const hasLowScores = dims.some(d => !d.pass);
  const overallScore = evalScore ?? evalDetails?.aggregate ?? null;

  if (!hasLowScores && overallScore != null && overallScore >= 0.75) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✓</span>
          <span className="text-sm font-medium text-emerald-100">Plan quality looks good</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-amber-400/90 font-semibold mb-1">
          💡 Plan coaching for your next run
        </div>
        <h4 className="text-sm font-semibold text-slate-100">Friendly quality check powered by Arize</h4>
      </div>

      {/* Score dimensions with actionable insights */}
      {dims.length > 0 && (
        <div className="space-y-3">
          {dims.map(dim => {
            const pct = Math.round(dim.score * 100);
            const color = dim.pass ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
            const textColor = dim.pass ? "text-emerald-300" : pct >= 60 ? "text-amber-300" : "text-red-300";
            return (
              <div key={dim.key} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
                {/* Dimension header with score */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{dim.icon}</span>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">{dim.label}</div>
                      <div className="text-[10px] text-slate-500">{dim.hint}</div>
                    </div>
                  </div>
                  <div className={`text-[12px] font-bold tabular-nums ${textColor}`}>{pct}%</div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-slate-800/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Action items for low scores */}
                {dim.actionItems && dim.actionItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1.5">
                    <p className="text-[10px] text-slate-400 font-medium">→ Helpful next steps:</p>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {dim.actionItems.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-slate-500 flex-shrink-0">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick actions footer */}
      {hasLowScores && (
        <div className="pt-3 border-t border-white/[0.08] space-y-2">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Quick wins for your next plan:</p>
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-400/10 border border-blue-400/20 text-blue-300">
              ✓ Click "Force Live" to fetch fresh data
            </span>
            <span className="text-[11px] px-2.5 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-300">
              ✓ Complete farm soil type & GPS
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function getDimLabel(key: string): string {
  const labels: Record<string, string> = {
    relevance: "Plan Relevance",
    groundedness: "Numbers are Grounded",
    agronomicCorrectness: "Crop Accuracy",
        hallucinationRisk: "Information Reliability"
  };
  return labels[key] ?? key;
}

function getIcon(key: string): string {
  const icons: Record<string, string> = {
    relevance: "🎯",
    groundedness: "📊",
    agronomicCorrectness: "🌾",
    hallucinationRisk: "✅"
  };
  return icons[key] ?? "📌";
}

function getHint(key: string): string {
  const hints: Record<string, string> = {
    relevance: "Is the plan specific to your farm?",
    groundedness: "Are estimates backed by live tool data?",
    agronomicCorrectness: "Is the crop right for your season & soil?",
    hallucinationRisk: "Are recommendations supported by your data and tools?"
  };
  return hints[key] ?? "";
}

function getActionItems(key: string, score: number): string[] {
  if (score >= 0.75) return [];

  const suggestions: Record<string, string[]> = {
    groundedness: [
      "Click 'Force Live' to fetch fresh weather and market prices.",
      "Use current values from weather, soil, and market tools before finalizing the plan.",
      "Ensure your farm GPS coordinates are accurate (they anchor crop recommendations)"
    ],
    relevance: [
      "Fill in your farm's soil type — it's the #1 factor in crop suitability",
      "Specify GPS coordinates if missing — the agent matches crops to your location",
      "Run a fresh plan for different seasons to see seasonal variety options"
    ],
    agronomicCorrectness: [
      "Verify your soil type (clay, loam, sand, black soil) — crop choice depends on it",
      "Enter your preferred crop to guide the recommendation (optional — just a preference override)",
      "Check the 7-day rainfall forecast shown below — it affects suitability"
    ],
    hallucinationRisk: [
      "Fill in missing budget or farm details to improve precision.",
      "Use Force Live so numbers refresh from weather, soil, and market tools.",
      "Provide exact soil type & location for higher confidence"
    ]
  };

  return suggestions[key] ?? [];
}

