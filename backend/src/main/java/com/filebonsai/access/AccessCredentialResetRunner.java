package com.filebonsai.access;

import java.nio.file.Path;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Applies one idempotent credential reset from a mounted secret file. */
@Component
@Profile("postgres")
@ConditionalOnProperty("filebonsai.access.reset.password-file")
final class AccessCredentialResetRunner implements ApplicationRunner {
    private final LocalOwnerAccess access;
    private final UUID requestId;
    private final Path passwordFile;

    AccessCredentialResetRunner(
            LocalOwnerAccess access,
            @Value("${filebonsai.access.reset.request-id}") UUID requestId,
            @Value("${filebonsai.access.reset.password-file}") Path passwordFile) {
        this.access = access;
        this.requestId = requestId;
        this.passwordFile = passwordFile;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        access.resetCredentials(
                requestId,
                PasswordFileReader.read(passwordFile, "Cannot read configured credential reset password file"));
    }
}
