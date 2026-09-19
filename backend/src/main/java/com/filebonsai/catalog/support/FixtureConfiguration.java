package com.filebonsai.catalog.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.CatalogScopeProvider;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("fixture")
public class FixtureConfiguration {
    @Bean
    FixtureCatalog fixtureCatalog(
            ObjectMapper mapper,
            @Value("${filebonsai.fixture.cursor-secret:}") String cursorSecret,
            @Value("${filebonsai.fixture.fixed-time:}") String fixedTime) {
        return new FixtureCatalog(
                new CatalogCursor(mapper, cursorKey(cursorSecret)),
                fixedTime.isBlank() ? Clock.systemUTC() : Clock.fixed(Instant.parse(fixedTime), ZoneOffset.UTC));
    }

    @Bean
    CatalogScopeProvider catalogScopeProvider() {
        CatalogScope scope = new CatalogScope(FixtureCatalog.PRINCIPAL, FixtureCatalog.WORKSPACE);
        return () -> scope;
    }

    private byte[] cursorKey(String cursorSecret) {
        if (cursorSecret.isBlank()) {
            byte[] key = new byte[32];
            new SecureRandom().nextBytes(key);
            return key;
        }
        try {
            return MessageDigest.getInstance("SHA-256").digest(cursorSecret.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
