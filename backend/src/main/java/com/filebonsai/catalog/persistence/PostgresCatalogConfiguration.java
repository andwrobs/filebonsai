package com.filebonsai.catalog.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.application.CatalogCursor;
import java.util.Base64;
import org.jooq.DSLContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("postgres")
public class PostgresCatalogConfiguration {
    @Bean
    PostgresCatalog postgresCatalog(
            DSLContext database,
            ObjectMapper mapper,
            @Value("${filebonsai.catalog.cursor-secret-base64}") String encodedCursorSecret) {
        byte[] secret = Base64.getDecoder().decode(encodedCursorSecret);
        if (secret.length < 32) {
            throw new IllegalArgumentException("Catalog cursor secret must contain at least 32 bytes");
        }
        return new PostgresCatalog(database, new CatalogCursor(mapper, secret));
    }
}
