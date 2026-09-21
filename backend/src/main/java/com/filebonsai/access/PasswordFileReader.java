package com.filebonsai.access;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

final class PasswordFileReader {
    private static final int MAX_FILE_CHARACTERS = 4096;

    private PasswordFileReader() {}

    static char[] read(Path path, String failureMessage) {
        char[] contents = new char[MAX_FILE_CHARACTERS + 1];
        try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            int length = 0;
            while (length < contents.length) {
                int count = reader.read(contents, length, contents.length - length);
                if (count < 0) {
                    break;
                }
                length += count;
            }
            if (length > MAX_FILE_CHARACTERS || reader.read() >= 0) {
                throw new IllegalStateException(failureMessage);
            }
            int start = 0;
            int end = length;
            while (start < end && Character.isWhitespace(contents[start])) {
                start++;
            }
            while (end > start && Character.isWhitespace(contents[end - 1])) {
                end--;
            }
            return Arrays.copyOfRange(contents, start, end);
        } catch (IOException exception) {
            throw new IllegalStateException(failureMessage);
        } finally {
            Arrays.fill(contents, '\0');
        }
    }
}
