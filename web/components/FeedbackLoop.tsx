"use client";

import { useEffect, useState } from "react";
import { api, type FeedbackFailure, type FeedbackReplay } from "@/lib/api";

/**
 * Agent Feedback Loop — Arize-inspired panel for turning failed traces
 * into regression tests.
 *
 * <p>Workflow the judges can demo in 30 seconds:</p>
 * <ol>
 *   <li>The panel lists every recommendation whose eval score is below
 *       the threshold (default 0.60), worst-first.</li>
 *   <li>The operator labels each failure with a reusable
 *       <em>failure mode</em> (wrong tool sequence, missed retrieval,
 *       stale context, skipped validation, bad answer, other) and writes
 *       a one-line <em>expected behaviour</em>.</li>
 *   <li>Hitting <kbd>Replay</kbd> calls the orchestrator with the exact
 *       same inputs that produced the failure (snapshot persisted on the
 *       recommendation) and shows the delta in eval score vs. the
 *       original. That is the regression-test pass/fail signal.</li>
 * </ol>
 */
const FAILURE_MODE_LABELS: Record<string, string> = {
  wrong_tool_sequence: "Wrong tool sequence",
  missed_retrieval:    "Missed retrieval",
  stale_context:       "Stale context",
  skipped_validation:  "Skipped validation step",
  bad_answer:          "Bad answer",
  other:               "Other",
};

const FAILURE_MODE_HINTS: Record<string, string> = {
  wrong_tool_sequence: "Agent called tools in the wrong order",
  missed_retrieval:    "Agent didn't fetch data it needed",
  stale_context:       "Agent used outdated/cached data",
  skipped_validation:  "Agent skipped a required check",
  bad_answer:          "Answer was factually wrong or unhelpful",
  other:               "Doesn't fit the other categories",
};

export default function FeedbackLoop() {
  const [threshold, setThreshold] = useState(0.6);
  const [items, setItems] = useState<FeedbackFailure[]>([]);
  const [taxonomy, setTaxonomy] = useState<string[]>(Object.keys(FAILURE_MODE_LABELS));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [replays, setReplays] = useState<Record<string, FeedbackReplay>>({});
  const [busy, setBusy]       = useState<string | null>(null);
  const [drafts, setDrafts]   = useState<Record<string, { failureMode: string; expectedBehavior: string }>>({});

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const r = await api.feedbackFailures(threshold, 10);
      setItems(r.failures);
      if (r.failureModeTaxonomy?.length) setTaxonomy(r.failureModeTaxonomy);
      // Seed drafts from any annotations already saved on the record.
      const seed: Record<string, { failureMode: string; expectedBehavior: string }> = {};
      r.failures.forEach(f => {
        seed[f.id] = {
          failureMode: f.failureMode ?? "",
          expectedBehavior: f.expectedBehavior ?? "",
        };
      });
      setDrafts(seed);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [threshold]);

  async function annotate(id: string) {
    const d = drafts[id];
    if (!d) return;
    setBusy(id); setError(null);
    try {
      await api.feedbackAnnotate(id, d);
      // Reflect locally so the operator sees the save without a re-fetch.
      setItems(prev => prev.map(f =>
        f.id === id ? { ...f, failureMode: d.failureMode || null, expectedBehavior: d.expectedBehavior || null } : f
      ));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function replay(id: string) {
    setBusy(id + ":replay"); setError(null);
    try {
      const r = await api.feedbackReplay(id);
      setReplays(prev => ({ ...prev, [id]: r }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-6 lg:p-7 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/90 font-semibold">
            Arize-style feedback loop
          </div>
          <h3 className="font-semibold text-slate-100 text-xl flex items-center gap-2.5 mt-1.5">
            <span aria-hidden>🔁</span> Failed traces → regression tests
          </h3>
          <p className="text-[13px] text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
            The agent surfaces its own low-scoring runs here. Label the failure mode,
            describe what the agent should have done, then <em>replay</em> the exact
            same inputs to verify the next prompt / model / tool change actually fixes
            the regression — without ever leaving the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Show scores below
          </label>
          <select
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="input !py-2 !px-3 !w-auto text-sm"
          >
            <option value={0.4}>{"< 0.40 — Critical only"}</option>
            <option value={0.5}>{"< 0.50 — Low scoring"}</option>
            <option value={0.6}>{"< 0.60 — Below passing"}</option>
            <option value={0.7}>{"< 0.70 — Needs review"}</option>
            <option value={0.8}>{"< 0.80 — All imperfect"}</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-ghost text-sm"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-4 text-[13px] text-red-200">
          {error}
        </div>
      )}

      {/* Summary stats bar */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-center">
            <div className={`text-[20px] font-black tabular-nums ${items.length === 0 ? "text-emerald-300" : "text-amber-300"}`}>
              {items.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Failing traces</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-center">
            <div className="text-[20px] font-black tabular-nums text-slate-300">
              {items.filter(f => f.failureMode).length}/{items.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Labelled</div>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-center">
            <div className="text-[20px] font-black tabular-nums text-violet-300">
              {Object.keys(replays).length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Replays run</div>
          </div>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <div className="text-[15px] font-semibold text-emerald-200">All plans passing!</div>
          <p className="text-[13px] text-emerald-400/80">
            No eval scores below {threshold.toFixed(2)} — the agent is currently meeting quality thresholds.
          </p>
          <p className="text-[12px] text-slate-500 mt-2">
            Try raising the threshold to see plans that may need review.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {items.map(f => {
          const d = drafts[f.id] ?? { failureMode: "", expectedBehavior: "" };
          const r = replays[f.id];
          const replaying = busy === f.id + ":replay";
          const saving    = busy === f.id;
          const noSnapshot = !f.requestSnapshot || Object.keys(f.requestSnapshot).length === 0;
          return (
            <li key={f.id} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.03] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                      Failed trace
                    </span>
                    <code className="text-[11px] text-slate-400">{f.id.slice(0, 12)}…</code>
                    {f.traceId && (
                      <code className="text-[11px] text-slate-500">trace {f.traceId.slice(0, 12)}…</code>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    farm <code className="text-slate-200">{f.farmId.slice(0, 8)}…</code>
                    {f.requestSnapshot?.scenario ? <> · scenario <code className="text-slate-200">{String(f.requestSnapshot.scenario)}</code></> : null}
                    {f.requestSnapshot?.preferredCrop ? <> · crop <code className="text-slate-200">{String(f.requestSnapshot.preferredCrop)}</code></> : null}
                  </div>
                </div>
                <ScoreBadge label="original" value={f.evalScore} />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Failure mode</span>
                  <select
                    className="input mt-1"
                    value={d.failureMode}
                    onChange={e => setDrafts(p => ({ ...p, [f.id]: { ...d, failureMode: e.target.value } }))}
                  >
                    <option value="">— pick one —</option>
                    {taxonomy.map(m => (
                      <option key={m} value={m} title={FAILURE_MODE_HINTS[m]}>
                        {FAILURE_MODE_LABELS[m] ?? m}
                        {FAILURE_MODE_HINTS[m] ? ` — ${FAILURE_MODE_HINTS[m]}` : ""}
                      </option>
                    ))}
                  </select>
                  {d.failureMode && FAILURE_MODE_HINTS[d.failureMode] && (
                    <p className="mt-1 text-[10px] text-slate-500 italic">{FAILURE_MODE_HINTS[d.failureMode]}</p>
                  )}
                </label>
                <label className="block">
                  <span className="label">Expected behaviour</span>
                  <input
                    className="input mt-1"
                    placeholder="The agent should have …"
                    value={d.expectedBehavior}
                    onChange={e => setDrafts(p => ({ ...p, [f.id]: { ...d, expectedBehavior: e.target.value } }))}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => annotate(f.id)}
                  disabled={saving || (!d.failureMode && !d.expectedBehavior)}
                  className="btn-ghost text-xs"
                >
                  {saving ? "Saving…" : "💾 Save label"}
                </button>
                <button
                  onClick={() => replay(f.id)}
                  disabled={replaying || noSnapshot}
                  title={noSnapshot
                    ? "This recommendation has no request snapshot — run a fresh plan first to enable replay"
                    : "Re-run the exact same inputs through the agent and compare the new score"}
                  className="btn-primary text-xs !py-1.5 !px-3 disabled:opacity-50"
                >
                  {replaying ? "Replaying…" : "▶ Replay as regression test"}
                </button>
                {noSnapshot && (
                  <span className="text-[11px] text-amber-400/70 italic flex items-center gap-1">
                    <span>⚠</span>
                    <span>Run a fresh plan to capture a snapshot and enable replay</span>
                  </span>
                )}
              </div>
              {/* Replay result — shown after a replay completes */}
              {r && (
                <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-violet-300 font-semibold">Replay result</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <ScoreBadge label="original" value={f.evalScore} />
                    <span className="text-slate-600 text-sm">→</span>
                    <ScoreBadge label="replay" value={r.replayScore} />
                    <DeltaPill delta={r.delta} improved={r.improved} />
                  </div>
                  {r.replayScore == null && (
                    <p className="text-[10px] text-slate-500 italic">
                      Eval score is being calculated — refresh in a few seconds.
                    </p>
                  )}
                  {r.delta != null && (
                    <p className="text-[11px] text-slate-400">
                      {r.improved
                        ? "✅ Score improved — the change helped!"
                        : r.delta === 0
                          ? "→ Score unchanged — change had no effect on this trace."
                          : "⚠️ Score got worse — revert or investigate further."}
                    </p>
                  )}
                  <div className="text-[10px] text-slate-600">
                    Replay ID: <code className="text-slate-500 font-mono">{r.replayId.slice(0, 16)}…</code>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-slate-500 leading-relaxed pt-3 border-t border-white/5">
        Inspired by the workflow Arize describes for their <em>Alyx</em> engineering agent —
        save the trace before changing the prompt, label the failure mode, and replay after each
        change to measure improvement instead of guessing.
      </p>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  const v = value == null ? null : Math.round(value * 100);
  const tone =
    v == null     ? "text-slate-400 border-white/10 bg-white/[0.04]"
    : v >= 75     ? "text-emerald-200 border-emerald-400/40 bg-emerald-400/[0.08]"
    : v >= 60     ? "text-amber-200 border-amber-300/40 bg-amber-300/[0.06]"
                  : "text-red-200 border-red-400/40 bg-red-400/[0.06]";
  return (
    <div className={"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono " + tone}>
      <span className="uppercase tracking-wider opacity-80">{label}</span>
      <span className="font-bold">{v == null ? "—" : v + "%"}</span>
    </div>
  );
}

function DeltaPill({ delta, improved }: { delta: number | null; improved: boolean }) {
  if (delta == null) return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-400/20 px-2 py-1 text-[11px] font-mono text-slate-500 bg-white/[0.03]">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-pulse" />
      <span>scoring…</span>
    </span>
  );
  const pct = Math.round(delta * 100);
  const sign = pct > 0 ? "+" : "";
  const tone = improved
    ? "border-emerald-400/40 text-emerald-200 bg-emerald-400/[0.08]"
    : pct === 0
      ? "border-white/10 text-slate-300 bg-white/[0.04]"
      : "border-red-400/40 text-red-200 bg-red-400/[0.06]";
  return (
    <span className={"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono " + tone}>
      <span>{improved ? "▲" : pct === 0 ? "•" : "▼"}</span>
      <span className="font-bold">{sign}{pct} pts</span>
    </span>
  );
}

