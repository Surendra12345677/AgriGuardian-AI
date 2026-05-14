# 📝 AgriGuardian AI — Hackathon Submission

> Everything a judge (or you, the submitter) needs in one place.
> Copy-paste the sections below straight into the Devpost form.

- **Event:** Google Cloud — *Building Agents for Real-World Challenges*
- **Track / partner bucket:** 🟣 **Arize**
- **Repo (public, MIT):** https://github.com/Surendra12345677/AgriGuardian-AI
- **Hosted demo:** _Cloud Run URL goes here once deployed_
- **Demo video:** _YouTube unlisted URL goes here_
- **Date:** May 2026

---

## 1. Track choice — and why we use a second MCP

We are submitting to the **Arize** bucket.

The hackathon rule is *"meaningful integration with **at least one** participating partner's solution using MCP."* We meet the qualifier with **Arize MCP** — the agent calls `arize_mcp.search_traces` *before* answering and `arize_mcp.log_feedback` *after* answering, closing an observe→learn loop.

We additionally use **MongoDB MCP** as the agent's write-side action tool, because the rules also demand the agent *"move beyond chat"* and *"manage a local database / interact with a live web service"*. MongoDB MCP delivers exactly that — the agent persists farm plans under explicit human approval. This is fully permitted (the "at-least-one" rule is a floor, not a ceiling) and we are still judged in the **Arize** bucket only.

---

## 2. Devpost form — copy/paste blocks

### Tagline (max 200 chars)
> An autonomous Gemini-3 agent that doubles smallholder-farmer income — picks the most profitable crop, plans the season in 13 languages, projects ₹ impact, and self-improves via Arize MCP.

### Inspiration
Smallholder farmers in India face volatile weather, unpredictable mandi prices and rising input costs, yet most "smart farming" apps give one-shot static tips that ignore future market windows, the farmer's own language, and the farmer's own history. We wanted to build an **agent**, not a chatbot — something that plans, reasons, takes action, and *learns from its own past runs*.

### What it does
AgriGuardian is an autonomous farm-advisor agent that:

1. **Picks the most profitable crop** for a farm given soil, weather forecast, water availability and budget.
2. **Generates a day-by-day season plan** with concrete tasks (sowing, irrigation, pesticide windows, harvest, sell-window).
3. **Replies in the farmer's language** — 13 languages out of the box: English, Hindi, Marathi, Tamil, Telugu, Bengali, Punjabi (India) plus Spanish, French, German, Italian, Portuguese, Dutch (EU smallholders).
4. **Projects real ₹ impact** — extra income, yield Δ%, water saved %, payback weeks. No hand-wavy "this will help"; the impact dashboard shows what the farmer takes home.
5. **Stress-tests the plan** under 4 what-if scenarios (baseline / drought / price-crash / pest outbreak) so the farmer adopts something *robust*, not optimistic.
6. **Diagnoses sick crops** (Plant Doctor): describe the symptoms in any language, Gemini matches the most likely disease, ranks treatments by cost, prescribes prevention.
7. **Self-improves** — every run is a trace exported via OTLP to Arize AX. The next run consults those traces through Arize MCP **before** answering, so quality compounds over time.
8. **Persists plans to MongoDB** through MongoDB MCP, only after explicit farmer approval — human-in-the-loop by design.

### How we built it

| Layer | Choice |
|---|---|
| Reasoning brain | **Gemini 3** (`gemini-3-pro` / `gemini-3-flash`) |
| Agent runtime | **Google Cloud Agent Builder** — spec at `agent-builder/agriguardian-agent.yaml` |
| Partner MCP (track) | **Arize MCP** → `mcp/ArizeMcpConfig.java` + `agent/tool/impl/ArizeMcpTool.java` |
| Action MCP | **MongoDB MCP** → `mcp/MongoMcpConfig.java` + `agent/tool/impl/MongoMcpTool.java` |
| Backend | Spring Boot 4 / Java 17 / virtual threads |
| Frontend | Next.js 15 App Router + React 19 + Tailwind |
| Database | MongoDB Atlas |
| Observability | OpenTelemetry → OTLP → **Arize AX** |
| Resilience | Resilience4j (CircuitBreaker + Retry) + Caffeine cache |
| External tools | Open-Meteo (weather), seasonal market price KB, soil KB |
| CI/CD | GitHub Actions: build, **CodeQL**, **Gitleaks**, Dependabot |

The agent loop emits 9 OpenTelemetry spans per request:

```
agent.run
 ├─ planner.plan
 ├─ tool.arize.mcp           ← consult past traces (Arize MCP)
 ├─ tool.weather             ← Open-Meteo
 ├─ tool.soil                ← soil knowledge base
 ├─ tool.market              ← seasonal price KB
 ├─ gemini.generate          ← Gemini 3 reasons
 ├─ tool.mongo.mcp           ← persist plan (MongoDB MCP, human-approved)
 └─ reflector.reflect        ← self-critique
```

Every span is exported to Arize AX; the next request's `tool.arize.mcp` span looks them up. That is the **observe→learn loop** that justifies our Arize bucket entry.

### Challenges we ran into
- Keeping the agent **deterministic in stub mode** so judges can evaluate the flow without API keys.
- Returning a **single structured JSON envelope** (`{ advice, tasks[], confidence, impact, risks[], crop }`) from Gemini that drives the impact dashboard, the action plan, the confidence ring AND the what-if comparison cards — required tight prompt engineering.
- Making the trace export **fail-soft**: if Arize is unreachable the agent must still answer the farmer.

### Accomplishments we're proud of
- A real **multi-step agent** (9 spans), not a single LLM call dressed as one.
- **7 Indian languages** + **6 European languages** working end-to-end — language flag flows from the UI all the way through Gemini and into the impact dashboard.
- A **₹-denominated impact dashboard** that turns "this might help" into "this projects +₹38k extra income, payback in 6 weeks."
- A **what-if simulator** that re-runs the entire planner under 4 stress scenarios — judges can literally watch the plan adapt.
- A **Plant Doctor** that diagnoses a sick crop from a text description in seconds.
- The **Arize self-improvement loop** is real, not slideware: every span is shipped, the next run reads them.

### What we learned
- Agents win on **ergonomics**: the impact dashboard, the language switch, and the what-if simulator are what make a judge say *"oh, that's actually useful"* — not the model size.
- **MCP is a force-multiplier**: one YAML in `agent-builder/` plugs the agent into both Arize and MongoDB without a single bespoke client.
- **Trace-first development** (every span exported to Arize from day one) made debugging the orchestrator dramatically faster than `println`.

### What's next
- Voice input (Gemini Live API) so a low-literacy farmer can simply speak.
- Image-based Plant Doctor (vision) — backend already accepts the upload.
- WhatsApp Business delivery channel for the action plan.
- Cooperative-level dashboards for FPOs and agri-extension officers.

### Built with
`google-cloud-agent-builder`  `gemini-3`  `arize`  `arize-mcp`  `mongodb`  `mongodb-mcp`  `spring-boot`  `java-17`  `next.js`  `react`  `tailwind`  `opentelemetry`  `open-meteo`  `resilience4j`  `mongodb-atlas`  `cloud-run`

---

## 3. Demo video — 3-minute shot list (record this)

Total runtime target: **2 min 50 s**. Use OBS / Loom / Quicktime. Voice-over in English.

| # | Time | What's on screen | What you say (verbatim, 1 take) |
|---|---|---|---|
| 1 | 0:00–0:15 | Hero of the deployed site; chips visible | *"AgriGuardian is an autonomous Gemini-3 agent built on Google Cloud Agent Builder. Its mission: double smallholder-farmer income, one season at a time. We're submitting to the Arize partner bucket."* |
| 2 | 0:15–0:35 | Click **One-click demo farm** → farm appears in the list, the agent panel highlights | *"One click seeds a real demo farm. The agent now has a context — soil, water, lat/lon, budget."* |
| 3 | 0:35–1:10 | Click **Plan my season**. AgentTrace pipeline lights up. Result panel populates with crop name, confidence ring, impact dashboard, action plan. | *"The agent runs nine OpenTelemetry spans — plan, Arize MCP lookup, weather, soil, market, Gemini reasoning, MongoDB MCP persist, reflect. End-to-end in roughly 2.4 seconds. Notice the impact dashboard — extra income, yield delta, water saved, payback. Real numbers, not vibes."* |
| 4 | 1:10–1:25 | Click the **हिन्दी** language chip, click **Plan my season** again. Result re-renders in Hindi. Then click **Español** and re-plan to show the EU-language path. | *"The same agent in Hindi — and in Spanish. We support thirteen languages: seven Indian and six European, so the same agent works for an Indian smallholder and a Spanish olive farmer."* |
| 5 | 1:25–1:55 | Scroll to **What-if scenarios**, click **Run all scenarios**. The 4 cards (Baseline / Drought / Price-crash / Pest) progressively fill in. | *"Now we stress-test the plan against four realities. The agent re-runs the full planner under each scenario so the farmer adopts something robust, not optimistic."* |
| 6 | 1:55–2:20 | Scroll to **Plant Doctor**. Click the **wheat** sample chip → click **Diagnose**. Diagnosis card appears with treatments + prevention. | *"Plant Doctor — describe a sick crop, Gemini matches the most likely disease, ranks treatments by cost, prescribes prevention. In your language. In two seconds."* |
| 7 | 2:20–2:45 | **Switch to Arize AX UI** in another tab. Show the trace list with `agent.run` spans. Open one, expand the `tool.arize.mcp` span. | *"Every step is shipped to Arize AX over OTLP. The next run consults these traces through Arize MCP before answering — that's the self-improvement loop, and that's why we're in the Arize bucket."* |
| 8 | 2:45–2:50 | GitHub repo home with green CI badges + MIT license | *"Open-source under MIT, full CI on GitHub. AgriGuardian — agents that take action."* |

**Recording tips:**
- Run the backend with `GEMINI_API_KEY`, `ARIZE_*` and `MCP_ARIZE_*` set so the trace screen actually has data.
- Pre-warm the demo: hit **Plan my season** once before recording so caches are hot and the run is snappy on camera.
- Record at 1080p, mp4, then upload **unlisted** to YouTube. Paste that URL in the Devpost form.

---

## 4. 60-second judge test path (paste in Devpost "How to test")

```bash
# Local — zero API keys, fully runnable in stub mode
git clone https://github.com/Surendra12345677/AgriGuardian-AI.git
cd AgriGuardian-AI
docker compose up -d --build
# wait ~40s for the app health check, then open:
#   http://localhost:3000                     ← demo UI
#   http://localhost:8080/swagger-ui.html     ← API
#   http://localhost:8080/actuator/health
```

In the UI:
1. Click **One-click demo farm**.
2. Click **Plan my season** — see the 9-span trace + the impact dashboard.
3. Switch to **हिन्दी** and re-plan.
4. Scroll down → **Run all scenarios**.
5. Scroll down → **Plant Doctor**, click the **wheat** sample, **Diagnose**.

To see real Arize traces, set `ARIZE_ENABLED=true`, `ARIZE_API_KEY=...`, `ARIZE_SPACE_ID=...`, `MCP_ARIZE_ENABLED=true`, `MCP_ARIZE_URL=...` in `.env` and `docker compose up -d --build` again.

---

## 5. Repository pointers (so judges don't get lost)

| Want to look at | File |
|---|---|
| Agent Builder spec (Gemini 3 + tools + Arize MCP + MongoDB MCP) | [`agent-builder/agriguardian-agent.yaml`](./agent-builder/agriguardian-agent.yaml) |
| Multi-step orchestrator (the 9-span loop) | [`src/main/java/com/Hackathon/AgriGuardian/AI/agent/AgentOrchestrator.java`](./src/main/java/com/Hackathon/AgriGuardian/AI/agent/AgentOrchestrator.java) |
| Arize MCP client wiring (partner-track qualifier) | [`src/main/java/com/Hackathon/AgriGuardian/AI/mcp/ArizeMcpConfig.java`](./src/main/java/com/Hackathon/AgriGuardian/AI/mcp/ArizeMcpConfig.java) |
| MongoDB MCP client wiring (action tool) | [`src/main/java/com/Hackathon/AgriGuardian/AI/mcp/MongoMcpConfig.java`](./src/main/java/com/Hackathon/AgriGuardian/AI/mcp/MongoMcpConfig.java) |
| OTel → Arize AX exporter | [`src/main/java/com/Hackathon/AgriGuardian/AI/observability/`](./src/main/java/com/Hackathon/AgriGuardian/AI/observability/) |
| Plant Doctor endpoint | [`src/main/java/com/Hackathon/AgriGuardian/AI/api/DiagnoseController.java`](./src/main/java/com/Hackathon/AgriGuardian/AI/api/DiagnoseController.java) |
| Frontend (Next.js 15 dashboard) | [`web/`](./web/) |
| Cloud Run deploy script | [`agent-builder/deploy.ps1`](./agent-builder/deploy.ps1) |

---

## 6. License

[MIT](./LICENSE) — detected automatically by GitHub and shown in the **About** sidebar of the repo. ✅

