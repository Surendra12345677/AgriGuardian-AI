# 🌱 AgriGuardian AI

> An autonomous AI farming agent that helps farmers choose the most profitable crop, plan farming day-by-day, optimize pesticide usage, and sell at the right time — powered by **Gemini** and observed by **Arize MCP**.

**Hackathon:** Building Agents for Real-World Challenges
**Track:** Arize
**Status:** 🚧 Work in progress

---

## 🎯 The Problem

Farmers struggle with uncertain weather, fluctuating market prices, high input costs, and a lack of trustworthy daily guidance. Most apps give static, one-time recommendations and ignore future market profitability or environmental impact.

## 💡 The Solution

AgriGuardian AI is a **personal AI farming manager** that:

- 🌾 Recommends the most profitable crop based on weather, soil, water and **future** market demand
- 📅 Generates a complete **day-by-day farming plan**
- 🔄 **Adapts dynamically** when the farmer marks tasks as done / skipped / cannot-afford
- 🐝 Optimizes pesticide usage to **protect bees, ants and biodiversity**
- 💰 Predicts the **best time to sell** for maximum profit
- ✅ Issues an **Eco Farming Trust Score** to help farmers earn premium prices

## 🤖 Why this is an Agent (not a chatbot)

| Capability | How |
|---|---|
| Plans tasks | `AgentOrchestrator` performs plan → tool-call → reflect loops |
| Reasons about the future | Gemini + weather + market trend tools |
| Monitors continuously | Daily replanning when tasks update |
| Adapts dynamically | Farmer task status triggers re-planning |
| Multi-step workflows | Onboard → recommend → plan → execute → sell |
| Human-in-the-loop | Every task requires farmer confirmation |

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 4 (Java 17) |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Database | MongoDB |
| LLM | Google **Gemini** (`gemini-2.0-flash` / `gemini-3`) |
| Agent Orchestration | Custom `AgentOrchestrator` (Google Cloud Agent Builder–compatible) |
| Observability | **Arize** (OpenTelemetry → Arize OTLP + Arize MCP server) |
| External APIs | Open-Meteo (weather), mock Market Price API |

## 🏗️ Architecture (high level)

```
┌──────────────┐      ┌─────────────────────────────────────┐      ┌──────────────┐
│  Next.js UI  │ ───► │   Spring Boot — AgentOrchestrator    │ ───► │   MongoDB    │
└──────────────┘      │  ┌─────────┐  ┌──────────────────┐  │      └──────────────┘
                      │  │ Planner │─▶│ Tool Registry    │  │
                      │  └─────────┘  │ • Weather        │  │      ┌──────────────┐
                      │       │       │ • Market         │  │ ───► │ Open-Meteo   │
                      │       ▼       │ • Soil           │  │      └──────────────┘
                      │  ┌─────────┐  │ • Pesticide KB   │  │
                      │  │ Gemini  │  │ • Mongo Tasks    │  │      ┌──────────────┐
                      │  │ Client  │  │ • Eco Calculator │  │ ───► │ Gemini API   │
                      │  └─────────┘  └──────────────────┘  │      └──────────────┘
                      │       │                             │
                      │       ▼                             │      ┌──────────────┐
                      │  ┌─────────────────────────────┐    │ ───► │  Arize MCP   │
                      │  │ Arize Tracing (OTel → OTLP) │    │      │ + OTLP traces│
                      │  └─────────────────────────────┘    │      └──────────────┘
                      └─────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- JDK 17
- MongoDB running on `localhost:27017` (or via `docker compose up -d mongo`)
- Node 18+ (for the frontend, when added)

### Run the backend

```powershell
# from repo root
./gradlew bootRun
```

Backend will boot **even without API keys** — Gemini falls back to deterministic stub mode so judges can evaluate the agent flow keyless.

Open http://localhost:8080/swagger-ui.html for the API.

### Environment variables (optional, for full power)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Real Gemini calls (otherwise stubbed) |
| `ARIZE_API_KEY` | Send traces to Arize |
| `ARIZE_SPACE_ID` | Arize space identifier |
| `ARIZE_OTLP_ENDPOINT` | Default `https://otlp.arize.com/v1` |
| `ARIZE_MCP_URL` | Arize MCP server endpoint |
| `MONGODB_URI` | Default `mongodb://localhost:27017/agriguardian` |

## 📦 Project Layout

```
src/main/java/com/Hackathon/AgriGuardian/AI/
  config/         Spring + OpenTelemetry + Mongo configuration
  domain/model/   Farm, Recommendation, Task (Mongo documents)
  domain/repo/    Spring Data Mongo repositories
  api/            REST controllers + DTOs + GlobalExceptionHandler
  agent/          AgentOrchestrator, ToolRegistry, @AgentTool
  agent/tools/    Weather / Market / Soil / Pesticide / Tasks / EcoScore tools
  ai/             GeminiClient (real + stub fallback)
  observability/  ArizeTracingService, ArizeMcpClient
  external/       OpenMeteoClient, MarketPriceClient
  service/        Domain services
  exception/      Typed errors

frontend/         Next.js 14 app (in progress)
docs/             ARCHITECTURE, AGENT_DESIGN, ARIZE_INTEGRATION, ADRs
```

## 🔭 Arize Integration

Every agent run emits a trace with spans for: `planner`, each `tool.*` call, `gemini.generate`, `reflector`. Span attributes include input, output, latency, token usage, confidence score, and evaluation labels — giving full reasoning observability in Arize.

See `docs/ARIZE_INTEGRATION.md` for the full schema.

## 📜 License

[MIT](./LICENSE) © 2026 Surendra Thakur and AgriGuardian AI Contributors

## 🙏 Acknowledgements

- Google **Gemini** for the reasoning engine
- **Arize** for trustworthy AI observability via MCP
- Open-Meteo for free weather data

