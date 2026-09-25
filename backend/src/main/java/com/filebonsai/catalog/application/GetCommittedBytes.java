package com.filebonsai.catalog.application;

import com.filebonsai.catalog.domain.ByteCount;

/** Sums committed file versions in the scope's workspace; uploads that are not yet available never count. */
@FunctionalInterface
public interface GetCommittedBytes {
    ByteCount committedBytes(CatalogScope scope);
}
