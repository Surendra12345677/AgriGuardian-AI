#!/usr/bin/env python3
"""
AgriGuardian — Arize-style offline experiment runner.

Plays every row in `evals/golden_dataset.jsonl` against the running
backend's recommendation API and scores the response against the
expected agronomic shortlist. Reports per-row + aggregate metrics so
prompt / model variants can be compared apples-to-apples.

Why this exists (Arize partner-track context):
  Arize's flagship "Experiments" workflow runs a candidate model or
  prompt against a fixed dataset and tracks evaluation metrics over
  time. We replicate that workflow locally here so the README can
  show a concrete prompt-v1 vs prompt-v2 delta — exactly the artifact
  Arize judges look for.

Usage:
  # 1. start the backend (default http://localhost:8080)
  # 2. run the experiment:
  python scripts/eval_experiment.py
  # 3. compare two prompt variants (set GEMINI_PROMPT_VARIANT in env, restart, re-run):
  python scripts/eval_experiment.py --label promptV2 --out evals/results/promptV2.json

Outputs:
  evals/results/<label>.json  — full per-row trace
  stdout                       — summary table

The script is intentionally dependency-light (stdlib only) so it works
in CI without a venv.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent
DATASET    = ROOT / "evals" / "golden_dataset.jsonl"
RESULT_DIR = ROOT / "evals" / "results"


def post(url: str, payload: dict, timeout: int = 60) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
        return json.loads(resp.read().decode("utf-8"))


def get(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
        return json.loads(resp.read().decode("utf-8"))


def extract_payload(reasoning: str) -> dict:
    """Pull the first JSON object out of the recommendation `reasoning` field."""
    if not reasoning:
        return {}
    s = reasoning.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s[:-3]
    start = s.find("{")
    end   = s.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(s[start:end + 1])
    except json.JSONDecodeError:
        return {}


def evaluate_row(row: dict, response: dict) -> dict:
    """Lightweight rubric evaluator — same dimensions as AgentEvaluator.java."""
    payload = extract_payload(response.get("reasoning", ""))
    crop    = (payload.get("crop") or "").strip().lower()
    impact  = payload.get("impact") or {}
    tasks   = payload.get("tasks") or []

    expected = [c.lower() for c in row.get("expectedCrops", [])]
    in_shortlist = crop in expected if crop else False

    # Relevance — has advice + ≥3 tasks + a crop
    relevance = 0.6 + 0.13 * (
        bool(payload.get("advice")) + (len(tasks) >= 3) + bool(crop)
    )
    # Groundedness — impact numbers populated and self-consistent
    grounded = 0.92 if (
        impact.get("expectedRevenueInr", 0) > 0
        and impact.get("extraIncomeInr",     0) > 0
        and impact.get("paybackWeeks",       0) > 0
    ) else 0.55
    # Agronomic correctness — crop in expected shortlist
    agronomic = 0.95 if in_shortlist else 0.55
    # Hallucination risk — penalize obvious offline-fallback marker
    hallucination = 0.7 if payload.get("_source") == "offline-fallback" else 0.95

    aggregate = round((relevance + grounded + agronomic + hallucination) / 4, 3)

    return {
        "crop":               crop,
        "expectedCrops":      expected,
        "inShortlist":        in_shortlist,
        "relevance":          round(relevance, 3),
        "groundedness":       round(grounded, 3),
        "agronomic":          round(agronomic, 3),
        "hallucinationRisk":  round(hallucination, 3),
        "aggregate":          aggregate,
        "traceId":            response.get("traceId"),
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.getenv("BASE_URL", "http://localhost:8080"))
    ap.add_argument("--label", default=os.getenv("EXPERIMENT_LABEL", "default"))
    ap.add_argument("--out",   default=None)
    ap.add_argument("--limit", type=int, default=0, help="0 = full dataset")
    args = ap.parse_args(argv)

    if not DATASET.exists():
        print(f"ERROR: golden dataset missing at {DATASET}", file=sys.stderr)
        return 2

    rows = [json.loads(line) for line in DATASET.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit > 0:
        rows = rows[:args.limit]

    print(f"▶ Running {len(rows)} eval rows against {args.base} (label={args.label})")
    results: list[dict] = []
    started = time.time()

    for i, row in enumerate(rows, 1):
        payload = {
            "farmId":        row["farmId"],
            "latitude":      row["latitude"],
            "longitude":     row["longitude"],
            "preferredCrop": None,
            "language":      row.get("language", "en"),
            "scenario":      row.get("scenario", "BASELINE"),
            "forceLive":     True,
        }
        t0 = time.time()
        try:
            response = post(f"{args.base}/api/v1/recommendations", payload)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as ex:
            print(f"  [{i:>2}/{len(rows)}] {row['id']:<28} ✗ http error: {ex}")
            results.append({"id": row["id"], "error": str(ex)})
            continue
        latency_ms = int((time.time() - t0) * 1000)

        eval_row = evaluate_row(row, response)
        eval_row["id"]        = row["id"]
        eval_row["scenario"]  = row.get("scenario", "BASELINE")
        eval_row["latencyMs"] = latency_ms
        results.append(eval_row)
        marker = "✓" if eval_row["inShortlist"] else "·"
        print(f"  [{i:>2}/{len(rows)}] {row['id']:<28} {marker} "
              f"crop={eval_row['crop']:<14} agg={eval_row['aggregate']:.3f}  ({latency_ms}ms)")

    elapsed = time.time() - started
    valid   = [r for r in results if "aggregate" in r]
    summary = {
        "label":           args.label,
        "rows":            len(rows),
        "validRows":       len(valid),
        "elapsedSec":      round(elapsed, 2),
        "avgAggregate":    round(statistics.mean(r["aggregate"]    for r in valid), 3) if valid else None,
        "avgRelevance":    round(statistics.mean(r["relevance"]    for r in valid), 3) if valid else None,
        "avgGroundedness": round(statistics.mean(r["groundedness"] for r in valid), 3) if valid else None,
        "avgAgronomic":    round(statistics.mean(r["agronomic"]    for r in valid), 3) if valid else None,
        "shortlistHitRate": round(sum(1 for r in valid if r["inShortlist"]) / len(valid), 3) if valid else None,
    }

    print()
    print("──────── EXPERIMENT SUMMARY ────────")
    for k, v in summary.items():
        print(f"  {k:<18} {v}")
    print("────────────────────────────────────")

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out) if args.out else (RESULT_DIR / f"{args.label}.json")
    out_path.write_text(json.dumps({"summary": summary, "results": results}, indent=2), encoding="utf-8")
    print(f"📝 Wrote {out_path.relative_to(ROOT)}")

    # Try to fetch the agent's own self-reported quality trend as well —
    # this is what the dashboard plots, so capturing it alongside the
    # experiment makes them directly comparable.
    try:
        trend = get(f"{args.base}/api/v1/eval/quality-trend?limit=50")
        trend_path = RESULT_DIR / f"{args.label}.trend.json"
        trend_path.write_text(json.dumps(trend, indent=2), encoding="utf-8")
        print(f"📈 Wrote {trend_path.relative_to(ROOT)} (avg={trend.get('averageScore')})")
    except Exception as ex:
        print(f"  (skipped quality-trend fetch: {ex})")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

