package com.Hackathon.AgriGuardian.AI.domain.repo;

import com.Hackathon.AgriGuardian.AI.domain.model.Recommendation;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface RecommendationRepository extends MongoRepository<Recommendation, String> {
    List<Recommendation> findByFarmIdOrderByCreatedAtDesc(String farmId);
}

