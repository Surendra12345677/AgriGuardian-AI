package com.Hackathon.AgriGuardian.AI.mcp;

import com.Hackathon.AgriGuardian.AI.config.AgriGuardianProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Wires the Arize MCP client — hackathon partner-track integration.
 *
 * <p>Active only when {@code agriguardian.mcp.arize.enabled=true}, so the app
 * stays bootable without network access.</p>
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "agriguardian.mcp.arize.enabled", havingValue = "true")
public class ArizeMcpConfig {

    @Bean(name = "arizeMcpClient")
    public McpClient arizeMcpClient(AgriGuardianProperties properties, RestClient.Builder builder) {
        var cfg = properties.getMcp().getArize();
        log.info("Initializing Arize MCP client -> {}", cfg.getUrl());
        RestClient.Builder authed = builder.defaultHeaders(h -> {
            if (cfg.getApiKey()  != null && !cfg.getApiKey().isBlank())  h.set("api_key",  cfg.getApiKey());
            if (cfg.getSpaceId() != null && !cfg.getSpaceId().isBlank()) h.set("space_id", cfg.getSpaceId());
        });
        McpClient client = new McpClient(cfg.getUrl(), "arize-mcp", authed);
        try {
            client.initialize();
            log.info("Arize MCP handshake complete");
        } catch (McpClient.McpException ex) {
            log.warn("Arize MCP handshake failed at startup: {}", ex.getMessage());
        }
        return client;
    }
}

