package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Exposes the agent's own evaluation telemetry — the "Arize self-improvement
 * loop" rendered as a JSON time series the dashboard can plot.
 *
 * <p>Each entry corresponds to one persisted {@link Recommendation} along with
 * the LLM-as-judge score produced by {@link com.Hackathon.AgriGuardian.AI.agent.AgentEvaluator}
 * and shipped as an {@code evaluator.eval} OTel span to Arize AX.</p>
 */
@RestController
@RequestMapping("/api/v1/eval")
public class EvalController {

    private final RecommendationRepository repo;

    public EvalController(RecommendationRepository repo) { this.repo = repo; }

    public record TrendPoint(
            String  recommendationId,
            String  farmId,
            String  traceId,
            Double  evalScore,
            String  judge,
            Map<String, Object> evalDetails,
            Instant createdAt
    ) {}

    public record TrendResponse(
            int           count,
            Double        averageScore,
            Double        latestScore,
            Double        firstScore,
            Double        deltaScore,
            List<TrendPoint> series
    ) {}

    /** A single bucket of the score distribution histogram. */
    public record DistributionBucket(
            String label,    // e.g. "0.80–0.90"
            double lo,
            double hi,
            int    count
    ) {}

    /**
     * Score-distribution histogram across the most-recent N evaluations.
     * This is the artifact Arize's Alyx assistant promotes as the "new baseline"
     * after evals are set up — exposing it as JSON lets the UI + judges'
     * screenshots both render the same source of truth.
     */
    public record DistributionResponse(
            int                       count,
            int                       scored,
            Double                    averageScore,
            Double                    medianScore,
            Double                    p10,
            Double                    p90,
            Double                    stddev,
            Double                    passRate,    // fraction with score ≥ 0.75
            int                       failures,    // count with score < 0.60
            List<DistributionBucket>  buckets
    ) {}

    /**
     * Returns the most-recent N recommendations ordered oldest → newest so
     * the UI can plot them as a left-to-right time series.
     *
     * @param limit  1..200 (default 20)
     */
    @GetMapping("/quality-trend")
    public TrendResponse qualityTrend(@RequestParam(defaultValue = "20") int limit) {
        if (limit < 1)   limit = 20;
        if (limit > 200) limit = 200;

        List<Recommendation> latest = repo.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit));
        List<TrendPoint> series = new ArrayList<>(latest.size());
        Collections.reverse(latest);
        double sum = 0; int n = 0;
        Double first = null, last = null;
        for (Recommendation r : latest) {
            Double score = r.getEvalScore();
            series.add(new TrendPoint(
                    r.getId(),
                    r.getFarmId(),
                    r.getTraceId(),
                    score,
                    r.getEvalJudge(),
                    r.getEvalDetails(),
                    r.getCreatedAt()
            ));
            if (score != null) {
                if (first == null) first = score;
                last = score;
                sum += score; n++;
            }
        }
        Double avg   = n == 0 ? null : sum / n;
        Double delta = (first != null && last != null) ? (last - first) : null;
        return new TrendResponse(series.size(), avg, last, first, delta, series);
    }

    /**
     * Returns the score-distribution histogram judges and Alyx use as the
     * agent-quality baseline. 10 equal buckets across [0,1].
     */
    @GetMapping("/distribution")
    public DistributionResponse distribution(@RequestParam(defaultValue = "100") int limit) {
        if (limit < 1)    limit = 100;
        if (limit > 1000) limit = 1000;

        List<Recommendation> recs = repo.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit));

        // Collect scores.
        List<Double> scores = new ArrayList<>();
        for (Recommendation r : recs) {
            if (r.getEvalScore() != null) scores.add(r.getEvalScore());
        }
        int scored = scores.size();

        // 10 buckets, [0,0.1) .. [0.9,1.0].
        int[] counts = new int[10];
        for (double s : scores) {
            int idx = (int) Math.min(9, Math.max(0, Math.floor(s * 10)));
            counts[idx]++;
        }
        List<DistributionBucket> buckets = new ArrayList<>(10);
        for (int i = 0; i < 10; i++) {
            double lo = i / 10.0;
            double hi = (i + 1) / 10.0;
            String label = String.format("%.2f–%.2f", lo, hi);
            buckets.add(new DistributionBucket(label, lo, hi, counts[i]));
        }

        Double avg = null, median = null, p10 = null, p90 = null, std = null, pass = null;
        int failures = 0;
        if (scored > 0) {
            double sum = 0;
            for (double s : scores) sum += s;
            avg = sum / scored;
            List<Double> sorted = new ArrayList<>(scores);
            Collections.sort(sorted);
            median = percentile(sorted, 0.50);
            p10    = percentile(sorted, 0.10);
            p90    = percentile(sorted, 0.90);
            double varSum = 0;
            for (double s : scores) varSum += (s - avg) * (s - avg);
            std = Math.sqrt(varSum / scored);
            int passCount = 0;
            for (double s : scores) {
                if (s >= 0.75) passCount++;
                if (s < 0.60)  failures++;
            }
            pass = (double) passCount / scored;
        }
        return new DistributionResponse(
                recs.size(), scored,
                round3(avg), round3(median), round3(p10), round3(p90),
                round3(std), round3(pass), failures,
                buckets
        );
    }

    private static Double percentile(List<Double> sorted, double p) {
        if (sorted.isEmpty()) return null;
        int idx = (int) Math.min(sorted.size() - 1, Math.max(0, Math.round(p * (sorted.size() - 1))));
        return sorted.get(idx);
    }

    private static Double round3(Double v) {
        return v == null ? null : Math.round(v * 1000.0) / 1000.0;
    }

    /** Convenience: collapse to just the latest aggregate score. */
    @GetMapping("/latest")
    public Map<String, Object> latest() {
        List<Recommendation> latest = repo.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 1));
        Map<String, Object> out = new LinkedHashMap<>();
        if (latest.isEmpty()) {
            out.put("evalScore", null);
            return out;
        }
        Recommendation r = latest.get(0);
        out.put("recommendationId", r.getId());
        out.put("evalScore",        r.getEvalScore());
        out.put("evalDetails",      r.getEvalDetails());
        out.put("judge",            r.getEvalJudge());
        out.put("traceId",          r.getTraceId());
        out.put("createdAt",        r.getCreatedAt());
        return out;
    }
}
