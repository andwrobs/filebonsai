package com.filebonsai.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalObjectStorageTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void streamsVerifiesPromotesAndReadsServerGeneratedKeys() throws Exception {
        LocalObjectStorage storage = new LocalObjectStorage(temporaryDirectory.resolve("data"), 16);
        byte[] content = "filebonsai".getBytes(StandardCharsets.UTF_8);
        UUID workspace = UUID.randomUUID();
        UUID object = UUID.randomUUID();
        var staged = storage.writeAttempt(
                workspace, object, UUID.randomUUID(), new ByteArrayInputStream(content), content.length);

        assertThat(staged.size()).isEqualTo(content.length);
        assertThat(staged.sha256())
                .isEqualTo(MessageDigest.getInstance("SHA-256").digest(content));
        String finalKey = storage.finalKey(workspace, object);
        storage.promote(staged.key(), finalKey);
        assertThat(storage.verifies(finalKey, content.length, staged.sha256())).isTrue();
        try (var input = storage.open(finalKey)) {
            assertThat(input.readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void rejectsOversizedBodiesAndSymlinkedStorageComponents() throws Exception {
        Path root = temporaryDirectory.resolve("data");
        LocalObjectStorage storage = new LocalObjectStorage(root, 3);
        assertThatThrownBy(() -> storage.writeAttempt(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        new ByteArrayInputStream(new byte[] {1, 2, 3, 4}),
                        4))
                .isInstanceOf(LocalObjectStorage.BodyTooLargeException.class);

        Path outside = temporaryDirectory.resolve("outside");
        Files.createDirectories(outside);
        Path workspaceLink = root.resolve("attempts").resolve(UUID.randomUUID().toString());
        Files.createSymbolicLink(workspaceLink, outside);
        UUID workspace = UUID.fromString(workspaceLink.getFileName().toString());
        assertThatThrownBy(() -> storage.writeAttempt(
                        workspace, UUID.randomUUID(), UUID.randomUUID(), new ByteArrayInputStream(new byte[0]), 0))
                .isInstanceOf(java.io.IOException.class);
        assertThat(Files.list(outside)).isEmpty();
    }

    @Test
    void promotionNeverReplacesAnExistingImmutableObject() throws Exception {
        LocalObjectStorage storage = new LocalObjectStorage(temporaryDirectory.resolve("data"), 16);
        UUID workspace = UUID.randomUUID();
        UUID object = UUID.randomUUID();
        var original =
                storage.writeAttempt(workspace, object, UUID.randomUUID(), new ByteArrayInputStream(new byte[] {1}), 1);
        storage.promote(original.key(), storage.finalKey(workspace, object));
        var replacement =
                storage.writeAttempt(workspace, object, UUID.randomUUID(), new ByteArrayInputStream(new byte[] {2}), 1);

        assertThatThrownBy(() -> storage.promote(replacement.key(), storage.finalKey(workspace, object)))
                .isInstanceOf(java.nio.file.FileAlreadyExistsException.class);
        try (var input = storage.open(storage.finalKey(workspace, object))) {
            assertThat(input.readAllBytes()).containsExactly(1);
        }
    }

    @Test
    void cleanupRefusesSymlinkedParentsAndStreamingUsesBoundedReads() throws Exception {
        Path root = temporaryDirectory.resolve("data");
        LocalObjectStorage storage = new LocalObjectStorage(root, 256 * 1024);
        UUID workspace = UUID.randomUUID();
        UUID object = UUID.randomUUID();
        UUID attempt = UUID.randomUUID();
        byte[] content = new byte[200 * 1024];
        var staged =
                storage.writeAttempt(workspace, object, attempt, new BoundedReadInputStream(content), content.length);
        assertThat(staged.size()).isEqualTo(content.length);

        Path outside = temporaryDirectory.resolve("outside");
        Path outsideObject = outside.resolve(object.toString());
        Files.createDirectories(outsideObject);
        Path outsideFile = outsideObject.resolve(attempt + ".part");
        Files.write(outsideFile, new byte[] {7});
        Path workspaceDirectory = root.resolve("attempts").resolve(workspace.toString());
        storage.deleteIfExists(staged.key());
        Files.delete(workspaceDirectory.resolve(object.toString()));
        Files.delete(workspaceDirectory);
        Files.createSymbolicLink(workspaceDirectory, outside);

        assertThatThrownBy(() -> storage.deleteIfExists(staged.key())).isInstanceOf(IOException.class);
        assertThat(Files.readAllBytes(outsideFile)).containsExactly(7);
    }

    private static final class BoundedReadInputStream extends InputStream {
        private final byte[] content;
        private int offset;

        private BoundedReadInputStream(byte[] content) {
            this.content = content;
        }

        @Override
        public int read() {
            return offset == content.length ? -1 : content[offset++] & 0xff;
        }

        @Override
        public int read(byte[] destination, int destinationOffset, int length) throws IOException {
            if (length > 64 * 1024) {
                throw new IOException("unbounded read requested");
            }
            if (offset == content.length) {
                return -1;
            }
            int count = Math.min(length, content.length - offset);
            System.arraycopy(content, offset, destination, destinationOffset, count);
            offset += count;
            return count;
        }
    }
}
