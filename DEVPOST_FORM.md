# 📋 Devpost submission form — copy/paste cheat-sheet

> Open https://googlecloud-rapidagent.devpost.com → **Submit project** →
> paste each field below into the matching Devpost input.
> Every field is pre-filled. The only blanks are the 3 things only you
> can provide (video URL, hosted URL, your contact handles).

---

## ⚠️ Before you click "Submit project"

You need these 3 things ready (everything else is done in this repo):

| # | What | Where you get it |
|---|------|------------------|
| 1 | **Hosted project URL** | Either deploy to Cloud Run via `agent-builder/deploy.ps1`, **or** deploy `web/` to Vercel in 60 seconds (`vercel --prod`), **or** ngrok-tunnel `localhost:3000` for the duration of judging. |
| 2 | **Demo video URL** | Record the shot list in `SUBMISSION.md` §3, upload to YouTube as **Unlisted**, paste the share link. |
| 3 | **Open-source repo URL** | ✅ already public: `https://github.com/Surendra12345677/AgriGuardian-AI` (MIT, detected by GitHub). |

Tell me when you have (1) and (2) and I'll wire them into `SUBMISSION.md`
+ `README.md` + the GitHub release notes for you.

---

## 1. Project name
```
AgriGuardian AI
```

## 2. Elevator pitch / Tagline (200 chars)
```
An autonomous Gemini-3 agent that doubles smallholder-farmer income — picks the most profitable crop, plans the season in 13 languages, projects ₹ impact, and self-improves via Arize MCP.
```

## 3. Track / Partner bucket
```
Arize
```

## 4. Project story — paste the WHOLE block

Devpost's "About the project" editor accepts Markdown. Paste this whole
section (it expands the headers into the standard Inspiration / What it
does / How we built it / Challenges / Accomplishments / What's next
sub-sections Devpost asks for).

> **Source of truth:** [`SUBMISSION.md` §2](./SUBMISSION.md) — paste from
> there to keep one place to edit.

## 5. "Built with" tags (paste comma-separated into Devpost's chip input)
```
google-cloud-agent-builder, gemini-3, arize, arize-mcp, mongodb, mongodb-mcp, spring-boot, java-17, next.js, react, tailwind, opentelemetry, open-meteo, resilience4j, mongodb-atlas, cloud-run
```

## 6. Try it out links

| Devpost field | Value |
|---|---|
| Website / hosted demo | `https://agriguardian-web-963977203522.us-central1.run.app` |
| GitHub repo | `https://github.com/Surendra12345677/AgriGuardian-AI` |
| Video demo | `<paste your YouTube unlisted URL here>` |
| Documentation | `https://github.com/Surendra12345677/AgriGuardian-AI/blob/main/SUBMISSION.md` |
| Backend Swagger (optional) | `https://agriguardian-ai-zqafbkccaa-uc.a.run.app/swagger-ui.html` |

## 7. Test instructions (paste into "How to run / test")
```
# Zero API keys, fully runnable in stub mode
git clone https://github.com/Surendra12345677/AgriGuardian-AI.git
cd AgriGuardian-AI
docker compose up -d --build
# wait ~40s, then:
#   http://localhost:3000                  ← demo dashboard
#   http://localhost:8080/swagger-ui.html  ← REST API
#   http://localhost:8080/actuator/health  ← health probe

In the UI:
1) Click "One-click demo farm"
2) Click "Plan my season" — 9-span agent trace + impact dashboard
3) Switch language (हिन्दी / Español / Deutsch / …) and re-plan
4) Run all what-if scenarios (drought / price-crash / pest)
5) Plant Doctor → click the wheat sample → Diagnose

For real Arize traces set ARIZE_ENABLED=true + ARIZE_API_KEY +
ARIZE_SPACE_ID + MCP_ARIZE_ENABLED=true + MCP_ARIZE_URL in .env and
re-run docker compose up -d --build.
```

## 8. Open-source license
```
MIT
```
(GitHub auto-detects this from `LICENSE` and shows it in the repo's
About sidebar — judges will see the badge without doing anything.)

## 9. Eligibility / age confirmation
Tick the boxes confirming:
- You're above the legal age of majority in your country.
- Your country is not on the excluded list.
- You agree to the official rules.

---

## 10. Why this submission targets Rank 1 in the Arize bucket

Judges in the Arize bucket look for **(a) genuine MCP usage**, **(b) a
real observe→learn loop**, and **(c) production polish**. Here's the
one-line summary you can also drop in your Devpost "Additional notes":

> AgriGuardian uses Arize MCP `search_traces` *before* every reasoning
> step (in-context retrieval of past evaluations) and exports every span
> of its 9-step agent loop to Arize AX over OTLP — so the next run is
> demonstrably better than the last. Plus a polished 13-language UI, a
> ₹-denominated impact dashboard, and a what-if simulator that re-runs
> the full plan under 4 stress scenarios. MIT-licensed, full CI
> (CodeQL + Gitleaks + Dependabot), Docker-Compose-runnable in 40
> seconds with zero API keys.

---

## 11. After submission — what to share

When you've clicked **Submit** on Devpost, share with me:
- The Devpost project URL — I'll add it to README + repo About.
- The video URL — I'll embed it in README and SUBMISSION.md.
- The hosted demo URL — I'll wire it into the Hero CTA + README badges.

lr