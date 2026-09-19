package com.filebonsai.catalog.application;

import static com.filebonsai.catalog.application.CatalogFailure.Reason.INVALID_CURSOR;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.filebonsai.catalog.domain.EntryId;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Authenticated, scope-bound keyset token. Contents are not encrypted or an API for clients. */
public final class CatalogCursor {
    private static final int VERSION = 1;
    private static final String SORT = "name-id-utf8-asc-v1";

    private final ObjectMapper mapper;
    private final byte[] secret;

    public record Position(int version, UUID workspaceId, UUID folderId, String sort, String name, UUID id) {}

    public CatalogCursor(ObjectMapper mapper, byte[] secret) {
        this.mapper = mapper;
        this.secret = secret.clone();
    }

    public String encode(UUID workspace, EntryId folder, String name, EntryId id) {
        try {
            byte[] payload =
                    mapper.writeValueAsBytes(new Position(VERSION, workspace, folder.value(), SORT, name, id.value()));
            var encoder = Base64.getUrlEncoder().withoutPadding();
            return encoder.encodeToString(payload) + "." + encoder.encodeToString(sign(payload));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot encode cursor", exception);
        }
    }

    public Position decode(String token, UUID workspace, EntryId folder) {
        try {
            if (token.length() > 2048) {
                throw new IllegalArgumentException();
            }
            String[] pieces = token.split("\\.", -1);
            if (pieces.length != 2) {
                throw new IllegalArgumentException();
            }
            byte[] payload = Base64.getUrlDecoder().decode(pieces[0]);
            byte[] signature = Base64.getUrlDecoder().decode(pieces[1]);
            if (!MessageDigest.isEqual(sign(payload), signature)) {
                throw new IllegalArgumentException();
            }
            Position position = mapper.readValue(payload, Position.class);
            if (position.version() != VERSION
                    || !workspace.equals(position.workspaceId())
                    || !folder.value().equals(position.folderId())
                    || !SORT.equals(position.sort())
                    || position.name() == null
                    || position.id() == null) {
                throw new IllegalArgumentException();
            }
            return position;
        } catch (Exception exception) {
            throw new CatalogFailure(INVALID_CURSOR, "Cursor is invalid for this folder or server session");
        }
    }

    private byte[] sign(byte[] payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return mac.doFinal(payload);
    }
}
