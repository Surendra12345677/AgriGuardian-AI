package com.Hackathon.AgriGuardian.AI.bootstrap;

import com.Hackathon.AgriGuardian.AI.domain.model.Farm;
import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import com.Hackathon.AgriGuardian.AI.domain.repo.FarmRepository;
import com.Hackathon.AgriGuardian.AI.domain.repo.RecommendationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Seeds a deterministic demo scenario on first boot when the {@code dev}
 * profile is active. Idempotent — does nothing if data already exists.
 *
 * <p>Why this exists: judges (and our 3-min demo video) need a realistic
 * "before" state — at least one farm with history — so the agent's call to
 * Arize MCP "look up similar past runs" actually returns something
 * meaningful. Without it the demo opens to an empty database.</p>
 *
 * <p>Disabled in production via the {@code @Profile} annotation.</p>
 */
@Slf4j
@Component
@Profile("dev")
public class DemoSeedRunner implements CommandLineRunner {

    private final FarmRepository farms;
    private final RecommendationRepository recs;

    public DemoSeedRunner(FarmRepository farms, RecommendationRepository recs) {
        this.farms = farms;
        this.recs  = recs;
    }

    @Override
    public void run(String... args) {
        if (farms.count() > 0) {
            log.info("[seed] {} farms already exist — skipping demo seed.", farms.count());
            return;
        }
        log.info("[seed] empty database — inserting demo scenario.");

        Farm demoFarm = farms.save(Farm.builder()
                .farmerName("Surendra Thakur (demo)")
                .contact("+91-99999-00000")
                .latitude(18.52)
                .longitude(73.85)
                .landSizeAcres(5.0)
                .waterAvailability("MEDIUM")
                .soilType("BLACK")
                .budgetInr(150_000)
                .createdAt(Instant.now().minus(180, ChronoUnit.DAYS))
                .build());

        log.info("[seed] inserted demo farm id={}", demoFarm.getId());

        // Three historical recommendations so Arize MCP `search_traces` has
        // something realistic to surface in the demo.
        recs.saveAll(List.of(
                Recommendation.builder()
                        .farmId(demoFarm.getId())
                        .reasoning("{\"advice\":\"Sow soybean (kharif). Black soil retains moisture; "
                                + "average rainfall 880mm forecast.\",\"tasks\":[\"Plough field\","
                                + "\"Apply 25kg DAP\",\"Sow 35kg/acre\",\"First irrigation day 12\"],"
                                + "\"confidence\":0.82}")
                        .confidenceScore(0.82)
                        .traceId("seed-trace-001")
                        .createdAt(Instant.now().minus(150, ChronoUnit.DAYS))
                        .build(),
                Recommendation.builder()
                        .farmId(demoFarm.getId())
                        .reasoning("{\"advice\":\"Switch second plot to onion (rabi) for cash flow; "
                                + "market peak Feb-Mar.\",\"tasks\":[\"Prepare nursery\",\"Transplant day 30\","
                                + "\"Top-dress N day 45\"],\"confidence\":0.74}")
                        .confidenceScore(0.74)
                        .traceId("seed-trace-002")
                        .createdAt(Instant.now().minus(80, ChronoUnit.DAYS))
                        .build(),
                Recommendation.builder()
                        .farmId(demoFarm.getId())
                        .reasoning("{\"advice\":\"Skip pesticide spray this week — bee activity high. "
                                + "Use neem foliar instead.\",\"tasks\":[\"Mix 5L neem solution\","
                                + "\"Spray at sunset\"],\"confidence\":0.88}")
                        .confidenceScore(0.88)
                        .traceId("seed-trace-003")
                        .createdAt(Instant.now().minus(20, ChronoUnit.DAYS))
                        .build()
        ));

        log.info("[seed] inserted 3 historical recommendations for farm id={}", demoFarm.getId());
    }
}

