# 🌱 AgriGuardian AI

> An **agentic farm-advisor** built on **Google Cloud Agent Builder**, grounded
> in farm/weather/market data, reasoned by **Gemini**, and observed end-to-end
> with **Arize AX**.

[![build](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/build.yml/badge.svg)](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/build.yml)
[![codeql](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/codeql.yml/badge.svg)](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/codeql.yml)
[![gitleaks](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/Surendra12345677/AgriGuardian-AI/actions/workflows/gitleaks.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Java](https://img.shields.io/badge/Java-17-007396?logo=openjdk&logoColor=white)](https://adoptium.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.0-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)

**Hackathon:** Google Cloud **Agent Builder** Hackathon
**Observability partner:** Arize AX
**Status:** 🚧 Work in progress — see [`docs/HACKATHON_PLAN.md`](./docs/HACKATHON_PLAN.md)
**Demo video:** _coming soon_ · **Live URL:** _coming soon (Cloud Run)_

---

## 🎯 Problem

Smallholder farmers face uncertain weather, volatile prices, and rising input
costs, yet most "smart farming" apps give one-shot static tips that ignore
**future** market windows and biodiversity impact.

## 💡 Solution

AgriGuardian AI is a **personal AI farming manager** that:

- 🌾 Recommends the most **profitable** crop given weather, soil, water and
  forecasted market demand
- 📅 Generates a **day-by-day plan**
- 🔄 **Replans dynamically** when the farmer marks tasks done / skipped /
  unaffordable
- 🐝 Optimizes pesticide usage to **protect bees, ants, and biodiversity**
- 💰 Predicts the **best time to sell**
- ✅ Issues an **Eco Farming Trust Score** so farmers can earn premium prices

## 🤖 Why this is an *Agent* (not a chatbot)

| Capability | How |
|---|---|
| Plans tasks | Plan → tool-call → reflect loop in `AgentOrchestrator` |
| Reasons about the future | Gemini + weather + market trend tools |
| Adapts dynamically | Task status updates trigger re-planning |
| Multi-step workflows | Onboard → recommend → plan → execute → sell |
| Human-in-the-loop | Every task requires farmer confirmation |
| Observed | Every step is a span in Arize AX |

## 🏗️ Architecture

```mermaid
flowchart LR
    U[Farmer · Next.js UI] -->|REST| API[Spring Boot REST API]
    API --> ORCH[AgentOrchestrator<br/>Agent Builder–compatible]
    ORCH --> GEM[(Gemini<br/>gemini-2.0-flash)]
    ORCH --> TOOLS{Tool Registry}
    TOOLS --> WX[Weather · Open-Meteo]
    TOOLS --> MKT[Market Price · mock/live]
    TOOLS --> SOIL[Soil KB]
    TOOLS --> PEST[Pesticide KB]
    TOOLS --> ECO[Eco-Score Calc]
    TOOLS --> DB[(MongoDB<br/>farms · tasks · recs)]
    ORCH -. OTel spans .-> ARIZE[(Arize AX<br/>OTLP + optional MCP)]
    API -. health/metrics .-> ACT[Actuator]
```

Spans emitted per request: `agent.run` → `planner.plan` → `tool.<name>` →
`gemini.generate` → `reflector.reflect`. See
[`docs/HACKATHON_PLAN.md`](./docs/HACKATHON_PLAN.md) §3 for the Arize wiring
details.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 4 (Java 17, virtual threads) |
| Frontend | Next.js 14 + TypeScript + Tailwind *(planned)* |
| Database | MongoDB |
| LLM | Google **Gemini** (`gemini-2.0-flash`) |
| Agent platform | Google Cloud **Agent Builder** (compatible orchestrator) |
| Observability | **Arize AX** (OpenTelemetry → OTLP, optional MCP) |
| External APIs | Open-Meteo (weather), mock Market Price API |

## 🚀 Quick Start (PowerShell)

### Prerequisites
- JDK 17 (Temurin recommended)
- MongoDB on `localhost:27017` (or `docker compose up -d mongo`)
- *(Optional)* Gemini + Arize keys — the app **boots keyless** in stub mode

```powershell
# clone
git clone https://github.com/Surendra12345677/AgriGuardian-AI.git
cd AgriGuardian-AI

# configure
Copy-Item .env.example .env
# edit .env and paste your keys (or leave blank for stub mode)

# run
./gradlew bootRun
```

Then open:

- API docs: http://localhost:8080/swagger-ui.html
- Health:   http://localhost:8080/actuator/health

> Stub mode means judges can evaluate the agent flow **without any API key**.

## 🔑 Environment variables

Sourced from [`.env.example`](./.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | optional | Real Gemini calls; blank → deterministic stub |
| `GEMINI_MODEL` | optional | Default `gemini-2.0-flash` |
| `GEMINI_STUB_MODE` | optional | `auto` \| `always` \| `never` |
| `ARIZE_ENABLED` | optional | `true` to export OTLP traces |
| `ARIZE_API_KEY` | optional | Arize Service Key (Member role) |
| `ARIZE_SPACE_ID` | optional | Arize space identifier |
| `ARIZE_OTLP_ENDPOINT` | optional | Default `https://otlp.arize.com/v1` |
| `ARIZE_MCP_URL` | optional | If your Arize space exposes MCP |
| `MONGODB_URI` | optional | Default `mongodb://localhost:27017/agriguardian` |
| `PORT` | optional | Default `8080` |
| `SPRING_PROFILES_ACTIVE` | optional | Default `dev` |

## 📦 Project layout

```
src/main/java/com/Hackathon/AgriGuardian/AI/
  domain/model/   Farm, Recommendation, Task                        (done)
  domain/repo/    Spring Data Mongo repositories                    (todo)
  api/            REST controllers + DTOs + GlobalExceptionHandler  (todo)
  agent/          AgentOrchestrator, ToolRegistry, @AgentTool       (todo)
  agent/tools/    Weather / Market / Soil / Pesticide / Eco         (todo)
  ai/             GeminiClient (real + stub fallback)               (todo)
  observability/  ArizeTracingConfig, ArizeMcpClient                (todo)
  config/         Spring + OpenTelemetry + Mongo wiring             (todo)

docs/             HACKATHON_PLAN.md (start here)                    (done)
.github/          CI, CodeQL, Dependabot, Gitleaks, templates       (done)
```

## 🏆 Hackathon

- **Event:** Google Cloud Agent Builder Hackathon
- **Track:** Build a useful agent grounded in your own data
- **Partner track:** Arize AX observability
- **Criteria mapping:** see
  [`docs/HACKATHON_PLAN.md`](./docs/HACKATHON_PLAN.md) §2

## 🗺️ Roadmap

- [x] Repo bootstrap (license, .gitignore, .gitattributes)
- [x] CI: Gradle build, CodeQL, Dependabot, Gitleaks
- [x] Domain models (`Farm`, `Recommendation`, `Task`)
- [x] Hackathon plan committed
- [ ] Spring Data Mongo repositories
- [ ] REST API + DTO validation + global error handler
- [ ] `AgentOrchestrator` + `ToolRegistry` + first 3 tools
- [ ] `GeminiClient` (real + stub) wired behind config flag
- [ ] Arize OTel exporter + span attributes
- [ ] Optional Arize MCP client
- [ ] Unit + MockMvc + Testcontainers tests
- [ ] Cloud Run deployment workflow
- [ ] Next.js frontend (onboarding + dashboard)
- [ ] 3-min demo video

## 🤝 Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). Security disclosures: see
[`SECURITY.md`](./SECURITY.md).

## 📜 License

[MIT](./LICENSE) © 2026 Surendra Thakur and AgriGuardian AI Contributors

## 🙏 Acknowledgements

- Google **Agent Builder** + **Gemini** for the reasoning engine
- **Arize AX** for trustworthy AI observability
- **Open-Meteo** for free, open weather data

