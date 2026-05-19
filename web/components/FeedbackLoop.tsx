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
    <div className="card p-5 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 font-semibold">
            Arize-style feedback loop
          </div>
          <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2 mt-1">
            <span aria-hidden>🔁</span> Failed traces → regression tests
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            The agent surfaces its own low-scoring runs here. Label the failure mode,
            describe what the agent should have done, then <em>replay</em> the exact
            same inputs to verify the next prompt / model / tool change actually fixes
            the regression — without ever leaving the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Threshold
          </label>
          <select
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value))}
            className="input !py-1.5 !px-2 !w-auto text-sm"
          >
            {[0.4, 0.5, 0.6, 0.7, 0.8].map(t => (
              <option key={t} value={t}>&lt; {t.toFixed(2)}</option>
            ))}
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-ghost text-xs"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/[0.04] p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 text-sm text-emerald-200/90 flex items-center gap-2">
          <span aria-hidden>✓</span>
          No failing traces below {threshold.toFixed(2)} — the agent is currently passing its own evals.
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
                      <option key={m} value={m}>{FAILURE_MODE_LABELS[m] ?? m}</option>
                    ))}
                  </select>
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
                  title={noSnapshot ? "This older recommendation has no captured request snapshot — re-run a fresh plan to capture one." : "Re-run the exact same inputs through the agent"}
                  className="btn-primary text-xs !py-1.5 !px-3 disabled:opacity-50"
                >
                  {replaying ? "Replaying…" : "▶ Replay as regression test"}
                </button>
                {r && (
                  <div className="flex items-center gap-2 text-xs">
                    <ScoreBadge label="replay" value={r.replayScore} />
                    <DeltaPill delta={r.delta} improved={r.improved} />
                    <code className="text-[10px] text-slate-500">→ {r.replayId.slice(0, 12)}…</code>
                  </div>
                )}
                {noSnapshot && (
                  <span className="text-[11px] text-slate-500 italic">
                    No request snapshot on this older record — run a fresh plan to enable replay.
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-white/5">
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
  if (delta == null) return <span className="text-slate-500 text-[11px]">no eval score</span>;
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

