package com.filebonsai.transfers.application;

import com.filebonsai.catalog.domain.ByteCount;
import com.filebonsai.catalog.domain.EntryId;
import com.filebonsai.catalog.domain.FileName;
import com.filebonsai.catalog.domain.VersionId;
import com.filebonsai.transfers.domain.UploadState;
import java.time.Instant;
import java.util.UUID;

public record UploadSession(
        UUID id,
        EntryId entryId,
        VersionId versionId,
        EntryId parentId,
        FileName name,
        ByteCount expectedSize,
        String expectedSha256,
        String computedSha256,
        UploadState state,
        Instant expiresAt) {}
