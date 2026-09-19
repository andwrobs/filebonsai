package com.filebonsai.access;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("postgres")
final class PasswordHasher {
    private static final String ALGORITHM = "PBKDF2WithHmacSHA512";
    private static final int ITERATIONS = 310_000;
    private static final int KEY_LENGTH_BITS = 256;
    private static final int SALT_LENGTH_BYTES = 16;

    private final SecureRandom random = new SecureRandom();

    String hash(char[] password) {
        byte[] salt = new byte[SALT_LENGTH_BYTES];
        random.nextBytes(salt);
        byte[] derived = derive(password, salt, ITERATIONS);
        return "pbkdf2-sha512$" + ITERATIONS + "$" + encode(salt) + "$" + encode(derived);
    }

    boolean matches(char[] password, String encoded) {
        try {
            String[] parts = encoded.split("\\$", -1);
            if (parts.length != 4 || !"pbkdf2-sha512".equals(parts[0])) {
                return false;
            }
            int iterations = Integer.parseInt(parts[1]);
            if (iterations < 1) {
                return false;
            }
            byte[] expected = Base64.getUrlDecoder().decode(parts[3]);
            return MessageDigest.isEqual(
                    expected, derive(password, Base64.getUrlDecoder().decode(parts[2]), iterations));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private byte[] derive(char[] password, byte[] salt, int iterations) {
        try {
            PBEKeySpec specification = new PBEKeySpec(password, salt, iterations, KEY_LENGTH_BITS);
            try {
                return SecretKeyFactory.getInstance(ALGORITHM)
                        .generateSecret(specification)
                        .getEncoded();
            } finally {
                specification.clearPassword();
            }
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Required password hashing algorithm is unavailable", exception);
        }
    }

    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
