package com.Hackathon.AgriGuardian.AI.mcp;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Registers a {@link McpClient} bean for the <strong>MongoDB MCP server</strong>
 * — the partner integration required by the hackathon track.
 *
 * <p>Only active when {@code agriguardian.mcp.mongodb.enabled=true}, so the app
 * remains bootable in pure-stub mode (e.g. on a laptop without docker).</p>
 *
 * <p>The MongoDB MCP server runs as a Docker sidecar — see {@code docker-compose.yml}.
 * It exposes tools like {@code find}, {@code aggregate}, {@code update-many},
 * {@code insert-one}, {@code list-collections}.</p>
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "agriguardian.mcp.mongodb.enabled", havingValue = "true")
public class MongoMcpConfig {

    @Bean(name = "mongoMcpClient")
    public McpClient mongoMcpClient(AgriGuardianProperties properties,
                                    RestClient.Builder builder) {
        var cfg = properties.getMcp().getMongodb();
        log.info("Initializing MongoDB MCP client → {}", cfg.getUrl());
        McpClient client = new McpClient(cfg.getUrl(), "mongodb-mcp", builder);
        try {
            client.initialize();
            log.info("MongoDB MCP handshake complete; tools available: {}",
                    client.listTools());
        } catch (McpClient.McpException ex) {
            // Don't crash the app — log and let individual tool calls fail
            // through their @CircuitBreaker / fallback paths.
            log.warn("MongoDB MCP handshake failed at startup: {}", ex.getMessage());
        }
        return client;
    }
}

