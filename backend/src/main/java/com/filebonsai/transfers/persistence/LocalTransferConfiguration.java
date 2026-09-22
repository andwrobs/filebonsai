package com.filebonsai.transfers.persistence;

import com.filebonsai.storage.LocalObjectStorage;
import com.filebonsai.storage.PublishedObjectStorage;
import com.filebonsai.storage.R2Gateway;
import com.filebonsai.storage.R2ObjectStorage;
import com.filebonsai.storage.S3R2Gateway;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.jooq.DSLContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

@Configuration
@Profile("postgres")
@EnableScheduling
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
    @Primary
    @ConditionalOnProperty(name = "filebonsai.storage.provider", havingValue = "local", matchIfMissing = true)
    PublishedObjectStorage localPublishedStorage(LocalObjectStorage staging) {
        return staging;
    }

    @Bean
    @ConditionalOnProperty(name = "filebonsai.storage.provider", havingValue = "r2")
    S3Client r2Client(
            @Value("${filebonsai.r2.account-id}") String accountId,
            @Value("${filebonsai.r2.jurisdiction:default}") String jurisdiction,
            @Value("${filebonsai.r2.access-key-id-file}") Path accessKeyFile,
            @Value("${filebonsai.r2.secret-access-key-file}") Path secretKeyFile,
            @Value("${filebonsai.r2.api-call-timeout:5m}") Duration apiCallTimeout,
            @Value("${filebonsai.transfers.maximum-concurrent-writes:4}") int maximumConcurrentTransfers)
            throws IOException {
        if (!accountId.matches("[a-fA-F0-9]{32}")) {
            throw new IllegalArgumentException("R2 account ID must be a 32-character hexadecimal value");
        }
        String suffix =
                switch (jurisdiction) {
                    case "default" -> "";
                    case "eu", "us", "fedramp" -> "." + jurisdiction;
                    default -> throw new IllegalArgumentException("Unsupported R2 jurisdiction");
                };
        String accessKeyId = Files.readString(accessKeyFile).trim();
        String secretAccessKey = Files.readString(secretKeyFile).trim();
        if (accessKeyId.isEmpty() || secretAccessKey.isEmpty()) {
            throw new IllegalArgumentException("R2 credential files must contain nonempty values");
        }
        if (apiCallTimeout.isNegative() || apiCallTimeout.isZero() || maximumConcurrentTransfers < 1) {
            throw new IllegalArgumentException("R2 request limits must be positive");
        }
        return S3Client.builder()
                .endpointOverride(URI.create("https://" + accountId + suffix + ".r2.cloudflarestorage.com"))
                .region(Region.of("auto"))
                .credentialsProvider(
                        StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .chunkedEncodingEnabled(false)
                        .build())
                .overrideConfiguration(configuration -> configuration.apiCallTimeout(apiCallTimeout))
                .httpClientBuilder(ApacheHttpClient.builder()
                        .socketTimeout(apiCallTimeout)
                        .connectionTimeout(Duration.ofSeconds(10))
                        .maxConnections(maximumConcurrentTransfers * 2 + 2))
                .build();
    }

    @Bean
    @ConditionalOnProperty(name = "filebonsai.storage.provider", havingValue = "r2")
    R2Gateway r2Gateway(S3Client client, @Value("${filebonsai.r2.bucket}") String bucket) {
        if (!bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")) {
            throw new IllegalArgumentException("R2 bucket name is invalid");
        }
        return new S3R2Gateway(client, bucket);
    }

    @Bean
    @Primary
    @ConditionalOnProperty(name = "filebonsai.storage.provider", havingValue = "r2")
    PublishedObjectStorage r2PublishedStorage(
            DSLContext database,
            LocalObjectStorage staging,
            R2Gateway gateway,
            @Value("${filebonsai.transfers.maximum-duration:15m}") Duration maximumDuration,
            @Value("${filebonsai.transfers.maximum-concurrent-writes:4}") int maximumConcurrentPromotions) {
        return new R2ObjectStorage(database, staging, gateway, maximumDuration, maximumConcurrentPromotions);
    }

    @Bean
    PostgresLocalTransfers postgresLocalTransfers(
            DSLContext database,
            LocalObjectStorage staging,
            PublishedObjectStorage published,
            @Value("${filebonsai.transfers.expiry:24h}") Duration expiry) {
        if (expiry.isZero() || expiry.isNegative()) {
            throw new IllegalArgumentException("Upload expiry must be positive");
        }
        return new PostgresLocalTransfers(database, staging, published, expiry);
    }

    @Bean
    @ConditionalOnProperty(name = "filebonsai.storage.provider", havingValue = "r2")
    R2TransferRecovery r2TransferRecovery(
            PostgresLocalTransfers transfers,
            @Value("${filebonsai.r2.recovery-idle:30m}") Duration recoveryIdle,
            @Value("${filebonsai.transfers.maximum-duration:15m}") Duration maximumDuration) {
        Duration safeIdle = maximumDuration.multipliedBy(2);
        return new R2TransferRecovery(transfers, recoveryIdle.compareTo(safeIdle) < 0 ? safeIdle : recoveryIdle);
    }

    @Bean
    ApplicationRunner transferRecovery(PostgresLocalTransfers transfers, PublishedObjectStorage published) {
        return arguments -> {
            transfers.reconcile();
            if (published instanceof R2ObjectStorage r2) {
                r2.scheduledOrphanCleanup();
            }
        };
    }
}
