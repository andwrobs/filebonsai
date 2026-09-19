package com.filebonsai.access;

import java.time.Instant;

record IssuedSession(AuthenticatedPrincipal principal, String sessionToken, String csrfToken, Instant expiresAt) {}
