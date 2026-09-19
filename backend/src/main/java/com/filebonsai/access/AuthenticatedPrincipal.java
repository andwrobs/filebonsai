package com.filebonsai.access;

import java.util.UUID;

public record AuthenticatedPrincipal(UUID id, UUID sessionId) {}
