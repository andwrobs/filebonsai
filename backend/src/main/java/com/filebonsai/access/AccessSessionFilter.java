package com.filebonsai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.platform.web.ApiErrorResponse;
import com.filebonsai.platform.web.RequestMetadataFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("postgres")
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
final class AccessSessionFilter extends OncePerRequestFilter {
    private final LocalOwnerAccess access;
    private final ObjectMapper mapper;

    AccessSessionFilter(LocalOwnerAccess access, ObjectMapper mapper) {
        this.access = access;
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String sessionToken = cookie(request, LocalOwnerAccess.SESSION_COOKIE);
        AuthenticatedPrincipal principal = access.authenticate(sessionToken).orElse(null);
        if (principal != null) {
            request.setAttribute(AccessScopeProvider.AUTHENTICATED_PRINCIPAL, principal);
        }
        if (requiresCsrf(request)) {
            String csrfCookie = cookie(request, LocalOwnerAccess.CSRF_COOKIE);
            String csrfHeader = request.getHeader(LocalOwnerAccess.CSRF_HEADER);
            boolean valid = principal == null
                    ? access.anonymousCsrfMatches(csrfCookie, csrfHeader)
                    : access.csrfMatches(principal, csrfCookie) && access.anonymousCsrfMatches(csrfCookie, csrfHeader);
            if (!valid) {
                writeFailure(request, response, 403, "CSRF_INVALID", "Request could not be processed");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private boolean requiresCsrf(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/api/")
                && !("GET".equals(request.getMethod())
                        || "HEAD".equals(request.getMethod())
                        || "OPTIONS".equals(request.getMethod()));
    }

    private void writeFailure(
            HttpServletRequest request, HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(
                response.getOutputStream(),
                new ApiErrorResponse(
                        code,
                        message,
                        status,
                        (String) request.getAttribute(RequestMetadataFilter.REQUEST_ID),
                        List.of()));
    }

    private String cookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
