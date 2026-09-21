package com.filebonsai.access;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Creates the initial local owner from a mounted secret file; it never accepts a password argument. */
@Component
@Profile("postgres")
@ConditionalOnProperty("filebonsai.access.bootstrap.password-file")
final class AccessBootstrapRunner implements ApplicationRunner {
    private final LocalOwnerAccess access;
    private final Path passwordFile;

    AccessBootstrapRunner(
            LocalOwnerAccess access, @Value("${filebonsai.access.bootstrap.password-file}") Path passwordFile) {
        this.access = access;
        this.passwordFile = passwordFile;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        access.bootstrap(PasswordFileReader.read(passwordFile, "Cannot read configured bootstrap password file"));
    }
}
