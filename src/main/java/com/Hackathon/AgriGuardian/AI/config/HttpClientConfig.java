package com.Hackathon.AgriGuardian.AI.config;

import com.Hackathon.AgriGuardian.AI.agent.tool.impl.OpenMeteoClient;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

import java.util.concurrent.TimeUnit;

/**
 * Outbound-HTTP wiring:
 * <ul>
 *   <li>Shared {@link RestClient.Builder} bean (Boot 4 doesn't auto-register one).</li>
 *   <li>Declarative {@link OpenMeteoClient} created via Spring 6 HTTP Interface
 *       (the framework-native replacement for Spring Cloud OpenFeign).</li>
 *   <li>Caffeine-backed {@link CacheManager} for {@code @Cacheable("weather")}
 *       (15-minute TTL, max 1 000 entries).</li>
 * </ul>
 */
@Configuration
@EnableCaching
public class HttpClientConfig {

    @Bean
    public RestClient.Builder restClientBuilder() {
        return RestClient.builder();
    }

    @Bean
    public OpenMeteoClient openMeteoClient(RestClient.Builder builder,
                                           AgriGuardianProperties properties) {
        RestClient client = builder
                .baseUrl(properties.getWeather().getBaseUrl())
                .build();
        return HttpServiceProxyFactory
                .builderFor(RestClientAdapter.create(client))
                .build()
                .createClient(OpenMeteoClient.class);
    }

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager("weather", "marketPrice");
        mgr.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(15, TimeUnit.MINUTES)
                .maximumSize(1_000)
                .recordStats());
        return mgr;
    }
}


