package com.Hackathon.AgriGuardian.AI.api;

import com.Hackathon.AgriGuardian.AI.agent.AgentOrchestrator;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent Feedback Loop — turn failed traces into regression tests.
 *
 * <p>Inspired by the workflow Arize describes for their Alyx engineering
 * agent: instead of changing the prompt as soon as a result looks bad,
 * <em>save</em> the failing trace, label what category of failure it
 * belongs to and what the agent should have done, then re-run the same
 * inputs after the next prompt / model / tool change to verify the
 * regression is fixed.</p>
 *
 * <p>Endpoints:</p>
 * <ul>
 *   <li>{@code GET  /api/v1/feedback/failures} — lowest-scoring recent recommendations</li>
 *   <li>{@code POST /api/v1/feedback/{id}/annotate} — attach failure mode + expected behaviour</li>
 *   <li>{@code POST /api/v1/feedback/{id}/replay}   — re-run the stored request snapshot</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackLoopController {

    private static final Logger log = LoggerFactory.getLogger(FeedbackLoopController.class);

    /** The eval-score threshold below which a recommendation is treated as a failure. */
    private static final double DEFAULT_FAILURE_THRESHOLD = 0.60;

    /** Canonical, judge-readable failure-mode taxonomy. */
    public static final List<String> FAILURE_MODES = List.of(
            "wrong_tool_sequence",
            "missed_retrieval",
            "stale_context",
            "skipped_validation",
            "bad_answer",
            "other"
    );

    private final RecommendationRepository repo;
    private final AgentOrchestrator orchestrator;

    public FeedbackLoopController(RecommendationRepository repo, AgentOrchestrator orchestrator) {
        this.repo = repo;
        this.orchestrator = orchestrator;
    }

    /* ── DTOs ──────────────────────────────────────────────────────── */

    public record FailureView(
            String  id,
            String  farmId,
            String  traceId,
            Double  evalScore,
            String  evalJudge,
            String  failureMode,
            String  expectedBehavior,
            String  replayOfId,
            Map<String, Object> requestSnapshot,
            Instant createdAt
    ) {}

    public record FailuresResponse(
            double               threshold,
            int                  count,
            List<String>         failureModeTaxonomy,
            List<FailureView>    failures
    ) {}

    public record AnnotateRequest(
            String failureMode,
            String expectedBehavior
    ) {}

    public record ReplayResponse(
            String  originalId,
            Double  originalScore,
            String  replayId,
            Double  replayScore,
            Double  delta,
            boolean improved,
            String  failureMode,
            String  expectedBehavior
    ) {}

    /* ── GET /failures ─────────────────────────────────────────────── */

    /**
     * Returns the N worst-scoring recommendations whose eval score is
     * below {@code threshold} — the candidate set the operator should
     * triage into regression tests.
     */
    @GetMapping("/failures")
    public FailuresResponse failures(
            @RequestParam(defaultValue = "0.60") double threshold,
            @RequestParam(defaultValue = "20")   int    limit
    ) {
        if (limit < 1)   limit = 20;
        if (limit > 100) limit = 100;
        double t = (threshold <= 0 || threshold > 1) ? DEFAULT_FAILURE_THRESHOLD : threshold;
        List<Recommendation> worst =
                repo.findByEvalScoreLessThanOrderByEvalScoreAsc(t, PageRequest.of(0, limit));
        List<FailureView> out = worst.stream().map(FeedbackLoopController::toView).toList();
        return new FailuresResponse(t, out.size(), FAILURE_MODES, out);
    }

    /* ── POST /{id}/annotate ───────────────────────────────────────── */

    /**
     * Label a failed recommendation with a reusable failure mode and the
     * behaviour the agent should have produced. Stored on the record so
     * subsequent replays can be compared against the same intent.
     */
    @PostMapping("/{id}/annotate")
    public ResponseEntity<FailureView> annotate(@PathVariable String id,
                                                @RequestBody AnnotateRequest body) {
        Recommendation rec = repo.findById(id).orElse(null);
        if (rec == null) return ResponseEntity.notFound().build();

        String mode = body == null ? null : body.failureMode();
        if (mode != null && !mode.isBlank() && !FAILURE_MODES.contains(mode)) {
            // Be forgiving: store the raw label so the UI doesn't lose
            // information, but log a hint so the operator can extend the
            // taxonomy if a new category keeps showing up.
            log.info("Storing non-canonical failure mode '{}' for rec={} — consider promoting it.", mode, id);
        }
        if (mode != null)                 rec.setFailureMode(mode.isBlank() ? null : mode);
        if (body != null && body.expectedBehavior() != null) {
            String eb = body.expectedBehavior().trim();
            rec.setExpectedBehavior(eb.isEmpty() ? null : eb);
        }
        Recommendation saved = repo.save(rec);
        return ResponseEntity.ok(toView(saved));
    }

    /* ── POST /{id}/replay ─────────────────────────────────────────── */

    /**
     * Re-run the stored request snapshot for a failed recommendation.
     * The new recommendation is persisted with {@code replayOfId} set to
     * the original so the chain of regression attempts is auditable, and
     * the failure-mode / expected-behaviour annotations are carried over
     * automatically so the new score is comparable to the original on
     * exactly the same intent.
     */
    @PostMapping("/{id}/replay")
    public ResponseEntity<?> replay(@PathVariable String id) {
        Recommendation original = repo.findById(id).orElse(null);
        if (original == null) return ResponseEntity.notFound().build();
        Map<String, Object> snap = original.getRequestSnapshot();
        if (snap == null || snap.isEmpty()) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", "Original recommendation has no request snapshot — "
                    + "it was created before the feedback-loop schema upgrade. "
                    + "Run a fresh recommendation to capture one.");
            return ResponseEntity.badRequest().body(err);
        }

        Recommendation replay = orchestrator.replay(snap);

        // Thread the chain + carry forward the failure annotations so the
        // replay is comparable to the original on the same intent.
        replay.setReplayOfId(original.getId());
        if (original.getFailureMode()      != null) replay.setFailureMode(original.getFailureMode());
        if (original.getExpectedBehavior() != null) replay.setExpectedBehavior(original.getExpectedBehavior());
        Recommendation savedReplay = repo.save(replay);

        Double os = original.getEvalScore();
        Double rs = savedReplay.getEvalScore();
        Double delta = (os != null && rs != null) ? (rs - os) : null;
        boolean improved = delta != null && delta > 0;
        log.info("Replay rec={} → newRec={} originalScore={} replayScore={} delta={} mode={}",
                original.getId(), savedReplay.getId(), os, rs, delta, original.getFailureMode());

        return ResponseEntity.ok(new ReplayResponse(
                original.getId(), os,
                savedReplay.getId(), rs, delta, improved,
                original.getFailureMode(),
                original.getExpectedBehavior()
        ));
    }

    /* ── helpers ───────────────────────────────────────────────────── */

    private static FailureView toView(Recommendation r) {
        return new FailureView(
                r.getId(),
                r.getFarmId(),
                r.getTraceId(),
                r.getEvalScore(),
                r.getEvalJudge(),
                r.getFailureMode(),
                r.getExpectedBehavior(),
                r.getReplayOfId(),
                r.getRequestSnapshot(),
                r.getCreatedAt()
        );
    }
}

