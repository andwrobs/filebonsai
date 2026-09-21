package com.filebonsai.transfers.persistence;

import com.filebonsai.storage.LocalObjectStorage;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import org.jooq.DSLContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("postgres")
public class LocalTransferConfiguration {
    @Bean
    LocalObjectStorage localObjectStorage(
            @Value("${filebonsai.storage.local.root}") Path root,
            @Value("${filebonsai.transfers.maximum-bytes:134217728}") long maximumBytes,
            @Value("${filebonsai.transfers.maximum-duration:15m}") Duration maximumDuration,
            @Value("${filebonsai.transfers.maximum-concurrent-writes:4}") int maximumConcurrentWrites)
            throws IOException {
        return new LocalObjectStorage(root, maximumBytes, maximumDuration, maximumConcurrentWrites);
    }

    @Bean
    PostgresLocalTransfers postgresLocalTransfers(
            DSLContext database,
            LocalObjectStorage storage,
            @Value("${filebonsai.transfers.expiry:24h}") Duration expiry) {
        if (expiry.isZero() || expiry.isNegative()) {
            throw new IllegalArgumentException("Upload expiry must be positive");
        }
        return new PostgresLocalTransfers(database, storage, expiry);
    }

    @Bean
    ApplicationRunner transferRecovery(PostgresLocalTransfers transfers) {
        return arguments -> transfers.reconcile();
    }
}
