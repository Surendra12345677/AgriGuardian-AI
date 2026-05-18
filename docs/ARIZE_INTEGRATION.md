# 🟣 Arize Integration — Deep Dive

> Why AgriGuardian belongs in the **Arize partner bucket** of the
> Google Cloud Rapid Agent Hackathon — and how to verify every claim
> in this document with code pointers.

This page documents three things:

1. **What Arize products we use** (AX traces, MCP, evals, datasets).
2. **Where in the codebase each one lives.**
3. **How to reproduce the observe → learn loop end-to-end.**

---

## 1. The four-surface integration

| Arize surface              | What we do with it                                                      | Code |
|----------------------------|--------------------------------------------------------------------------|------|
| **Arize AX (OTel traces)** | Every span of the 9-step agent loop is exported via OTLP/HTTP            | [`observability/OpenTelemetryConfig.java`](../src/main/java/com/Hackathon/AgriGuardian/AI/observability/OpenTelemetryConfig.java) |
| **Arize AX (online evals)**| `evaluator.eval` span carries 4 score dimensions per run                 | [`agent/AgentEvaluator.java`](../src/main/java/com/Hackathon/AgriGuardian/AI/agent/AgentEvaluator.java) |
| **Arize MCP**              | 4 distinct ops: `search_traces`, `get_evaluations`, `log_feedback`, `list_datasets` | [`agent/AgentOrchestrator.java`](../src/main/java/com/Hackathon/AgriGuardian/AI/agent/AgentOrchestrator.java) + [`mcp/ArizeMcpConfig.java`](../src/main/java/com/Hackathon/AgriGuardian/AI/mcp/ArizeMcpConfig.java) |
| **Arize Datasets / Experiments** | Local `evals/golden_dataset.jsonl` + reproducible runner that mirrors the Arize Experiments UX | [`scripts/eval_experiment.py`](../scripts/eval_experiment.py) |

This is meaningfully deeper than a "tracing-only" submission: the
agent **reads from**, **writes to**, and **adapts its plan based on**
Arize signals.

---

## 2. The observe → learn loop, in code order

```
    ┌─────────────────────────────────────────────────────────────────┐
    │  POST /api/v1/recommendations    (RecommendationController)     │
    └─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ╔═══════════════════════════════════════════╗
        ║  agent.run                                ║   ◀── root span
        ╚═══════════════════════════════════════════╝
            │
            ├── planner.plan
            │
            ├── tool.arize.mcp        ◀── op = search_traces
            │     │
            │     ├── parse averageScore
            │     │
            │     ├─ avg < 0.60 ──▶ tool.arize.mcp.deep   (op = get_evaluations)
            │     │                  + force reflect step
            │     │
            │     └─ avg ≥ 0.85 ──▶ skip reflect (fast path, span = reflector.skip)
            │
            ├── tool.weather                (Open-Meteo)
            ├── tool.soil
            ├── tool.market
            │
            ├── gemini.generate
            │
            ├── reflector.reflect | reflector.skip       ◀── conditional
            │
            ├── evaluator.eval               ◀── 4-dim LLM-judge OR rubric
            │     attributes:
            │       eval.score.relevance
            │       eval.score.groundedness
            │       eval.score.agronomic_correctness
            │       eval.score.hallucination_risk
            │       eval.score.aggregate
            │
            └── tool.arize.mcp.feedback      ◀── op = log_feedback (closes the loop)
```

Every span here is shipped to Arize AX over OTLP. The next request
calls `arize_mcp/search_traces` and **reads its own previous spans
back** — that is the closed loop.

---

## 3. Conditional planning (this is what makes it an *agent*)

Most hackathon entries call themselves agents but execute a fixed
pipeline. AgriGuardian's pipeline depth changes with telemetry:

| Prior `averageScore` from Arize | Pipeline taken                                       |
|---------------------------------|-------------------------------------------------------|
| `< 0.60`                        | `search_traces` → **`get_evaluations` (deep)** → tools → Gemini → **reflect** → eval → log_feedback |
| `0.60 – 0.85`                   | `search_traces` → tools → Gemini → reflect → eval → log_feedback |
| `≥ 0.85`                        | `search_traces` → tools → Gemini → **skip reflect** → eval → log_feedback |

Each branch shows up as a different OTel span tree in Arize AX, which
makes the adaptive behaviour visible — not just claimed.

---

## 4. Reproducible "Arize Experiments" workflow

```bash
# 1. Start the backend
docker compose up -d --build

# 2. Run the experiment under the current prompt / model
python scripts/eval_experiment.py --label baseline

# 3. Change a prompt or model in src/main/.../AgentOrchestrator.java
#    or set GEMINI_MODEL=gemini-2.5-pro and restart the app.

# 4. Re-run with a new label and compare
python scripts/eval_experiment.py --label promptV2
```

Output lands in `evals/results/<label>.json` and a parallel
`<label>.trend.json` snapshot of `/api/v1/eval/quality-trend`. See
[`docs/EVAL_REPORT.md`](./EVAL_REPORT.md) for a full sample run.

---

## 5. Verifying the integration as a judge

```bash
# 1. The trace-list span tree
GET https://app.arize.com/  →  agriguardian-ai project

# 2. The agent's self-reported quality
curl https://agriguardian-ai-zqafbkccaa-uc.a.run.app/api/v1/eval/quality-trend?limit=20

# 3. The latest single eval breakdown
curl https://agriguardian-ai-zqafbkccaa-uc.a.run.app/api/v1/eval/latest
```

Both `/quality-trend` and `/latest` work in **stub mode without any
API keys** because the deterministic rubric in `AgentEvaluator`
guarantees a score on every run. Add real `ARIZE_*` env vars to also
see the spans and feedback land in Arize AX.

---

## 6. License

This document is part of the [MIT-licensed](../LICENSE) AgriGuardian AI
project.

