package com.Hackathon.AgriGuardian.AI.config;

import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.health.autoconfigure.contributor.ConditionalOnEnabledHealthIndicator;
import org.springframework.boot.health.contributor.AbstractHealthIndicator;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.mongodb.autoconfigure.health.MongoHealthContributorAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.core.MongoTemplate;

/**
 * Atlas-friendly Mongo health probe.
 *
 * <p>Spring Boot's default {@code MongoHealthIndicator} runs
 * {@code db.runCommand({ hello: 1 })} against the {@code local} database
 * to confirm cluster reachability. That works on a self-hosted Mongo,
 * but <b>MongoDB Atlas blocks every non-system user — even
 * {@code atlasAdmin} — from {@code local}</b>, so the default probe
 * comes back as:</p>
 *
 * <pre>
 * (Unauthorized) not authorized on local to execute command { hello: 1 }
 * </pre>
 *
 * <p>The application is fine — only the health <i>probe</i> is broken.
 * We replace it with a benign {@code { ping: 1 }} against the
 * application's own database, which any data-plane user is allowed
 * to run. Same liveness signal, no false negative.</p>
 */
@Configuration
@AutoConfigureBefore(MongoHealthContributorAutoConfiguration.class)
public class MongoHealthConfig {

    /**
     * {@code @Primary} so this bean wins over any {@code mongoHealthIndicator}
     * autoconfigured by {@link MongoHealthContributorAutoConfiguration}.
     * The indicator is conditional on the standard
     * {@code management.health.mongo.enabled} flag (default true) so
     * operators can still turn the probe off entirely if they want.
     */
    @Bean("mongoHealthIndicator")
    @Primary
    @ConditionalOnEnabledHealthIndicator("mongo")
    public AbstractHealthIndicator atlasMongoHealthIndicator(MongoTemplate template) {
        return new AbstractHealthIndicator("Mongo health check failed") {
            @Override
            protected void doHealthCheck(Health.Builder builder) {
                MongoDatabase db = template.getDb();
                Document res = db.runCommand(new Document("ping", 1));
                builder.up()
                       .withDetail("database", db.getName())
                       .withDetail("ping", res.get("ok"));
            }
        };
    }
}

