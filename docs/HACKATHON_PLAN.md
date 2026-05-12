# AgriGuardian AI — Hackathon Plan

> **Hackathon:** Google Cloud Rapid Agent Hackathon — *Building Agents for Real-World Challenges*
> **Partner track:** 🟣 **Arize** (Arize MCP + Arize AX traces)
> **Brain:** Gemini 3 (`gemini-3-pro`) via Google Cloud Agent Builder
> **Deadline:** 12 June 2026, 02:30 GMT+5:30
> Living document. Last updated: 2026-05-12.

---

## 1. The submission contract

| Requirement | How we satisfy it | Status |
|---|---|---|
| Build an **agent** (not a chatbot) with Gemini 3 on Google Cloud Agent Builder | [`agent-builder/agriguardian-agent.yaml`](../agent-builder/agriguardian-agent.yaml) defines the agent: `gemini-3-pro`, 5 tools, system instruction, safety filters | ✅ spec ready, deploy pending GCP billing |
| **Meaningful** partner-MCP integration | `arize.mcp` agent tool wraps the official Arize MCP server. Called *before* answering (retrieve similar past runs) and *after* (log feedback). | ✅ done |
| Multi-step planning + tool use | Plan → weather → soil → market → mongo.mcp → reflect, with a full OpenTelemetry trace tree | ✅ done |
| Human-in-the-loop | Destructive ops in the system prompt require farmer confirmation; recommendations persisted only after approval | ✅ done |
| Hosted URL | Cloud Run target; deploy script in [`agent-builder/deploy.ps1`](../agent-builder/deploy.ps1) | ⏳ blocked on GCP billing |
| Public repo + OSI license | MIT license at repo root, detectable on GitHub | ✅ done |
| 3-min demo video | Script in §4 below | ⏳ to record |
| Devpost submission form | — | ⏳ submit after deploy + video |

---

## 2. Judging criteria — mapping

Google Cloud × Devpost rubrics historically score five axes. Where we stand:

| Criterion (~weight) | What judges look for | Our position |
|---|---|---|
| **Innovation & Creativity** (~20%) | Real problem, original take | Self-aware farm agent that consults Arize for its own past evals before answering — uncommon for an agronomy use case |
| **Technical Implementation** (~30%) | Working code, sensible architecture, tests | Spring Boot 4 + Java 17, 29 passing tests, Resilience4j, Caffeine, RFC 7807 errors, MDC correlation, secret-redacting logs, full CI (build + CodeQL + Gitleaks) |
| **Use of Agent Builder + Gemini 3** (~25%) | The agent actually runs on the platform | Agent Builder YAML spec with `gemini-3-pro`, HTTP-tool + MCP-tool wiring, deploys with one `gcloud` command |
| **Partner integration depth** (~15%) | MCP used meaningfully, not bolted on | Arize MCP is on the **critical path**: agent's first action is `arize.mcp.search_traces`; last is `arize.mcp.log_feedback`. OTLP traces stream into Arize AX in parallel. |
| **Demo & Presentation** (~10%) | Clear video, easy to try | `docker compose up` brings the entire stack (app + Mongo + MongoDB MCP) + auto-seeds a demo farm with 3 historical recommendations |

---

## 3. Arize integration — the partner story

We integrate Arize in **two complementary channels**:

### 3a. Arize MCP — the agent's superpower (partner-track qualifier)

The agent plans *with* its evaluation history, not just its prompt:

```
farmer -> agent
        |-- 1. arize.mcp.search_traces({query: "kharif maize Pune"})
        |        -> returns 3 similar past runs + their eval scores
        |-- 2. weather + soil + market         (ground-truth tools)
        |-- 3. gemini-3-pro                    (reason over everything)
        |-- 4. mongo.mcp.insert-one            (persist plan, with consent)
        '-- 5. arize.mcp.log_feedback          (close the loop)
```

Wiring: [`McpClient`](../src/main/java/com/Hackathon/AgriGuardian/AI/mcp/McpClient.java) +
[`ArizeMcpConfig`](../src/main/java/com/Hackathon/AgriGuardian/AI/mcp/ArizeMcpConfig.java) +
[`ArizeMcpTool`](../src/main/java/com/Hackathon/AgriGuardian/AI/agent/tool/impl/ArizeMcpTool.java).
JSON-RPC 2.0 over Streamable-HTTP. Circuit-broken + retried via Resilience4j.

### 3b. Arize AX — OTLP traces (parallel, always-on)

Every agent run is emitted as a hierarchical OpenTelemetry trace:

```
agent.run
|-- planner.plan          attrs: plan.tools = [arize.mcp, weather, soil, market, mongo.mcp]
|-- tool.arize.mcp        attrs: operation, latency_ms
|-- tool.weather          attrs: latitude, longitude, source
|-- tool.soil
|-- tool.market
|-- tool.mongo.mcp        attrs: operation, source
|-- gemini.generate       attrs: model, prompt.tokens.estimate
'-- reflector.reflect
```

Wiring: [`OpenTelemetryConfig`](../src/main/java/com/Hackathon/AgriGuardian/AI/observability/OpenTelemetryConfig.java)
configures an OTLP/HTTP exporter pointed at `ARIZE_OTLP_ENDPOINT`, authenticated by `space_id` + `api_key` headers. Falls back to a no-op tracer when keys are absent so the app boots in stub mode.

This gives Arize judges **two things to look at**: live MCP integration in code + live traces in their own product UI.

---

## 4. Demo script (3-minute target)

**0:00 – 0:20 — Problem & pitch**
> *"Smallholder farmers get static tips that ignore weather, market windows, and biodiversity. AgriGuardian is an agent that plans, learns from its own past runs via Arize MCP, and persists its plan to MongoDB — under the farmer's approval."*

**0:20 – 0:40 — Show the agent in Agent Builder**
- Open Google Cloud Agent Builder console.
- Show: `gemini-3-pro`, system instruction, 5 tools — highlight `arize_mcp` and `mongo_mcp` as MCP tools.

**0:40 – 1:30 — End-to-end run**
- Prompt: *"Recommend a kharif crop plan for my 2-hectare farm at 18.52, 73.85."*
- Trace appears showing the agent:
  - calls `arize_mcp.search_traces` first → finds 3 similar past runs (avg eval 0.81)
  - calls `weather`, `soil`, `market`
  - returns structured JSON plan with 7 tasks + confidence score

**1:30 – 2:15 — Take action**
- Reply: *"Save this plan."*
- Agent calls `mongo_mcp.insert-one` → confirms.
- Open MongoDB Compass, show the persisted document.

**2:15 – 2:45 — Adapt + close the loop**
- *"Mark task 1 as done and re-plan the week."*
- Agent calls `mongo_mcp.update-many`, re-plans, then `arize_mcp.log_feedback`.
- Switch to Arize AX dashboard — show the trace tree and the evaluation score on the just-completed run.

**2:45 – 3:00 — Outro**
- Repo URL, license, "built with Gemini 3 + Agent Builder + Arize MCP".

---

## 5. Submission checklist

Pre-flight (before recording):

- [ ] Rotate the two API keys leaked in chat (Arize + Gemini)
- [ ] GCP billing enabled (use credit/debit card; UPI often rejected for first signup)
- [ ] Run `agent-builder/deploy.ps1` → live Cloud Run URL captured
- [ ] Upload `agent-builder/agriguardian-agent.yaml` to Agent Builder console with `${CLOUD_RUN_URL}` substituted in
- [ ] Set GCP Secret Manager entries: `mcp-arize-token`, `mcp-mongodb-token`
- [ ] Verify `arize_mcp` returns real results (search a real eval)
- [ ] Open Arize AX UI → confirm a fresh trace lands after a test run

Submission:

- [ ] Record 3-min video (script in §4), upload to YouTube unlisted
- [ ] Fill Devpost form: repo URL, hosted URL, video URL, track = **Arize**
- [ ] Pin a release tag on GitHub (`v1.0.0-hackathon`) so the judging snapshot is stable

---

## 6. Out of scope (intentionally)

- Next.js frontend — Agent Builder's built-in chat + Swagger UI suffice for the demo
- API gateway, service mesh — single-service architecture, not microservices
- Real AGMARKNET market API — our deterministic seasonal mock is more reliable for a demo
- Frontend authentication / multi-tenancy — out of scope for a hackathon MVP

---

## 7. References

- Devpost event: https://googlecloudrapidagenthackathon.devpost.com/
- Google Cloud Agent Builder: https://cloud.google.com/products/agent-builder
- Gemini 3: https://blog.google/products/gemini/
- Arize MCP server: https://github.com/Arize-ai/openinference
- Model Context Protocol spec: https://modelcontextprotocol.io
- MongoDB MCP server: https://github.com/mongodb-labs/mongodb-mcp-server

