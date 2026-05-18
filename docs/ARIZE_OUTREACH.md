# 📧 Arize DevRel outreach — ready-to-send

Three channels, in priority order. Send all three within 24 hours. The Slack DM is the highest-yield.

---

## 1. Arize Community Slack (highest yield)

**Join:** https://arize-ai.slack.com (free signup, instant access)

**Post in `#general` (or `#hackathons` if it exists):**

> 👋 Hi all — I'm Surendra, building **AgriGuardian-AI** for the Arize partner bucket of the **Google Cloud Rapid Agent Hackathon** (submission June 11). Multi-step farm-advisory agent on Gemini + Agent Builder.
>
> I've wired:
> • **Arize MCP** — `search_traces`, `get_evaluations`, `log_feedback`, `list_datasets` (4 distinct ops, drives conditional planning)
> • **Arize AX** — OTel spans + custom `evaluator.eval` LLM-as-judge spans on every Gemini call (relevance / groundedness / agronomic correctness / hallucination risk)
> • **Datasets/Experiments** — 12-row golden dataset + reproducible Python experiment runner
> • **Alyx** — followed Aparna's email to set up evals from issues
>
> Would any DevRel / SE on the team be willing to spend **15 minutes** telling me which Arize features I'm under-using? I want my submission to showcase what the team is most proud of, not just check boxes.
>
> Repo (MIT, public): https://github.com/Surendra12345677/AgriGuardian-AI
> Live demo: https://agriguardian-web-963977203522.us-central1.run.app
>
> Happy on your schedule. Thank you! 🙏

---

## 2. Email — support@arize.com + community@arize.com

**Subject:** Google Cloud Rapid Agent Hackathon — Arize integration review request (15 min)

> Hi Arize team,
>
> I'm Surendra, building **AgriGuardian-AI** for the Arize partner bucket of the **Google Cloud Rapid Agent Hackathon** sponsored by Google (submission deadline June 11, 2026).
>
> AgriGuardian is a multilingual, multi-step farm-advisory agent built on **Gemini + Google Cloud Agent Builder** that I've integrated deeply with Arize:
>
> 1. **Arize MCP** — agent calls `search_traces`, `get_evaluations`, `log_feedback`, and `list_datasets` mid-plan; the result of `get_evaluations` drives a *conditional planning branch* (deep / standard / fast pipelines based on prior eval scores).
> 2. **Arize AX** — every span (`agent.run`, `planner.plan`, `tool.*`, `gemini.generate`, `evaluator.eval`) is exported over OTLP to Arize AX with Arize-native eval attributes (`eval.score.relevance`, `eval.score.groundedness`, `eval.score.agronomic_correctness`, `eval.score.hallucination_risk`, `eval.score.aggregate`).
> 3. **LLM-as-judge evaluator** — every recommendation is scored by a Gemini-judge with a deterministic-rubric fallback for keyless dev. Scores are persisted + exposed via `/api/v1/eval/quality-trend` and `/api/v1/eval/distribution` so the "Alyx-style" score distribution is visible to judges.
> 4. **Datasets / Experiments** — 12-scenario golden dataset (`evals/golden_dataset.jsonl`) + a stdlib-only Python experiment runner (`scripts/eval_experiment.py`) that produces baseline-vs-promptV2 comparison tables.
>
> Aparna's email this week was very on-point — we'd already done step 1 (set up the app), step 2 (traces flowing), and step 3 (patterns surfaced), and we're now on step 4 (turning issues into evals).
>
> **My ask:** Would a DevRel / Solutions engineer be willing to spend ~15 minutes telling me which Arize features I'm under-using? My goal is for the submission to showcase what the team is most proud of, not just check the MCP box.
>
> - **Repo (MIT, public):** https://github.com/Surendra12345677/AgriGuardian-AI
> - **Live demo:** https://agriguardian-web-963977203522.us-central1.run.app
> - **Integration write-up:** https://github.com/Surendra12345677/AgriGuardian-AI/blob/main/docs/ARIZE_INTEGRATION.md
> - **Eval methodology:** https://github.com/Surendra12345677/AgriGuardian-AI/blob/main/docs/EVAL_REPORT.md
>
> Happy to meet on your schedule. I can demo end-to-end in 10 minutes.
>
> Thank you,
> **Surendra Thakur**
> Software Engineer, EPAM Systems · India
> GitHub: https://github.com/Surendra12345677
> Devpost: https://devpost.com/thakursurendra3612

---

## 3. Reply to Aparna's email directly

> Hi Aparna,
>
> Thanks for the nudge on evals — I followed the steps and AgriGuardian now ships per-trace `evaluator.eval` spans plus `/api/v1/eval/distribution` so the score-distribution baseline you describe is visible both in Arize AX and in our app's own dashboard.
>
> We're submitting AgriGuardian to the **Arize bucket of the Google Cloud Rapid Agent Hackathon** (deadline June 11). Repo: https://github.com/Surendra12345677/AgriGuardian-AI · Demo: https://agriguardian-web-963977203522.us-central1.run.app.
>
> Would love any pointer on which Arize features judges in the partner bucket weight most heavily — happy to apply them this week.
>
> Best,
> Surendra

---

## ⏰ Why send all three

- **Slack** — fastest, casual, often gets a same-day DM from a DevRel engineer
- **Email** — formal, lands in a queue, gives them a paper trail to reference
- **Reply to Aparna** — she explicitly opened a thread; replying signals you're acting on her advice, which matters because she literally founded the company

Even if zero of them respond, you've **demonstrated outreach** which (a) sometimes shows up in a "we noticed you engaged" judging signal, and (b) puts AgriGuardian on the team's radar before judging starts.

Send them today. ⚡

