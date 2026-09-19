package com.filebonsai.access;

import com.filebonsai.platform.web.ApiErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("postgres")
@RequestMapping("/api/v1/auth")
@Tag(name = "Access")
public final class AccessController {
    private final LocalOwnerAccess access;
    private final boolean secureCookies;
    private final Duration sessionTtl;

    public AccessController(
            LocalOwnerAccess access,
            @Value("${filebonsai.access.cookie.secure:true}") boolean secureCookies,
            @Value("${filebonsai.access.session-ttl:PT12H}") Duration sessionTtl) {
        this.access = access;
        this.secureCookies = secureCookies;
        this.sessionTtl = sessionTtl;
    }

    @GetMapping(value = "/csrf", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getCsrf", summary = "Obtain a CSRF token for a state-changing request")
    public ResponseEntity<AccessCsrfResponse> csrf(HttpServletRequest request) {
        String token = cookie(request, LocalOwnerAccess.CSRF_COOKIE);
        if (token == null) {
            token = access.newAnonymousCsrfToken();
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, csrfCookie(token).toString())
                .body(new AccessCsrfResponse(token, LocalOwnerAccess.CSRF_HEADER));
    }

    @PostMapping(
            value = "/login",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "login", summary = "Authenticate the local owner and rotate the session")
    @ApiResponse(
            responseCode = "401",
            description = "INVALID_CREDENTIALS",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public ResponseEntity<AccessSessionResponse> login(
            @Valid @RequestBody AccessLoginRequest request, HttpServletRequest servletRequest) {
        IssuedSession session =
                access.login(request.password().toCharArray(), cookie(servletRequest, LocalOwnerAccess.SESSION_COOKIE));
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.SET_COOKIE,
                        sessionCookie(session.sessionToken()).toString())
                .header(HttpHeaders.SET_COOKIE, csrfCookie(session.csrfToken()).toString())
                .body(new AccessSessionResponse(session.principal().id(), session.expiresAt()));
    }

    @PostMapping("/logout")
    @Operation(operationId = "logout", summary = "Invalidate the current session")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        Object principal = request.getAttribute(AccessScopeProvider.AUTHENTICATED_PRINCIPAL);
        if (!(principal instanceof AuthenticatedPrincipal authenticated)) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        access.logout(authenticated);
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                expiredCookie(LocalOwnerAccess.SESSION_COOKIE, true).toString());
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                expiredCookie(LocalOwnerAccess.CSRF_COOKIE, false).toString());
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/me", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "getCurrentSession", summary = "Read the authenticated local owner")
    public AccessSessionResponse me(HttpServletRequest request) {
        Object principal = request.getAttribute(AccessScopeProvider.AUTHENTICATED_PRINCIPAL);
        if (!(principal instanceof AuthenticatedPrincipal authenticated)) {
            throw new AccessFailure(AccessFailure.Reason.AUTH_REQUIRED);
        }
        return new AccessSessionResponse(authenticated.id(), access.expiresAt(authenticated));
    }

    private ResponseCookie sessionCookie(String value) {
        return ResponseCookie.from(LocalOwnerAccess.SESSION_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookies)
                .sameSite("Lax")
                .path("/")
                .maxAge(sessionTtl)
                .build();
    }

    private ResponseCookie csrfCookie(String value) {
        return ResponseCookie.from(LocalOwnerAccess.CSRF_COOKIE, value)
                .httpOnly(false)
                .secure(secureCookies)
                .sameSite("Lax")
                .path("/")
                .maxAge(sessionTtl)
                .build();
    }

    private ResponseCookie expiredCookie(String name, boolean httpOnly) {
        return ResponseCookie.from(name, "")
                .httpOnly(httpOnly)
                .secure(secureCookies)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
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
