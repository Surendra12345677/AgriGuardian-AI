package com.Hackathon.AgriGuardian.AI.domain.repo;

import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface RecommendationRepository extends MongoRepository<Recommendation, String> {
    List<Recommendation> findByFarmIdOrderByCreatedAtDesc(String farmId);
    List<Recommendation> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Used by the Agent Feedback Loop endpoint to surface the lowest-scoring
     * recommendations as candidate regression tests. We deliberately order
     * by score ASC (worst first) instead of by date so the operator always
     * triages the actually-broken plans, not just the newest ones.
     */
    List<Recommendation> findByEvalScoreLessThanOrderByEvalScoreAsc(Double threshold, Pageable pageable);
}
