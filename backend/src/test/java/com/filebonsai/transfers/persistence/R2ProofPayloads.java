package com.filebonsai.transfers.persistence;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Deterministic, synthetic bodies for the optional real-bucket proof. */
final class R2ProofPayloads {
    static final String EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    static final String SMALL_SHA256 = "d67c656e01756650d77717b0839985a056ec28ffe174601d690fc407a2ceffca";
    static final String MULTIPART_SHA256 = "5a9ed69fb98cb8ce976ff50dd58c64f3ad76ea56e5591551ad232a0c499d937d";

    private R2ProofPayloads() {}

    static byte[] body(int length) {
        byte[] body = new byte[length];
        for (int i = 0; i < length; i++) {
            body[i] = (byte) (i % 251);
        }
        return body;
    }

    static byte[] sha256(byte[] body) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(body);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
    }

    static String hexSha256(byte[] body) {
        return HexFormat.of().formatHex(sha256(body));
    }
}
