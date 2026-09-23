package com.filebonsai.access;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@Profile("postgres")
class OidcLoginConfiguration {
    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            LocalOwnerAccess access,
            @Value("${filebonsai.oidc.owner-subject:}") String ownerSubject,
            @Value("${filebonsai.oidc.success-url:/}") String successUrl,
            @Value("${filebonsai.access.cookie.secure:true}") boolean secureCookies,
            @Value("${filebonsai.access.session-ttl:PT12H}") Duration sessionTtl)
            throws Exception {
        http.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
        // API writes are protected by AccessSessionFilter's double-submit token.
        http.csrf(csrf -> csrf.disable());
        if (!ownerSubject.isBlank()) {
            http.oauth2Login(oauth -> oauth.failureHandler(
                            (request, response, failure) -> response.sendRedirect(successUrl + "?login=failed"))
                    .successHandler((request, response, authentication) -> {
                        if (!isOwner(authentication, ownerSubject)) {
                            response.sendError(403);
                            return;
                        }
                        IssuedSession session =
                                access.issueOidcSession(cookie(request, LocalOwnerAccess.SESSION_COOKIE));
                        response.addHeader(
                                HttpHeaders.SET_COOKIE,
                                ResponseCookie.from(LocalOwnerAccess.SESSION_COOKIE, session.sessionToken())
                                        .httpOnly(true)
                                        .secure(secureCookies)
                                        .sameSite("Lax")
                                        .path("/")
                                        .maxAge(sessionTtl)
                                        .build()
                                        .toString());
                        response.addHeader(
                                HttpHeaders.SET_COOKIE,
                                ResponseCookie.from(LocalOwnerAccess.CSRF_COOKIE, session.csrfToken())
                                        .httpOnly(false)
                                        .secure(secureCookies)
                                        .sameSite("Lax")
                                        .path("/")
                                        .maxAge(sessionTtl)
                                        .build()
                                        .toString());
                        if (request.getSession(false) != null) {
                            request.getSession(false).invalidate();
                        }
                        response.sendRedirect(successUrl);
                    }));
        }
        return http.build();
    }

    private static boolean isOwner(Authentication authentication, String subject) {
        if (!(authentication.getPrincipal() instanceof OidcUser user)) {
            return false;
        }
        return subject.equals(user.getSubject());
    }

    private static String cookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
