package com.filebonsai.transfers.persistence;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/** Retries only stale finalizations; active body receivers are never fenced by the scheduler. */
public final class R2TransferRecovery {
    private static final Logger LOGGER = LoggerFactory.getLogger(R2TransferRecovery.class);

    private final PostgresLocalTransfers transfers;
    private final Duration idle;

    public R2TransferRecovery(PostgresLocalTransfers transfers, Duration idle) {
        if (idle.isNegative() || idle.isZero()) {
            throw new IllegalArgumentException("R2 recovery idle time must be positive");
        }
        this.transfers = transfers;
        this.idle = idle;
    }

    @Scheduled(fixedDelayString = "${filebonsai.r2.recovery-interval:1m}")
    public void run() {
        try {
            transfers.reconcileStale(idle);
        } catch (RuntimeException exception) {
            LOGGER.warn("R2 transfer recovery deferred; it will retry");
        }
    }
}
