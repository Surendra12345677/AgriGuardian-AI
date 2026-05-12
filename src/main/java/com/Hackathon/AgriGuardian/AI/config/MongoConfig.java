package com.Hackathon.AgriGuardian.AI.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

/**
 * Mongo wiring placeholder — Spring Boot auto-config does the heavy lifting.
 * We only enable repository scanning in our package and turn on the typed properties.
 */
@Configuration
@EnableConfigurationProperties(AgriGuardianProperties.class)
@EnableMongoRepositories(basePackages = "com.Hackathon.AgriGuardian.AI.domain.repo")
public class MongoConfig {
}

