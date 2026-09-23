package com.filebonsai.transfers.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class R2ProofPayloadsTest {
    @Test
    void syntheticBodiesMatchPinnedDigestsAndMultipartBoundary() {
        assertThat(R2ProofPayloads.hexSha256(R2ProofPayloads.body(0))).isEqualTo(R2ProofPayloads.EMPTY_SHA256);
        assertThat(R2ProofPayloads.hexSha256(R2ProofPayloads.body(4096))).isEqualTo(R2ProofPayloads.SMALL_SHA256);
        assertThat(R2ProofPayloads.hexSha256(R2ProofPayloads.body(9 * 1024 * 1024)))
                .isEqualTo(R2ProofPayloads.MULTIPART_SHA256);
        assertThat(R2ProofPayloads.body(9 * 1024 * 1024).length).isGreaterThan(8 * 1024 * 1024);
    }
}
