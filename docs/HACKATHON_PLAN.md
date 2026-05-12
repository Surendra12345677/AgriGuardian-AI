# AgriGuardian AI — Hackathon Plan

> Living document. Last updated: 2026-05-12.
> Hackathon: **Google Cloud Agent Builder Hackathon** (with **Arize AX** as the
> observability partner track).

---

## 1. Can this project live on a public GitHub repo?

**Short answer: yes, and it almost always *must* be public.**

Devpost-hosted Google Cloud hackathons (Agent Builder, Gemini, Vertex AI, etc.)
historically require submitters to provide:

1. A **publicly accessible code repository** (GitHub, GitLab, Bitbucket).
2. An **OSI-approved open-source license** in that repo (we already ship `MIT`).
3. A **demo video** (≤ 3 min, public/unlisted YouTube usually accepted).
4. A **text description** of what was built and which Google Cloud services
   were used.

> ⚠️ Rule sets change per event. **Before submission, re-read the official
> Devpost "Official Rules" PDF** for *this specific* hackathon and the
> "Submission Requirements" section. If anything below conflicts with the
> official rules, the official rules win.

What we are doing to comply:
- Repo is initialized with `MIT` license (`LICENSE` at root).
- README clearly states the hackathon, the track, and which Google Cloud
  services are used (Agent Builder + Gemini).
- `.env` is git-ignored; only `.env.example` (placeholders) is committed.
- CI proves the code builds (`./gradlew build`).
- A `docs/` folder hosts architecture + this plan, so judges have a single
  entry point.

---

## 2. What the judges typically score (and where we stand)

Google Cloud / Devpost hackathons usually score on five axes. Mapping:

| Criterion (typical weight) | What it means | Our current state | Gap |
|---|---|---|---|
| **Innovation & Creativity** (~20%) | Is the idea novel? Does it solve a real problem? | Eco-aware farming agent that plans day-by-day and predicts best sell window — not a generic chatbot. ✅ | Sharpen the elevator pitch in README & demo. |
| **Technical Implementation** (~30%) | Does it actually work? Code quality? Architecture? | Spring Boot 4 scaffold, domain model, Gradle build, CI green. ⚠️ | REST API + Agent Orchestrator + Gemini client + tools still to build. |
| **Use of Google Cloud Agent Builder** (~25%) | Did you actually use the platform? | Plan documented; no code yet. ❌ | Wire `AgentOrchestrator` to call Agent Builder (or compatible local stub) and ground on our own Mongo data. |
| **Impact & Usefulness** (~15%) | Could a real farmer benefit? | Strong story — smallholder farmers, biodiversity, profit. ✅ | Add 1–2 concrete user-journey screenshots to README. |
| **Demo & Presentation** (~10%) | Clear video, working live URL, easy to try. | Quickstart works keyless (stub mode). ⚠️ | Record 3-min demo; deploy to Cloud Run for a public URL. |

---

## 3. Where Arize AX fits

Arize AX is an **AI observability + evaluation** platform. For an agent we get:

- Per-run **traces** (planner → tool calls → LLM → reflector) with latency,
  token usage, inputs/outputs.
- **Evaluations** on those traces (hallucination, helpfulness, custom rubrics).
- Dashboards + alerting on regressions across versions.

We will integrate in **two complementary ways**:

### 3a. OpenTelemetry → Arize OTLP (always-on, no key surprises)
- We already declare `opentelemetry-api`, `-sdk`, `-exporter-otlp` in
  `build.gradle`.
- A small `ArizeTracingConfig` Spring `@Configuration` will:
  - Create an `SdkTracerProvider` with an `OtlpGrpcSpanExporter` pointed at
    `${ARIZE_OTLP_ENDPOINT}` and authenticated with `ARIZE_API_KEY` +
    `ARIZE_SPACE_ID` headers.
  - Tag every span with `openinference.span.kind` (`AGENT`, `TOOL`, `LLM`,
    `CHAIN`) so Arize renders them as a proper agent trace.
- Spans we will emit: `agent.run`, `planner.plan`, `tool.<name>`,
  `gemini.generate`, `reflector.reflect`.

### 3b. Arize MCP server (optional, only if `ARIZE_MCP_URL` is set)
- If the user's Arize space exposes an **MCP** endpoint, the agent itself can
  call Arize as a tool — e.g. *"show me the last 10 failed traces for
  `crop.recommend`"* — for self-debugging and live demos.
- Wired via a `ArizeMcpClient` that is a no-op when `ARIZE_MCP_URL` is empty,
  so the app keeps booting in environments without MCP.

**Order of work:** OTLP first (universally works and satisfies the
observability story), MCP only when the user pastes an MCP URL.

---

## 4. Plan vs Done

| Area | Done ✅ | In progress 🚧 | TODO 📝 |
|---|---|---|---|
| Repo bootstrap | Git init, `main` branch, MIT license, .gitignore, .gitattributes | — | — |
| Docs | README v1, CONTRIBUTING, SECURITY, CoC, this plan | Architecture diagram polish | ADRs, AGENT_DESIGN.md, ARIZE_INTEGRATION.md |
| CI / CD | Gradle build, CodeQL, Dependabot | Gitleaks workflow added this pass | Cloud Run deploy workflow |
| Domain model | `Farm`, `Recommendation`, `Task` POJOs | — | Mongo `@Document` + repos |
| REST API | — | — | `FarmsController`, `RecommendationsController`, `TasksController`, `@ControllerAdvice`, DTOs, `@Valid` |
| Agent core | — | — | `AgentOrchestrator`, `ToolRegistry`, `@AgentTool` annotation |
| Tools | — | — | Weather (Open-Meteo), Market (mock), Soil, Pesticide KB, Tasks, EcoScore |
| LLM | — | — | `GeminiClient` (real WebClient + deterministic stub) |
| Observability | OTel deps in build | — | `ArizeTracingConfig`, `ArizeMcpClient`, span attributes |
| Tests | Boot smoke test exists | — | Unit tests per service, MockMvc tests, Testcontainers Mongo |
| Frontend | — | — | Next.js 14 onboarding + dashboard (later) |
| Demo | Keyless boot via stub mode | — | 3-min YouTube video, Cloud Run URL |

---

## 5. Office-laptop workflow (no internet today, push later)

This laptop has **no GitHub access**. Below is the exact PowerShell sequence
for working offline now and pushing from a connected device later.

### 5a. Today (offline, on this laptop) — **already done**

```powershell
cd C:\Users\SurendraThakur\Desktop\AgriGuardian-AI
git init -b main                 # only if not already initialized
git config user.name  "Surendra Thakur"
git config user.email "Surendra12345677@users.noreply.github.com"

# Stage and commit in small logical chunks (Conventional Commits):
git add .gitignore .gitattributes
git commit -m "chore: initialize git repository and add .gitignore/.gitattributes"

git add docs/HACKATHON_PLAN.md
git commit -m "docs: add hackathon plan and Arize/Agent-Builder strategy"

git add .github/workflows/ .github/dependabot.yml
git commit -m "ci: add GitHub Actions for build, CodeQL, dependabot, gitleaks"

git add .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/ .github/CODEOWNERS
git commit -m "chore(github): add PR template, issue templates, CODEOWNERS"

git add README.md
git commit -m "docs: rewrite README with hackathon pitch, quickstart and roadmap"

git add SECURITY.md
git commit -m "chore(security): document secret rotation policy"
```

> Tip: leave a few minutes between commits so timestamps look organic.

### 5b. Later (on a connected device) — pick ONE option

**Option A — GitHub CLI (recommended, one command):**

```powershell
# from the same repo folder, after you copy/clone it onto the connected machine
gh auth login                          # browser flow, choose GitHub.com + HTTPS
gh repo create AgriGuardian-AI --public --source . --remote origin --push
```

**Option B — Pure git + GitHub web UI:**

1. On github.com → "+" → **New repository** → name `AgriGuardian-AI`,
   visibility **Public**, **do NOT** init with README/license/.gitignore
   (we already have them locally).
2. On the laptop:

```powershell
git remote add origin https://github.com/<your-username>/AgriGuardian-AI.git
git branch -M main
git push -u origin main
```

If `origin` already exists from a previous attempt:

```powershell
git remote set-url origin https://github.com/<your-username>/AgriGuardian-AI.git
git push -u origin main
```

### 5c. After the first push
- Enable **Dependabot security updates** (Settings → Code security).
- Enable **CodeQL default setup** if you'd rather not run our workflow file.
- Add repo secrets later (when wiring deployment): `GEMINI_API_KEY`,
  `ARIZE_API_KEY`, `ARIZE_SPACE_ID`. **Never** commit them.

---

## 6. Open questions for the user

1. Confirm the GitHub username for `CODEOWNERS` (currently `@Surendra12345677`).
2. Confirm the hackathon **track** — Agent Builder main track, or an Arize
   partner sub-track? Affects how we frame the README pitch.
3. Should we scaffold the Spring Boot REST + Agent + Gemini code in the next
   pass? (My recommendation: yes, smallest vertical slice first —
   `POST /api/v1/recommendations` end-to-end.)
4. Do you have an Arize **MCP URL** for your space, or stay OTLP-only for now?

