package com.Hackathon.AgriGuardian.AI.domain.repo;

import com.Hackathon.AgriGuardian.AI.domain.model.Farm;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface FarmRepository extends MongoRepository<Farm, String> {
}

