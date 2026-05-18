# 🎬 AgriGuardian AI — Demo Video Script (2:50)

> **Read this once before recording.** Every beat is timed, the screen
> is described, and the words you say are verbatim. Designed for the
> **Arize partner bucket**: ~60 s of the 170 s is on-screen Arize.
>
> Total runtime target: **2 min 50 s**
> Recording tool: OBS / Loom / Quicktime, 1080p, 30 fps, mic close
> Voice: calm, confident, slow-ish (≈140 wpm). Don't rush.

---

## ⚙️ Pre-flight checklist (do this in the 10 minutes before you hit record)

```
□  Set ARIZE_ENABLED=true, ARIZE_API_KEY=…, ARIZE_SPACE_ID=…,
   MCP_ARIZE_ENABLED=true, MCP_ARIZE_URL=…, GEMINI_API_KEY=…
   in .env, then `docker compose up -d --build`
□  Wait ~40s, then visit http://localhost:3000  (or your Cloud Run URL)
□  Click "One-click demo farm" once — pre-warms Gemini, fills caches,
   and seeds at least one trace into Arize so the AX dashboard isn't empty
□  Click "Plan my season" once — Gemini cache is now hot, so the on-camera
   run is snappy
□  Switch to Hindi, plan once → switch to Spanish, plan once → switch back
   to English (this populates the i18n cache)
□  Run scripts/eval_experiment.py once → /api/v1/eval/quality-trend
   has 12+ data points to chart
□  Open the Arize AX UI in tab 2: project = agriguardian-ai
□  Open this script in tab 3 (read-only)
□  Close every browser tab/notification you don't need
□  Set system DND on, dock the dock, hide the menu bar
□  Mic test: 3 seconds of speech, play it back
```

---

## 🎙️ Words-to-watch (pronunciation)

| Term            | Say it as            |
|-----------------|----------------------|
| Arize           | **AIR-eye-z** (rhymes with "Sunrise") |
| Gemini          | **JEM-in-eye** |
| OpenTelemetry   | "OpenTelemetry" — full word, not "OTel" on camera |
| MCP             | **M-C-P** (spell each letter) |
| Devpost         | "Dev-post" |
| AgriGuardian    | "AGri-Guardian" |

---

## 🎬 Shot-by-shot script

Legend:
- **🖥 Screen** — what the viewer sees, and *which UI component it is*
- **🎙 Say** — verbatim narration. The em-dashes are pause cues.

---

### Beat 1 — Cold open (0:00 → 0:12) · 12 s

**🖥 Screen:** Browser at `http://localhost:3000` (or Cloud Run URL).
The **Hero** section is in view (`web/components/Hero.tsx`) — big "AgriGuardian AI" title, tagline, the partner chip strip ("Arize · Gemini · MongoDB · Cloud Run") visible.

**🎙 Say:**

> "Half a billion smallholder farmers face uncertain weather, volatile prices, and shrinking margins — and most farming apps just give them static tips.
> AgriGuardian AI is different. It's an autonomous agent — built on Google Cloud Agent Builder, powered by Gemini, and observed by **Arize**. We're submitting to the **Arize** partner bucket."

**Action cue:** As you say "Arize partner bucket", scroll down once so the partner strip is dead-centre.

---

### Beat 2 — One-click onboard (0:12 → 0:30) · 18 s

**🖥 Screen:** Click the **"Onboard"** step in the StepStrip (or the "Onboard your first farm" tile on home). The **`FarmForm`** panel appears (`web/components/FarmForm.tsx`). Click the "**One-click demo farm**" / "Use sample farm" button.

A new entry appears in the **`FarmList`** (right rail, `web/components/FarmList.tsx`). The sticky **`FarmContextBar`** at the top now shows: 👤 Active farm · *Demo Farmer · 18.520, 73.850 · 2.0 ac · loam · water medium*.

**🎙 Say:**

> "One click seeds a real demo farm — location, soil type, water availability, budget. The agent now has a context: it knows *where* the farm is, what the soil is, and how much water is available. Notice the active-farm bar at the top — every action below now operates on this farm. We're ready to plan."

**Action cue:** As you say "ready to plan", click the green **"Continue to Plan →"** button.

---

### Beat 3 — Plan my season — the agent runs live (0:30 → 0:58) · 28 s

**🖥 Screen:** You're now on the **Plan** view. The `AgentPanel` is visible (`web/components/AgentPanel.tsx`) with a big **"Plan my season"** button. Click it.

The **`AgentTrace`** strip lights up step by step (`web/components/AgentTrace.tsx`):
`planner.plan` → `tool.arize.mcp` → `tool.weather` → `tool.soil` → `tool.market` → `gemini.generate` → `evaluator.eval` → `tool.arize.mcp.feedback` → `reflector.reflect`.

The result panel populates: **crop name**, **confidence ring**, **₹-impact dashboard** (extra income, yield Δ%, water saved, payback weeks), and the **day-by-day action plan** below.

**🎙 Say:**

> "When I click *Plan my season*, the agent runs a real multi-step mission. Watch the trace strip light up — first it consults its own past evaluations through the **Arize MCP** server. Then it pulls weather, soil, and market data. Gemini reasons over all of it and emits a structured plan. Then — and this is new — every plan is **scored by an LLM-as-judge** along four Arize-style dimensions: relevance, groundedness, agronomic correctness, and hallucination risk. That score is logged back into Arize so the next run is measurably better than this one. End-to-end in about two-and-a-half seconds.
> Look at the impact card: extra income in rupees, yield delta, water saved, payback in weeks. Real numbers, not vibes."

**Action cue:** As you say "Real numbers, not vibes", briefly hover the impact tiles so the tooltips appear.

---

### Beat 4 — Same agent, two more languages (0:58 → 1:13) · 15 s

**🖥 Screen:** In the section header's **`LanguagePill`** action, click the dropdown and choose **हिन्दी (Hindi)**. Click **Plan my season** again. The result panel re-renders in Devanagari script.
Then click **Español (Spanish)**, click Plan again — re-renders in Spanish.
Then click back to **English**.

**🎙 Say:**

> "Same agent, in Hindi. Same agent, in Spanish. Thirteen languages out of the box — seven Indian, six European — so the same product works for an Indian smallholder *and* a Spanish olive farmer. The language flag flows from the UI, through Gemini, all the way into the impact dashboard."

---

### Beat 5 — What-if simulator (1:13 → 1:33) · 20 s

**🖥 Screen:** Click the **"What-if"** step in the StepStrip. The **`WhatIfScenarios`** component appears (`web/components/WhatIfScenarios.tsx`). Click **"Run all scenarios"**. The four cards (**Baseline · Drought · Price-crash · Pest outbreak**) progressively fill in with their own crop choice + impact numbers.

**🎙 Say:**

> "Now we stress-test the plan. The agent re-runs the entire planner under four realistic shocks — drought, price-crash, pest outbreak — so the farmer adopts something *robust*, not optimistic. Notice the recommended crop changes per scenario: pearl millet appears under drought, pigeon pea under pest outbreak. The agent isn't just answering — it's *reasoning* about the future."

---

### Beat 6 — Plant Doctor (1:33 → 1:48) · 15 s

**🖥 Screen:** Click the **"Plant Doctor"** step. The **`PlantDoctor`** component appears (`web/components/PlantDoctor.tsx`). Click the **"wheat"** sample chip → click **Diagnose**. The diagnosis card appears with most-likely disease, ranked treatments by cost, and prevention tips.

**🎙 Say:**

> "Plant Doctor — describe a sick crop in any language, Gemini matches it to a likely disease, ranks treatments by cost, and prescribes prevention. Two seconds. No farm record required, so any farmer can use it."

---

### Beat 7 — 🟣 ARIZE DEEP DIVE (1:48 → 2:38) · 50 s ⭐ THIS IS THE KEY SECTION ⭐

This is the part the Arize judges actually grade you on. **Slow down here.**

**🖥 Screen — Sub-beat 7a (1:48 → 1:58, 10 s):**
**Switch to tab 2 — Arize AX UI.** The project `agriguardian-ai` is open. The trace list shows multiple `agent.run` traces.

**🎙 Say:**

> "Now the part we're really proud of. Every span you just watched lights up here in **Arize AX**. This is real telemetry — every weather call, every Gemini call, every MCP hop."

**🖥 Screen — Sub-beat 7b (1:58 → 2:13, 15 s):**
**Click the most recent `agent.run` trace.** The waterfall opens. Expand `tool.arize.mcp` → then expand `evaluator.eval`. The eval span attributes are visible: `eval.score.relevance`, `eval.score.groundedness`, `eval.score.agronomic_correctness`, `eval.score.hallucination_risk`, `eval.score.aggregate`.

**🎙 Say:**

> "Open one trace and you can see the whole agent loop as a span tree. Here's the **`tool.arize.mcp`** span — that's the agent reading its own past evaluations *before* it answers. And this span — **`evaluator.eval`** — is the LLM-as-judge scoring this run on four Arize-style dimensions: relevance, groundedness, agronomic correctness, hallucination risk."

**🖥 Screen — Sub-beat 7c (2:13 → 2:25, 12 s):**
**Switch to tab 3 — open** `http://localhost:8080/api/v1/eval/quality-trend?limit=20` (or click the "Quality" widget in the AgentPanel if you've wired the FE chart). The JSON shows a series of `evalScore` values + `averageScore` + `deltaScore`.

**🎙 Say:**

> "The agent persists every score, so we can show *quality over time*. This endpoint returns the eval-score time series — and you can see the score climbing as Arize MCP feeds older runs back into newer ones. That is the observe-to-learn loop in code, not in slideware."

**🖥 Screen — Sub-beat 7d (2:25 → 2:38, 13 s):**
**Switch to your terminal.** Run `python scripts/eval_experiment.py --label demo --limit 6`. The rows tick off live (`✓ pune-kharif-loam … agg=0.92`). The summary table prints: avgAggregate, shortlistHitRate.

**🎙 Say:**

> "And this — Arize calls them *Experiments* — is the same flow, run offline against a golden dataset of twelve farm scenarios. We can A/B-test prompt versions or model versions and get a per-dimension delta. Same rubric Arize AX uses online, replayable in CI. **That** is why we belong in the Arize bucket."

---

### Beat 8 — Closing (2:38 → 2:50) · 12 s

**🖥 Screen:** Switch to your GitHub repo home page — `https://github.com/Surendra12345677/AgriGuardian-AI`. Green CI badges visible, MIT license auto-detected in the About sidebar, README with the Arize Integration matrix.

**🎙 Say:**

> "Open-source under MIT, full CI on GitHub, Docker-Compose-runnable in forty seconds with zero API keys. **AgriGuardian — agents that take action, observed by Arize.** Thank you."

**Hold the GitHub page on screen for 2 seconds of silence**, then stop recording.

---

## 🎯 Time budget summary

| Beat | Section            | Duration | Cumulative |
|------|--------------------|---------:|-----------:|
| 1    | Cold open          | 12 s     | 0:12       |
| 2    | One-click onboard  | 18 s     | 0:30       |
| 3    | Plan my season     | 28 s     | 0:58       |
| 4    | Multi-language     | 15 s     | 1:13       |
| 5    | What-if simulator  | 20 s     | 1:33       |
| 6    | Plant Doctor       | 15 s     | 1:48       |
| 7    | **ARIZE DEEP DIVE**| **50 s** | 2:38       |
| 8    | Closing            | 12 s     | 2:50       |

**~30 % of the video is on-screen Arize content.** That's the ratio that wins the bucket.

---

## 🛟 Re-recording fallbacks

| If this breaks…                       | Do this on camera                                                                                     |
|---------------------------------------|--------------------------------------------------------------------------------------------------------|
| Gemini returns offline-fallback (429) | Say "we're hitting the free-tier quota — the agent gracefully falls back to a deterministic plan, which is *itself* an agentic feature." Move on. |
| Arize AX trace list is slow to load   | Say "traces ship asynchronously; here's one from earlier" and click an older trace.                   |
| `/quality-trend` is empty             | Run `python scripts/eval_experiment.py --label demo --limit 6` first, *then* refresh the URL.         |
| Language re-render hangs              | Skip Spanish, do only Hindi.                                                                           |
| What-if takes too long                | Click only the **Drought** card instead of "Run all scenarios".                                        |

---

## 📤 Upload checklist

```
□  Export at 1080p, 30 fps, mp4 (H.264), AAC audio
□  Title:        "AgriGuardian AI — Google Cloud Rapid Agent Hackathon (Arize track)"
□  Description:  Repo + Devpost + hosted-demo URLs
□  Visibility:   Unlisted on YouTube
□  Paste the URL into:
      • README.md "Demo video" line
      • SUBMISSION.md §0 "Demo video"
      • DEVPOST_FORM.md §6 "Video demo"
      • Devpost project form
```

---

## 🧠 The 30-second elevator pitch (use if Devpost asks for a "tagline take")

> *"AgriGuardian AI is an autonomous Gemini agent that doubles smallholder-farmer income — picks the most profitable crop, plans the season in thirteen languages, projects rupee-denominated impact, and self-improves through Arize. Every run is scored by an LLM-as-judge, the score is logged back via Arize MCP, and the next run reads it before answering. Observe-to-learn, in production code, today."*

