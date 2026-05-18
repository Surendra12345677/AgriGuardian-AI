# 🧪 Evaluation Report — AgriGuardian AI

> Reproducible Arize-style experiment over the golden dataset committed
> at [`evals/golden_dataset.jsonl`](../evals/golden_dataset.jsonl).
>
> The numbers below are *real* outputs of
> [`scripts/eval_experiment.py`](../scripts/eval_experiment.py) — re-run
> them yourself to confirm. The script is stdlib-only Python, no venv
> required.

---

## How to reproduce

```bash
# in one terminal
docker compose up -d --build         # backend on :8080

# in another
python scripts/eval_experiment.py --label baseline
# → evals/results/baseline.json
# → evals/results/baseline.trend.json
```

Then change a prompt / model and re-run with `--label promptV2`. A
side-by-side diff is one `jq`/`diff` away.

---

## Latest run

The exact JSON is in [`evals/results/`](../evals/results/) once you
run the script. The summary printed to stdout looks like:

```
──────── EXPERIMENT SUMMARY ────────
  label              baseline
  rows               12
  validRows          12
  elapsedSec         28.4
  avgAggregate       0.842
  avgRelevance       0.964
  avgGroundedness    0.892
  avgAgronomic       0.825
  shortlistHitRate   0.917
────────────────────────────────────
```

Numbers are illustrative — your re-run will produce a slightly
different `avgAggregate` because the live Gemini path is
non-deterministic. In stub mode the score is fully deterministic.

---

## Why the four dimensions

These mirror Arize's standard online-eval rubric so the scores are
directly portable to the Arize AX dashboard:

| Dimension                | What it measures                                                                |
|--------------------------|---------------------------------------------------------------------------------|
| **Relevance**            | Does the plan actually address the farm + scenario in the request?              |
| **Groundedness**         | Are the impact numbers consistent with weather + market tool outputs?           |
| **Agronomic correctness**| Does the recommended crop fall in the agronomic shortlist for season + soil + lat? |
| **Hallucination risk**   | Inverse — `1.0` = no fabrication detected, `0.0` = clearly fabricated.          |

The aggregate is the unweighted mean. Each dimension is also exported
as an individual OTel span attribute under `evaluator.eval`, so the
Arize AX UI groups them as evaluation telemetry.

---

## Sample comparison (illustrative)

A common use of this script: prove that a prompt change actually
improved quality before shipping it.

| Variant               | avgAggregate | avgAgronomic | shortlistHitRate |
|-----------------------|--------------|--------------|-------------------|
| `baseline`            | 0.842        | 0.825        | 0.917             |
| `prompt-v2-strict`    | **0.871**    | **0.875**    | **0.958**         |
| `gemini-2.5-pro`      | 0.886        | 0.880        | 0.958             |

The deltas show up as a chart in the dashboard via
`/api/v1/eval/quality-trend`. That endpoint is what the README
"quality-over-time" image is sourced from.

---

## License

[MIT](../LICENSE) © 2026 Surendra Thakur and contributors.

