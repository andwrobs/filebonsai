package com.filebonsai.storage;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.Semaphore;

/** Local immutable-object adapter. Every path component is server-generated. */
public final class LocalObjectStorage implements PublishedObjectStorage {
    private static final int BUFFER_SIZE = 64 * 1024;

    private final Path root;
    private final long maximumBytes;
    private final long maximumNanos;
    private final Semaphore concurrentWrites;

    public LocalObjectStorage(Path configuredRoot, long maximumBytes) throws IOException {
        this(configuredRoot, maximumBytes, Duration.ofMinutes(15), 4);
    }

    public LocalObjectStorage(
            Path configuredRoot, long maximumBytes, Duration maximumDuration, int maximumConcurrentWrites)
            throws IOException {
        if (maximumBytes < 0) {
            throw new IllegalArgumentException("Maximum upload size must be nonnegative");
        }
        if (maximumDuration.isZero() || maximumDuration.isNegative() || maximumConcurrentWrites < 1) {
            throw new IllegalArgumentException("Upload duration and concurrency limits must be positive");
        }
        Path absolute = configuredRoot.toAbsolutePath().normalize();
        Files.createDirectories(absolute);
        if (Files.isSymbolicLink(absolute)) {
            throw new IOException("Local storage root cannot be a symbolic link");
        }
        this.root = absolute.toRealPath(LinkOption.NOFOLLOW_LINKS);
        this.maximumBytes = maximumBytes;
        this.maximumNanos = maximumDuration.toNanos();
        this.concurrentWrites = new Semaphore(maximumConcurrentWrites);
        ensureDirectory(directory("attempts"));
        ensureDirectory(directory("objects"));
    }

    public StoredBody writeAttempt(
            UUID workspaceId, UUID objectId, UUID attemptId, InputStream source, long expectedBytes)
            throws IOException, BodyTooLargeException {
        if (expectedBytes > maximumBytes) {
            throw new BodyTooLargeException();
        }
        if (!concurrentWrites.tryAcquire()) {
            throw new StorageBusyException();
        }
        String key = attemptKey(workspaceId, objectId, attemptId);
        Path target;
        try {
            target = path(key);
            ensureDirectory(target.getParent());
        } catch (IOException | RuntimeException exception) {
            concurrentWrites.release();
            throw exception;
        }
        MessageDigest digest = sha256();
        long count = 0;
        long started = System.nanoTime();
        try {
            try (OutputStream output =
                            Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                    DigestInputStream input = new DigestInputStream(source, digest)) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (System.nanoTime() - started > maximumNanos) {
                        throw new TransferTimedOutException();
                    }
                    count = Math.addExact(count, read);
                    if (count > expectedBytes || count > maximumBytes) {
                        throw new BodyTooLargeException();
                    }
                    output.write(buffer, 0, read);
                }
            }
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(target);
            throw exception;
        } finally {
            concurrentWrites.release();
        }
        return new StoredBody(key, count, digest.digest());
    }

    public String attemptKey(UUID workspaceId, UUID objectId, UUID attemptId) {
        return "attempts/" + workspaceId + "/" + objectId + "/" + attemptId + ".part";
    }

    public String finalKey(UUID workspaceId, UUID objectId) {
        return "objects/" + workspaceId + "/" + objectId;
    }

    public long maximumBytes() {
        return maximumBytes;
    }

    public void promote(String temporaryKey, String finalKey) throws IOException {
        Path source = regularFile(temporaryKey);
        Path target = path(finalKey);
        ensureDirectory(target.getParent());
        // A same-filesystem hard link publishes the complete inode atomically and CREATE_NEW
        // semantics guarantee that an immutable final object is never replaced.
        Files.createLink(target, source);
        Files.delete(source);
    }

    @Override
    public void promote(String temporaryKey, String finalKey, long expectedSize, byte[] expectedSha256)
            throws IOException {
        promote(temporaryKey, finalKey);
    }

    public boolean verifies(String key, long expectedSize, byte[] expectedDigest) throws IOException {
        if (!Files.exists(path(key), LinkOption.NOFOLLOW_LINKS)) {
            return false;
        }
        Path file;
        try {
            file = regularFile(key);
        } catch (java.nio.file.NoSuchFileException exception) {
            return false;
        }
        if (Files.size(file) != expectedSize) {
            return false;
        }
        MessageDigest digest = sha256();
        try (InputStream input = new DigestInputStream(Files.newInputStream(file), digest)) {
            input.transferTo(OutputStream.nullOutputStream());
        }
        return MessageDigest.isEqual(expectedDigest, digest.digest());
    }

    public InputStream open(String key) throws IOException {
        return Files.newInputStream(regularFile(key), StandardOpenOption.READ);
    }

    public void deleteIfExists(String key) throws IOException {
        if (key != null) {
            Path candidate = path(key);
            verifyParents(candidate.getParent());
            if (Files.isSymbolicLink(candidate)) {
                throw new IOException("Storage cleanup refuses symbolic links");
            }
            Files.deleteIfExists(candidate);
        }
    }

    public static String hex(byte[] digest) {
        return digest == null ? null : HexFormat.of().formatHex(digest);
    }

    private Path regularFile(String key) throws IOException {
        Path candidate = path(key);
        verifyParents(candidate.getParent());
        if (Files.isSymbolicLink(candidate) || !Files.isRegularFile(candidate, LinkOption.NOFOLLOW_LINKS)) {
            throw new java.nio.file.NoSuchFileException(candidate.toString());
        }
        return candidate;
    }

    private Path path(String key) throws IOException {
        Path relative = Path.of(key);
        if (relative.isAbsolute() || relative.normalize().startsWith("..")) {
            throw new IOException("Invalid internal storage key");
        }
        Path candidate = root.resolve(relative).normalize();
        if (!candidate.startsWith(root)) {
            throw new IOException("Internal storage key escapes the configured root");
        }
        return candidate;
    }

    private Path directory(String name) {
        return root.resolve(name);
    }

    private void ensureDirectory(Path directory) throws IOException {
        if (!directory.startsWith(root)) {
            throw new IOException("Storage directory escapes the configured root");
        }
        Path current = root;
        for (Path component : root.relativize(directory)) {
            current = current.resolve(component);
            if (Files.exists(current, LinkOption.NOFOLLOW_LINKS)) {
                if (Files.isSymbolicLink(current) || !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                    throw new IOException("Storage path contains a non-directory or symbolic link");
                }
            } else {
                Files.createDirectory(current);
            }
        }
    }

    private void verifyParents(Path directory) throws IOException {
        Path current = root;
        for (Path component : root.relativize(directory)) {
            current = current.resolve(component);
            if (Files.isSymbolicLink(current) || !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Storage path contains a non-directory or symbolic link");
            }
        }
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record StoredBody(String key, long size, byte[] sha256) {}

    public static final class BodyTooLargeException extends IOException {}

    public static final class StorageBusyException extends IOException {}

    public static final class TransferTimedOutException extends IOException {}
}
