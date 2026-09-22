package com.filebonsai.storage;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/** Durable, fenced R2 publication behind the existing server-streamed upload API. */
public final class R2ObjectStorage implements PublishedObjectStorage {
    private static final Logger LOGGER = LoggerFactory.getLogger(R2ObjectStorage.class);
    private static final int PART_BYTES = 8 * 1024 * 1024;
    private static final long MAXIMUM_BYTES = 128L * 1024 * 1024;
    private static final int BUFFER_BYTES = 64 * 1024;

    private final DSLContext database;
    private final LocalObjectStorage staging;
    private final R2Gateway gateway;
    private final Semaphore concurrentPromotions;
    private final Semaphore concurrentReads;
    private final long maximumNanos;
    private final long orphanGraceMillis;

    public R2ObjectStorage(
            DSLContext database,
            LocalObjectStorage staging,
            R2Gateway gateway,
            Duration maximumDuration,
            int maximumConcurrentPromotions) {
        if (maximumDuration.isNegative() || maximumDuration.isZero() || maximumConcurrentPromotions < 1) {
            throw new IllegalArgumentException("R2 transfer limits must be positive");
        }
        this.database = database;
        this.staging = staging;
        this.gateway = gateway;
        this.maximumNanos = maximumDuration.toNanos();
        this.orphanGraceMillis = Math.max(Duration.ofMinutes(30).toMillis(), maximumDuration.toMillis() * 2);
        this.concurrentPromotions = new Semaphore(maximumConcurrentPromotions);
        this.concurrentReads = new Semaphore(maximumConcurrentPromotions);
    }

    @Override
    public String finalKey(UUID workspaceId, UUID objectId) {
        return "r2/objects/" + workspaceId + "/" + objectId;
    }

    @Override
    public long maximumBytes() {
        return MAXIMUM_BYTES;
    }

    @Override
    public boolean finishOnRecovery() {
        return true;
    }

    @Override
    public void promote(String temporaryKey, String finalKey, long expectedSize, byte[] expectedSha256)
            throws IOException {
        if (expectedSize > MAXIMUM_BYTES || expectedSize < 0 || expectedSha256 == null) {
            throw new IOException("R2 upload exceeds the supported limits");
        }
        if (!concurrentPromotions.tryAcquire()) {
            throw new IOException("R2 transfer capacity is busy");
        }
        try {
            if (verifies(finalKey, expectedSize, expectedSha256)) {
                return;
            }
            Record resumed = database.fetchOne(
                    "select id, provider_key, upload_id, state from r2_attempts where logical_key = ? "
                            + "and state in ('UPLOADING', 'COMPLETING') order by created_at desc limit 1",
                    finalKey);
            if (resumed != null && expectedSize > PART_BYTES) {
                try {
                    uploadMultipart(
                            temporaryKey,
                            resumed.get("id", UUID.class),
                            resumed.get("provider_key", String.class),
                            resumed.get("upload_id", String.class),
                            expectedSize);
                    return;
                } catch (R2Gateway.MissingUploadException exception) {
                    database.execute(
                            "update r2_attempts set state = 'RETIRED', updated_at = current_timestamp where id = ?",
                            resumed.get("id", UUID.class));
                }
            }
            UUID attemptId = UUID.randomUUID();
            String providerKey = finalKey + "/" + attemptId;
            database.execute(
                    "insert into r2_attempts (id, logical_key, provider_key, state) "
                            + "values (?, ?, ?, 'INITIATING')",
                    attemptId,
                    finalKey,
                    providerKey);
            if (expectedSize <= PART_BYTES) {
                byte[] body = readSmall(temporaryKey, expectedSize);
                gateway.put(providerKey, body);
                database.execute(
                        "update r2_attempts set state = 'VERIFYING', updated_at = current_timestamp where id = ?",
                        attemptId);
                return;
            }
            String uploadId = gateway.createMultipart(providerKey);
            database.execute(
                    "update r2_attempts set upload_id = ?, state = 'UPLOADING', "
                            + "updated_at = current_timestamp where id = ? and state = 'INITIATING'",
                    uploadId,
                    attemptId);
            uploadMultipart(temporaryKey, attemptId, providerKey, uploadId, expectedSize);
        } finally {
            concurrentPromotions.release();
        }
    }

    private void uploadMultipart(String temporaryKey, UUID attemptId, String providerKey, String uploadId, long size)
            throws IOException {
        if (uploadId == null) {
            throw new IOException("R2 multipart upload ID is missing");
        }
        long started = System.nanoTime();
        List<R2Gateway.Part> remote = gateway.listParts(providerKey, uploadId);
        List<R2Gateway.Part> complete = new ArrayList<>();
        try (InputStream source = staging.open(temporaryKey)) {
            long remaining = size;
            int number = 1;
            while (remaining > 0) {
                if (System.nanoTime() - started > maximumNanos) {
                    throw new IOException("R2 promotion timed out");
                }
                int length = (int) Math.min(PART_BYTES, remaining);
                byte[] bytes = source.readNBytes(length);
                if (bytes.length != length) {
                    throw new IOException("Staged body changed during R2 promotion");
                }
                R2Gateway.Part part = existingPart(remote, number, bytes);
                if (part == null) {
                    String etag = gateway.uploadPart(providerKey, uploadId, number, bytes);
                    part = new R2Gateway.Part(number, etag, length);
                }
                database.execute(
                        "insert into r2_parts (attempt_id, part_number, etag, size_bytes) values (?, ?, ?, ?) "
                                + "on conflict (attempt_id, part_number) do update set etag = excluded.etag, "
                                + "size_bytes = excluded.size_bytes",
                        attemptId,
                        part.number(),
                        part.etag(),
                        part.size());
                complete.add(part);
                remaining -= length;
                number++;
            }
            if (source.read() != -1) {
                throw new IOException("Staged body changed during R2 promotion");
            }
        }
        database.execute(
                "update r2_attempts set state = 'COMPLETING', updated_at = current_timestamp where id = ?", attemptId);
        gateway.completeMultipart(providerKey, uploadId, complete);
        database.execute(
                "update r2_attempts set state = 'VERIFYING', updated_at = current_timestamp where id = ?", attemptId);
    }

    private R2Gateway.Part existingPart(List<R2Gateway.Part> remote, int number, byte[] bytes) {
        String md5 = HexFormat.of().formatHex(digest("MD5", bytes));
        for (R2Gateway.Part part : remote) {
            if (part.number() == number && part.size() == bytes.length && md5.equalsIgnoreCase(unquote(part.etag()))) {
                return part;
            }
        }
        return null;
    }

    private String unquote(String etag) {
        return etag.replace("\"", "");
    }

    private byte[] readSmall(String temporaryKey, long size) throws IOException {
        try (InputStream source = staging.open(temporaryKey)) {
            byte[] body = source.readNBytes((int) size);
            if (body.length != size || source.read() != -1) {
                throw new IOException("Staged body changed during R2 promotion");
            }
            return body;
        }
    }

    @Override
    public boolean verifies(String key, long expectedSize, byte[] expectedSha256) throws IOException {
        Record chosen = database.fetchOne(
                "select a.provider_key from r2_objects o join r2_attempts a on a.id = o.attempt_id "
                        + "where o.logical_key = ? and o.size_bytes = ? and o.sha256 = ?",
                key,
                expectedSize,
                expectedSha256);
        if (chosen != null) {
            if (verifyRemote(chosen.get("provider_key", String.class), expectedSize, expectedSha256)) {
                return true;
            }
        }
        List<Record> candidates = database.fetch(
                "select id, provider_key from r2_attempts where logical_key = ? "
                        + "and state in ('INITIATING', 'COMPLETING', 'VERIFYING', 'VERIFIED') "
                        + "order by created_at desc",
                key);
        for (Record candidate : candidates) {
            String providerKey = candidate.get("provider_key", String.class);
            if (verifyRemote(providerKey, expectedSize, expectedSha256)) {
                UUID id = candidate.get("id", UUID.class);
                database.execute(
                        "update r2_attempts set state = 'VERIFIED', updated_at = current_timestamp where id = ?", id);
                pinVerified(key, id, expectedSize, expectedSha256);
                Record pinned = database.fetchOne(
                        "select a.provider_key from r2_objects o join r2_attempts a on a.id = o.attempt_id "
                                + "where o.logical_key = ? and o.size_bytes = ? and o.sha256 = ?",
                        key,
                        expectedSize,
                        expectedSha256);
                return pinned != null
                        && verifyRemote(pinned.get("provider_key", String.class), expectedSize, expectedSha256);
            }
        }
        return false;
    }

    private void pinVerified(String key, UUID attemptId, long size, byte[] sha256) {
        database.transaction(configuration -> {
            DSLContext transaction = org.jooq.impl.DSL.using(configuration);
            Record session =
                    transaction.fetchOne("select state from upload_sessions where storage_key = ? for update", key);
            if (session == null || "AVAILABLE".equals(session.get("state", String.class))) {
                return;
            }
            transaction.execute(
                    "insert into r2_objects (logical_key, attempt_id, size_bytes, sha256) values (?, ?, ?, ?) "
                            + "on conflict (logical_key) do update set attempt_id = excluded.attempt_id, "
                            + "size_bytes = excluded.size_bytes, sha256 = excluded.sha256",
                    key,
                    attemptId,
                    size,
                    sha256);
        });
    }

    private boolean verifyRemote(String providerKey, long expectedSize, byte[] expectedSha256) throws IOException {
        if (!concurrentReads.tryAcquire()) {
            throw new IOException("R2 read capacity is busy");
        }
        try {
            Long size = gateway.size(providerKey);
            if (size == null || size != expectedSize) {
                return false;
            }
            MessageDigest digest = messageDigest("SHA-256");
            long count = 0;
            long started = System.nanoTime();
            try (InputStream input = gateway.open(providerKey)) {
                byte[] buffer = new byte[BUFFER_BYTES];
                while (true) {
                    if (System.nanoTime() - started > maximumNanos) {
                        throw new IOException("R2 verification timed out");
                    }
                    int read = input.read(buffer);
                    if (System.nanoTime() - started > maximumNanos) {
                        throw new IOException("R2 verification timed out");
                    }
                    if (read == -1) {
                        break;
                    }
                    count += read;
                    if (count > expectedSize) {
                        return false;
                    }
                    digest.update(buffer, 0, read);
                }
            }
            return count == expectedSize && MessageDigest.isEqual(expectedSha256, digest.digest());
        } finally {
            concurrentReads.release();
        }
    }

    @Override
    public InputStream open(String key) throws IOException {
        Record chosen = database.fetchOne(
                "select a.provider_key, o.size_bytes from r2_objects o "
                        + "join r2_attempts a on a.id = o.attempt_id "
                        + "where o.logical_key = ?",
                key);
        if (chosen == null) {
            throw new IOException("R2 object is not published");
        }
        if (!concurrentReads.tryAcquire()) {
            throw new IOException("R2 read capacity is busy");
        }
        try {
            InputStream remote = gateway.open(chosen.get("provider_key", String.class));
            return new BoundedDownload(remote, chosen.get("size_bytes", Long.class));
        } catch (IOException | RuntimeException exception) {
            concurrentReads.release();
            throw exception;
        }
    }

    public void reconcileOrphans() throws IOException {
        List<Record> retired = database.fetch(
                "select a.id, a.provider_key from r2_attempts a "
                        + "where a.created_at < current_timestamp - (? * interval '1 millisecond') "
                        + "and not exists (select 1 from r2_objects o where o.attempt_id = a.id) "
                        + "and exists (select 1 from upload_sessions u where u.storage_key = a.logical_key "
                        + "and u.state in ('AVAILABLE', 'FAILED', 'CANCELLED', 'EXPIRED'))",
                orphanGraceMillis);
        for (Record attempt : retired) {
            UUID id = attempt.get("id", UUID.class);
            String key = attempt.get("provider_key", String.class);
            for (R2Gateway.Upload upload : gateway.listMultipartUploads(key)) {
                if (key.equals(upload.key())) {
                    gateway.abortMultipart(key, upload.id());
                }
            }
            if (gateway.size(key) != null) {
                gateway.delete(key);
            }
            database.execute(
                    "update r2_attempts set state = 'RETIRED', updated_at = current_timestamp where id = ?", id);
        }
    }

    @Scheduled(fixedDelayString = "${filebonsai.r2.cleanup-interval:1h}")
    public void scheduledOrphanCleanup() {
        try {
            reconcileOrphans();
        } catch (IOException exception) {
            LOGGER.warn("R2 orphan cleanup deferred; it will retry");
        }
    }

    private byte[] digest(String algorithm, byte[] body) {
        return messageDigest(algorithm).digest(body);
    }

    private MessageDigest messageDigest(String algorithm) {
        try {
            return MessageDigest.getInstance(algorithm);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Required digest is unavailable", exception);
        }
    }

    private final class BoundedDownload extends FilterInputStream {
        private final long expectedSize;
        private final long started = System.nanoTime();
        private long count;
        private boolean closed;

        private BoundedDownload(InputStream remote, long expectedSize) {
            super(remote);
            this.expectedSize = expectedSize;
        }

        @Override
        public int read() throws IOException {
            checkTime();
            int next = in.read();
            checkTime();
            return counted(next < 0 ? -1 : 1, next);
        }

        @Override
        public int read(byte[] target, int offset, int length) throws IOException {
            checkTime();
            int read = in.read(target, offset, length);
            checkTime();
            counted(read, read);
            return read;
        }

        @Override
        public long skip(long requested) throws IOException {
            long remaining = Math.max(0, requested);
            byte[] buffer = new byte[BUFFER_BYTES];
            while (remaining > 0) {
                int read = read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read <= 0) {
                    break;
                }
                remaining -= read;
            }
            return Math.max(0, requested) - remaining;
        }

        @Override
        public boolean markSupported() {
            return false;
        }

        @Override
        public synchronized void reset() throws IOException {
            throw new IOException("R2 download does not support reset");
        }

        private int counted(int bytes, int result) throws IOException {
            if (bytes < 0) {
                if (count != expectedSize) {
                    throw new IOException("R2 download ended before its verified size");
                }
                close();
            } else {
                count += bytes;
                if (count > expectedSize) {
                    throw new IOException("R2 download exceeded its verified size");
                }
            }
            return result;
        }

        private void checkTime() throws IOException {
            if (System.nanoTime() - started > maximumNanos) {
                throw new IOException("R2 download timed out");
            }
        }

        @Override
        public void close() throws IOException {
            if (!closed) {
                closed = true;
                try {
                    super.close();
                } finally {
                    concurrentReads.release();
                }
            }
        }
    }
}
