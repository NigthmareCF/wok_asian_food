package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class PaymentEvidenceOrphanCleanupWorkerTest {
    private Path directory;
    private PaymentEvidenceStorage storage;
    private JdbcTemplate jdbc;
    private PaymentEvidenceOrphanCleanupWorker worker;

    @BeforeEach
    void setUp() throws Exception {
        directory = Files.createTempDirectory("wok-evidence-cleanup-test-");
        storage = new PaymentEvidenceStorage(directory.toString());
        jdbc = mock(JdbcTemplate.class);
        worker = new PaymentEvidenceOrphanCleanupWorker(jdbc, storage);
    }

    @AfterEach
    void tearDown() throws Exception {
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    @Test
    void deletesOnlyOldFilesConfirmedUnreferencedByDatabase() throws Exception {
        UUID orphanId = UUID.randomUUID();
        UUID referencedId = UUID.randomUUID();
        UUID recentId = UUID.randomUUID();
        storage.write(orphanId, new byte[] {1});
        storage.write(referencedId, new byte[] {2});
        storage.write(recentId, new byte[] {3});
        FileTime old = FileTime.from(Instant.now().minus(2, ChronoUnit.DAYS));
        Files.setLastModifiedTime(directory.resolve(orphanId + ".evidence"), old);
        Files.setLastModifiedTime(directory.resolve(referencedId + ".evidence"), old);
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), eq(orphanId))).thenReturn(false);
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), eq(referencedId))).thenReturn(true);

        worker.removeUnreferencedFiles();

        assertThat(directory.resolve(orphanId + ".evidence")).doesNotExist();
        assertThat(directory.resolve(referencedId + ".evidence")).exists();
        assertThat(directory.resolve(recentId + ".evidence")).exists();
    }

    @Test
    void keepsFileWhenDatabaseLookupFails() throws Exception {
        UUID id = UUID.randomUUID();
        storage.write(id, new byte[] {1});
        Files.setLastModifiedTime(directory.resolve(id + ".evidence"),
                FileTime.from(Instant.now().minus(2, ChronoUnit.DAYS)));
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), eq(id)))
                .thenThrow(new IllegalStateException("database unavailable"));

        assertThatThrownBy(worker::removeUnreferencedFiles).isInstanceOf(IllegalStateException.class);

        assertThat(directory.resolve(id + ".evidence")).exists();
    }

    @Test
    void processesFilesBeyondThePerRunBatchWithoutStarvingLaterIds() throws Exception {
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), any(UUID.class))).thenReturn(false);
        FileTime old = FileTime.from(Instant.now().minus(2, ChronoUnit.DAYS));
        for (int index = 0; index < 101; index++) {
            UUID id = UUID.randomUUID();
            storage.write(id, new byte[] {(byte) index});
            Files.setLastModifiedTime(directory.resolve(id + ".evidence"), old);
        }

        worker.removeUnreferencedFiles();
        worker.removeUnreferencedFiles();

        try (var files = Files.newDirectoryStream(directory, "*.evidence")) {
            assertThat(files.iterator().hasNext()).isFalse();
        }
        verify(jdbc, times(101)).queryForObject(any(String.class), eq(Boolean.class), any(UUID.class));
    }
}
