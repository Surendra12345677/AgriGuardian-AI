package com.Hackathon.AgriGuardian.AI.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Provides a shared {@link RestClient.Builder} bean for outbound HTTP calls
 * (weather, market, Gemini). Spring Boot 4 does not register one by default
 * for plain Spring MVC apps, so we define it explicitly here.
 */
@Configuration
public class HttpClientConfig {

    @Bean
    public RestClient.Builder restClientBuilder() {
        return RestClient.builder();
    }
}

