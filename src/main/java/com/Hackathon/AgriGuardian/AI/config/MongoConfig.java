package com.Hackathon.AgriGuardian.AI.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

/**
 * Explicit MongoClient wiring.
 *
 * <p>We intentionally build the {@link MongoClient} ourselves instead of
 * relying on Spring Boot's auto-configuration. We hit a stubborn bug on
 * Windows where {@code spring.data.mongodb.uri} from {@code application.yml},
 * env vars, {@code -D} system properties and {@code --program} args was all
 * silently ignored — the auto-configured client always defaulted to
 * {@code localhost:27017}. Building the client by hand from a single
 * {@code MONGODB_URI} env var (with sensible fallbacks) sidesteps the
 * problem entirely.</p>
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(AgriGuardianProperties.class)
@EnableMongoRepositories(basePackages = "com.Hackathon.AgriGuardian.AI.domain.repo")
public class MongoConfig {

    /**
     * Resolution order:
     *   1. {@code MONGODB_URI} environment variable
     *   2. {@code spring.data.mongodb.uri} property (Spring's standard key)
     *   3. localhost fallback (kept for tests / docker compose)
     */
    @Value("${MONGODB_URI:${spring.data.mongodb.uri:mongodb://localhost:27017/agriguardian}}")
    private String mongoUri;

    @Bean
    @Primary
    public MongoClient mongoClient() {
        ConnectionString cs = new ConnectionString(mongoUri);
        log.info("MongoConfig: connecting to host(s)={} db={}",
                cs.getHosts(), cs.getDatabase());
        return MongoClients.create(MongoClientSettings.builder()
                .applyConnectionString(cs)
                .build());
    }

    /**
     * Tells Spring Data which database to use when the URI doesn't include
     * one (e.g. raw {@code mongodb+srv://host/} without a path).
     */
    @Bean
    public String mongoDatabaseName() {
        ConnectionString cs = new ConnectionString(mongoUri);
        return cs.getDatabase() != null ? cs.getDatabase() : "agriguardian";
    }
}


