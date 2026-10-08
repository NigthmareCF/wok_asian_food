package com.wokasianfood.api.payments;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Stores receipts outside any static/public web root, addressed only by server-generated UUIDs. */
@Component
final class PaymentEvidenceStorage {
    private final Path root;

    PaymentEvidenceStorage(@Value("${wok.payments.evidence-directory:${java.io.tmpdir}/wok-payment-evidence}") String directory) {
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    void write(UUID id, byte[] contents) {
        Path target = path(id);
        Path temporary = root.resolve(id + ".upload");
        try {
            try {
                Files.createDirectories(root, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
                Files.setPosixFilePermissions(root, PosixFilePermissions.fromString("rwx------"));
                Files.createFile(temporary, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            } catch (UnsupportedOperationException unsupported) {
                Files.createDirectories(root);
                Files.createFile(temporary);
            }
            Files.write(temporary, contents);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException unsupported) {
                Files.move(temporary, target);
            }
            try { Files.setPosixFilePermissions(target, PosixFilePermissions.fromString("rw-------")); }
            catch (UnsupportedOperationException ignored) { }
        } catch (IOException failure) {
            try { Files.deleteIfExists(temporary); } catch (IOException ignored) { }
            throw new IllegalStateException("Could not store payment evidence", failure);
        }
    }

    byte[] read(UUID id) {
        try { return Files.readAllBytes(path(id)); }
        catch (IOException failure) { throw new IllegalStateException("Payment evidence is unavailable", failure); }
    }

    void delete(UUID id) {
        try { Files.deleteIfExists(path(id)); } catch (IOException ignored) { }
    }

    List<UUID> filesOlderThan(Instant cutoff, String afterId, int limit) {
        if (limit < 1 || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)) return List.of();
        List<UUID> candidates = new ArrayList<>();
        try (var files = Files.newDirectoryStream(root, "*.evidence")) {
            for (Path file : files) {
                if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                        || !Files.getLastModifiedTime(file, LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff)) continue;
                String filename = file.getFileName().toString();
                try {
                    UUID id = UUID.fromString(filename.substring(0, filename.length() - ".evidence".length()));
                    if (afterId == null || id.toString().compareTo(afterId) > 0) candidates.add(id);
                }
                catch (IllegalArgumentException ignored) { }
            }
            return candidates.stream().sorted(java.util.Comparator.comparing(UUID::toString)).limit(limit).toList();
        } catch (IOException failure) {
            throw new IllegalStateException("Could not inspect payment evidence storage", failure);
        }
    }

    private Path path(UUID id) {
        Path result = root.resolve(id + ".evidence").normalize();
        if (!result.getParent().equals(root)) throw new IllegalArgumentException("Invalid evidence key");
        return result;
    }
}
