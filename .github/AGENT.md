# SDLC Multi-Agent System (v1.1.0)

A team of specialised GitHub Copilot agents that, together, execute the full
SDLC at FAANG-grade quality. The **orchestrator** routes each request to the
smallest correct subset of specialists.

## Layout
```
.github/agents/
├── _standards.md                          ← cross-cutting contract every agent inherits
├── registry.yaml                          ← routing, pipelines, feedback loops, guardrails
├── orchestrator-agent.agent.md            ← supervisor (DAG executor, budget enforcer)
├── context-agent.agent.md                 ← memory + manifest + vector index
├── business-analyst-agent.agent.md        ← INVEST + MoSCoW + WSJF + DoR + DoD
├── solution-architect-agent.agent.md      ← HLD/LLD + ADRs + NFR budget + DR + cost
├── developer-agent.agent.md               ← code + migrations + flags + telemetry
├── qa-agent.agent.md                      ← pyramid + diff-coverage + mutation + fuzz
├── code-reviewer-agent.agent.md           ← severity rubric + complexity + API diff
├── security-agent.agent.md                ← STRIDE + OWASP + SLSA + IaC + license
├── devops-agent.agent.md                  ← progressive delivery + GitOps + FinOps
├── git-agent.agent.md                     ← commitlint + DCO + semver + size budget
├── docs-agent.agent.md                    ← Diátaxis + OpenAPI + MADR + lychee
├── sre-agent.agent.md                     ← multi-burn-rate alerts + chaos + DR drills
└── staff-engineer-agent.agent.md          ← single-agent fallback
```

## What v1.1.0 adds over v1.0
| Layer | Upgrade |
| --- | --- |
| Standards | New `_standards.md` — universal envelope, error model, determinism, PII redaction, escalation, schema versioning |
| Registry | Versioned, per-agent timeouts/cost ceilings, parallelism groups, cache config, named DAG pipelines, expanded feedback loops with stable IDs, guardrails (cost/time caps, convergence detection), compliance frameworks |
| Orchestrator | DAG executor (not waterfall), `/plan-only` dry-run, cost & time budgets, cancellation, non-convergence detection, full audit trail |
| Context | Cache key spec, drift detection via content hashes, classification-aware retrieval, secret redaction at the source |
| BA | INVEST, MoSCoW + WSJF, personas + JTBD, DoR gate, RAID risk register, t-shirt estimate |
| Architect | NFR budget table, capacity math, DR strategy, FinOps cost, mini-ATAM trade-offs, tech-radar alignment, reversibility tagging |
| Developer | Forward + rollback migrations (expand-backfill-contract), default-off feature flags, mandatory telemetry, optimistic locking + idempotency + outbox, perf hygiene rules, commit plan |
| QA | Diff-coverage (not absolute), mutation score gate (≥70%), property + fuzz testing, flaky re-run + quarantine, perf gate vs baseline, banned-tokens determinism rule |
| Reviewer | Complexity metric thresholds, anti-pattern catalogue, fitness functions (dep direction, no cycles), public-API diff via revapi/apidiff |
| Security | STRIDE per component, full compliance list, SLSA L3 supply chain (SBOM + Cosign), IaC misconfig (Checkov/tfsec), license block-list, runtime hardening checklist, JWT specifics, privacy-by-design |
| DevOps | Argo Rollouts/Flagger progressive delivery with SLI auto-rollback, GitOps (ArgoCD/Flux), External Secrets + rotation, Kyverno/Gatekeeper admission policies, container hardening, Infracost, restore drills |
| Git | Commitlint + DCO/GPG/SSH signing, auto semver bump, branch-protection pre-flight, PR-size budget (400/800), generated release notes |
| Docs | Diátaxis quadrants enforced, MkDocs/Docusaurus site, OpenAPI 3.1 + Spectral + oasdiff + Schemathesis, MADR 4.0, vale/markdownlint/lychee/cspell CI |
| SRE | Multi-window multi-burn-rate alerts (Google SRE workbook), error-budget policy auto-enforcement, OTel standard with log-trace correlation, cardinality budget, chaos engineering, DR drills |

## How to use

### Multi-agent (recommended)
1. Copilot Chat → mode picker → **`orchestrator-agent`**.
2. Paste your ticket (title / description / acceptance criteria).
3. Optional flags: `/plan-only`, `/cancel`, `/resume <task_id>`, `/cycle-cap <n>`.
4. Orchestrator returns a JSON envelope (DAG + plan + executed + totals) plus
   a ≤12-line human summary.

### Single-agent fallback
For tiny tasks where multi-agent overhead isn't worth it, switch the mode
picker to **`staff-engineer-agent`** (defined in `agents/staff-engineer-agent.agent.md`).

### Default pipelines
| Intent | Sequence |
| --- | --- |
| New feature | context → BA → architect → dev → (qa ∥ reviewer ∥ docs) → security → devops → git → sre |
| Bugfix | context → dev → (qa ∥ reviewer) → security → git |
| Refactor | context → architect → dev → (reviewer ∥ qa) → git |
| Security finding | context → security → dev → (qa ∥ reviewer) → security → git |
| Incident | context → sre → dev → (qa ∥ reviewer) → security → devops → docs → git → sre |
| Doc update | context → docs → git |

### Feedback loops (auto)
Reviewer BLOCK / security FAIL / QA gate fail / rollout rolled back / SRE
incident root-cause = code defect → orchestrator restarts the SDLC at the
correct upstream stage with the same `task_id`. Capped at **3 cycles**, then
escalates with the accumulated findings.

## Quality gates enforced system-wide
- `context-agent` runs first, every time.
- Every specialist gets a **scoped file list** (no `**/*`).
- ≥ 85% line / ≥ 75% branch / ≥ 70% mutation on new code.
- OWASP Top-10 + STRIDE for any new endpoint; SLSA L3 supply chain.
- 4-alert burn-rate policy per SLO; runbook link required.
- Conventional Commits + signed commits + ADR + CHANGELOG on every change.
- Zero secrets / zero `:latest` images / zero un-pinned deps / zero force-push to protected branches.
- Per-task budgets: 25 USD, 30 min, 3 rework cycles.

## Compliance frameworks claimed
OWASP Top 10 2021, OWASP ASVS L2, OWASP API Security Top 10,
CIS Docker Benchmark, CIS Kubernetes Benchmark, SLSA Level 3,
NIST SSDF (SP 800-218), ISO 27001 A.14.

## Customising
- Edit `_standards.md` to change rules every agent inherits.
- Edit `registry.yaml` to change routing, pipelines, budgets, or feedback loops.
- Edit any `*.agent.md` to change a specialist's role-specific rules or output schema.
- Edit `orchestrator-agent.agent.md` to change conflict-resolution priorities or DAG semantics.

## Troubleshooting

### "It stopped after step 1 / after the plan"
JetBrains/VS Code Copilot hosts sometimes terminate a turn when the model
emits prose-only text that looks like a final answer. The orchestrator's
`TURN-KEEP-ALIVE PROTOCOL` minimises this by starting every response with
a tool call, but the host can still trim very long agent turns.

**Recovery (takes 2 seconds):** type one of these into chat:
- `continue`
- `resume`
- `keep going`
- `next`
- `/resume` (or `/resume <task_id>` if you have one)

The orchestrator's `RESUME PROTOCOL` will:
1. Find the last progress board printed in the conversation.
2. Pick up from the first `[ ]` / `[▶]` step.
3. Preserve the original `task_id` and `cycle` — no re-planning, no re-doing.

### "It's been > 30 s with no output"
- Check the chat — there may be a tool call awaiting approval (the JetBrains
  plugin sometimes silently queues tool approvals).
- If truly stuck, type `/cancel` then resubmit the ticket.

### "The model picked the wrong pipeline"
- Be explicit: prefix the ticket with `pipeline: bugfix` or
  `pipeline: refactor` etc. (names from the `pipelines:` block in
  `registry.yaml`).
- Or use a slash-command directly to skip routing: `/implement <ticket>`,
  `/review`, `/security`, etc.

### "I want to see the plan without executing"
Prefix your ticket with `/plan-only`. The orchestrator returns the DAG +
budget estimate and stops cleanly — no dispatch.

### "It's running but I want to abort"
Type `/cancel`. The orchestrator stops at the next safe checkpoint and
prints partial totals + the escalation payload.

