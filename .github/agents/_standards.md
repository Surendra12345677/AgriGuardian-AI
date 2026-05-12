# Agent Standards (v1.0.0) — applies to every agent in `agents/`

> Every agent in this directory inherits these rules. Agent-specific files
> may **add** rules but must not relax them.

---

## 1. Standard Envelope (every input & output)

Every agent MUST accept this envelope and return it (echoing inputs +
appending outputs):

```json
{
  "envelope_version": "1.0.0",
  "agent": "<agent-name>",
  "agent_version": "<semver>",
  "task_id": "<stable id correlating all work for one user request>",
  "correlation_id": "<per-call uuid>",
  "parent_correlation_id": "<caller's correlation_id, null for root>",
  "cycle": 1,                                        // rework cycle number, starts at 1
  "started_at": "<RFC3339>",
  "ended_at": "<RFC3339>",
  "inputs_hash": "<sha256 of canonical JSON of inputs>",
  "scope": ["path/one", "path/two"],                 // file allow-list, never wildcards
  "trace_id": "<W3C traceparent or otel id>",
  "budget": {
    "max_tokens": 0,
    "max_seconds": 0,
    "max_usd": 0
  },
  "usage": {
    "tokens_in": 0,
    "tokens_out": 0,
    "duration_ms": 0,
    "estimated_usd": 0
  },
  "confidence": 0.0,                                 // 0.0–1.0 self-estimated
  "status": "ok | partial | escalated | failed",
  "result": { /* agent-specific payload */ },
  "errors": [],                                      // see Section 3
  "warnings": [],
  "next": {                                          // see Section 6
    "handoff_to": [],
    "rework_to": null,
    "rework_reason": null
  }
}
```

## 2. Determinism & Reproducibility
- **Temperature** ≤ 0.2 unless creative output is required (BA personas, docs prose).
- Pin model name + version in `agent_version`.
- Same `(inputs_hash, agent_version)` → must produce semantically equivalent
  output (idempotent). Cache lookups by this key are encouraged.
- Never call non-deterministic external services without recording the
  response in `result.external_calls[]`.

## 3. Error Model (typed)

```json
{
  "code": "INPUT_VALIDATION | SCOPE_VIOLATION | UPSTREAM_TIMEOUT | TOOL_ERROR | POLICY_VIOLATION | BUDGET_EXCEEDED | INTERNAL",
  "severity": "warn | error | fatal",
  "message": "<human-readable>",
  "details": { "field": "...", "value": "..." },
  "remediation": "<what the orchestrator/user should do>"
}
```

- `SCOPE_VIOLATION` → an agent attempted to read/write outside `scope`. Hard block.
- `BUDGET_EXCEEDED` → `usage` would exceed `budget`. Stop and escalate.
- `POLICY_VIOLATION` → security/compliance rule tripped (PII leak, secret in log…).
- All errors MUST include `remediation`.

## 4. Tool Discipline
- Each agent's frontmatter `tools:` list is the **complete allow-list**.
- Using a tool not in the list = `POLICY_VIOLATION`.
- Read tools (`search`, `usages`, `fetch`) are preferred over `edit` for
  exploratory work.
- Reviewer / Security / SRE / BA / Architect / Context = **read-only writers**
  (may emit suggestions, MUST NOT touch production code).

## 4a. Materialization (DELIVERY = FILES ON DISK)
**Code, config, docs, dashboards, alerts, PR bodies, CHANGELOGs — every
artifact an agent produces MUST be persisted to the workspace via tool
calls.** Pasting content into chat is theatre, not delivery.

Rules:
- For every file in your output's "Files Changed" / "Test Files" / "Files"
  table, invoke `create_file` (new) or `insert_edit_into_file` /
  `replace_string_in_file` (existing) **in the same response**.
- For every command an agent prescribes (git, kubectl, helm, mvn …) the
  agent — or the orchestrator on its behalf — MUST `run_in_terminal` it,
  unless the user opted out (`/no-git`, `/plan-only`, etc.).
- After writing, call `get_errors` on edited code files; fix and re-edit
  before declaring `status: ok`.
- The chat output is a **summary** (file table + 1-line per file +
  highlights). Never dump full file contents in chat unless the user asks
  "show me file X".
- Read-only agents (Reviewer, Security, BA, Architect, Context, SRE
  *for production code*) are exempt — they emit findings/specs, never
  production-code edits. They still write their *own* deliverables (ADRs,
  runbooks, dashboards) to disk.

## 5. Data Classification & PII
Mark every emitted artifact with one of: `public | internal | confidential | restricted`.
- Never log: passwords, tokens, API keys, JWTs, PANs, SSNs, full names+DOB,
  health data, location precision < 100m.
- Auto-redact patterns: `(?i)(password|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+`,
  PEM blocks, AWS key prefixes (`AKIA`, `ASIA`), GitHub PATs (`ghp_…`, `gho_…`).
- If an output contains restricted data, set `confidence` to 0 and
  raise `POLICY_VIOLATION`.

## 6. Handoff & Rework
- `next.handoff_to` — list of agents to invoke on success (parallel allowed).
- `next.rework_to` — single agent to restart the SDLC from on failure
  (must be defined in `registry.yaml.feedback_loops`).
- An agent NEVER calls another agent directly — it returns `next.*` and the
  orchestrator dispatches.

## 7. Scope Discipline
- `scope` is a **file allow-list** — no `**/*`, no directory globs that
  expand to > 25 files without explicit user approval.
- Touching a file outside `scope` = `SCOPE_VIOLATION`.
- If work requires a wider scope, return `status: "escalated"` with a
  `next.rework_to: orchestrator-agent` and a proposed scope diff.

## 8. Observability of the Agent Itself
Every agent emits to the trace:
- `agent.invocation` span with attributes `agent.name`, `agent.version`,
  `task_id`, `cycle`, `tokens_*`, `confidence`, `status`.
- One `agent.tool_call` child span per tool invocation.
- One `agent.handoff` span per `next.handoff_to` entry.

## 8a. Progress Reporting (MANDATORY — emit live, before any heavy work)
Every agent MUST stream progress markers to the chat the moment work
starts/finishes. Silent agents look broken to the user.

**At dispatch (immediately):**
```
▶ <agent-name>  step <n>/<total>  cycle <c>  scope=<file count>  budget=<usd>$
```

**During tool calls:**
```
  · reading <path> …
  · writing <path> …
  · running <command> …
```

**On completion:**
```
✓ <agent-name>  status=<ok|partial|escalated|failed>  conf=<0.0–1.0>  used=<usd>$ <ms>ms
```

**On rework loop trigger:**
```
↻ feedback-loop <id>  restart-from=<agent>  cycle <c+1>/<max>  reason=<verdict|gate>
```

Rules:
- Print the `▶` line **before** any tool call so the user sees the agent is alive.
- Print the `✓` (or `✗`) line **before** the structured result block.
- Never go more than ~10 seconds without a `·` heartbeat during long operations.
- These markers are plain text outside the JSON envelope and do not count
  against the agent's structured `result` payload.

## 9. Schema & Version Compatibility
- Every agent declares `agent_version` (semver). The orchestrator refuses to
  invoke an agent whose envelope_version differs in major from its own.
- Backward-compatible additions: minor bump. Breaking output shape: major bump.
- ADR-0001 in `docs/adr/` records the envelope contract.

## 10. Universal Quality Gate (every agent self-checks before returning)
- ☐ Envelope filled (no nulls in required fields).
- ☐ `inputs_hash` recomputed and matches.
- ☐ `scope` not exceeded.
- ☐ `tools` used are within the allow-list.
- ☐ No restricted data in `result`, `warnings`, or `errors`.
- ☐ `usage` within `budget`.
- ☐ `confidence` justified in 1–2 lines under `result.notes`.
- ☐ `next.*` populated (handoff or rework or terminal).

## 11. Escalation
An agent escalates to the user when:
- `cycle > max_rework_cycles_per_task` (default 3 — see registry).
- Confidence < 0.4 on a critical decision.
- Two consecutive cycles produced equivalent output (no convergence).
- A `POLICY_VIOLATION` cannot be auto-remediated.

Escalation payload: `status: "escalated"`, `errors[*].remediation` populated,
`next.handoff_to: ["user"]`.

## 12. Tooling Defaults
- Time source: `Clock` injected (never `now()`).
- Randomness: seedable PRNG; record seed in `result.seed`.
- HTTP: timeouts ≤ 10s, exponential backoff, jitter, circuit breaker after
  5 consecutive failures.
- File I/O: UTF-8, LF, max 10 MB per read.

---

**This document is the source of truth. If an agent file conflicts with
`_standards.md`, `_standards.md` wins.**

