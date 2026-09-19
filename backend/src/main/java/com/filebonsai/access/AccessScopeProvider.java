package com.filebonsai.access;

import com.filebonsai.catalog.application.CatalogScope;
import com.filebonsai.catalog.application.CatalogScopeProvider;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
@Profile("postgres")
public final class AccessScopeProvider implements CatalogScopeProvider {
    static final String AUTHENTICATED_PRINCIPAL = "filebonsai.authenticatedPrincipal";

    private final DSLContext database;

    public AccessScopeProvider(DSLContext database) {
        this.database = database;
    }

    @Override
    public CatalogScope current() {
        HttpServletRequest request = currentRequest();
        Object value = request.getAttribute(AUTHENTICATED_PRINCIPAL);
        if (!(value instanceof AuthenticatedPrincipal principal)) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        var members = DSL.table(DSL.name("workspace_members"));
        var workspaceId = DSL.field(DSL.name("workspace_id"), UUID.class);
        List<UUID> workspaces = database.select(workspaceId)
                .from(members)
                .where(DSL.field(DSL.name("principal_id"), UUID.class).eq(principal.id()))
                .orderBy(workspaceId)
                .limit(2)
                .fetch(workspaceId);
        if (workspaces.size() != 1) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        return new CatalogScope(principal.id(), workspaces.getFirst());
    }

    private HttpServletRequest currentRequest() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        return attributes.getRequest();
    }
}
