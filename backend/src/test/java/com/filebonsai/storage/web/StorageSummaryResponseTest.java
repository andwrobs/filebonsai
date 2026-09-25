package com.filebonsai.storage.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.storage.application.StorageCapabilities;
import com.filebonsai.storage.application.StorageConnection;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class StorageSummaryResponseTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void serializesOnlyTheAllowedFieldsForEveryProvider() throws Exception {
        for (var provider : List.of("local", "r2")) {
            StorageConnection connection = StorageConnection.configured(provider, "");
            JsonNode json = mapper.valueToTree(StorageSummaryResponse.from(
                    connection, StorageCapabilities.of(connection), new ByteCount(9_007_199_254_740_993L)));

            // An allow-list, so adding a bucket, account, endpoint, credential, or path field fails here.
            assertThat(paths(json, ""))
                    .containsExactlyInAnyOrder(
                            "connection.displayName",
                            "connection.providerKind",
                            "capabilities.sha256Verification",
                            "capabilities.resumableUploads",
                            "capabilities.rangeDownloads",
                            "usedBytes");
            assertThat(json.path("connection").path("providerKind").asText()).isEqualTo(provider);
            assertThat(json.path("usedBytes").isTextual()).isTrue();
            assertThat(json.path("usedBytes").asText()).isEqualTo("9007199254740993");
            assertThat(json.path("capabilities").path("sha256Verification").asBoolean())
                    .isTrue();
            assertThat(json.path("capabilities").path("resumableUploads").asBoolean())
                    .isFalse();
            assertThat(json.path("capabilities").path("rangeDownloads").asBoolean())
                    .isFalse();
        }
    }

    @Test
    void usesTheOperatorsNameOrTheProviderDefaultAndRejectsUnsafeNames() {
        assertThat(StorageConnection.configured("local", "  ").displayName()).isEqualTo("Local disk");
        assertThat(StorageConnection.configured("r2", null).displayName()).isEqualTo("Cloudflare R2");
        assertThat(StorageConnection.configured("r2", " Family archive ").displayName())
                .isEqualTo("Family archive");
        assertThat(StorageConnection.configured(" R2 ", "").providerKind()).isEqualTo("r2");
        for (var name : List.of("x".repeat(81), "line\nbreak")) {
            assertThatThrownBy(() -> StorageConnection.configured("local", name))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> StorageConnection.configured("s3", "")).isInstanceOf(IllegalArgumentException.class);
    }

    private static List<String> paths(JsonNode node, String prefix) {
        List<String> paths = new ArrayList<>();
        node.fields().forEachRemaining(field -> {
            String path = prefix.isEmpty() ? field.getKey() : prefix + "." + field.getKey();
            if (field.getValue().isObject()) {
                paths.addAll(paths(field.getValue(), path));
            } else {
                paths.add(path);
            }
        });
        return paths;
    }
}
