package com.filebonsai.storage;

import com.filebonsai.storage.application.StorageCapabilities;
import com.filebonsai.storage.application.StorageConnection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("postgres")
public class StorageConnectionConfiguration {
    @Bean
    StorageConnection storageConnection(
            @Value("${filebonsai.storage.provider:local}") String provider,
            @Value("${filebonsai.storage.display-name:}") String displayName) {
        return StorageConnection.configured(provider, displayName);
    }

    // Built at startup so an unmapped provider fails the boot, not every Storage request.
    @Bean
    StorageCapabilities storageCapabilities(StorageConnection connection) {
        return StorageCapabilities.of(connection);
    }
}
