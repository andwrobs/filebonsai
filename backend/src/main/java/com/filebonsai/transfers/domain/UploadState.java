package com.filebonsai.transfers.domain;

public enum UploadState {
    INITIATED,
    RECEIVING,
    STAGED,
    FINALIZING,
    RECONCILING,
    AVAILABLE,
    CANCELLED,
    EXPIRED,
    FAILED
}
