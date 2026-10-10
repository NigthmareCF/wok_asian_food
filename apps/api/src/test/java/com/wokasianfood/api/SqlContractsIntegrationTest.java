package com.wokasianfood.api;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class SqlContractsIntegrationTest {
    @Test
    void versionedSqlContractsAndTraceabilityProposalRunOnlyOnDisposablePostgres() throws Exception {
        try (var database = new PostgreSQLContainer<>("postgres:18-alpine")) {
            database.start();
            Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                    .locations("filesystem:../../database/migrations").cleanDisabled(true).load().migrate();
            try (var paths = Files.list(Path.of("../../database/tests"))) {
                for (Path path : paths.filter(p -> p.getFileName().toString().matches("V\\d+.*\\.sql")).sorted().toList()) {
                    database.copyFileToContainer(Transferable.of(Files.readAllBytes(path)), "/tmp/contract.sql");
                    var result = database.execInContainer("psql", "-U", database.getUsername(), "-d",
                            database.getDatabaseName(), "-v", "ON_ERROR_STOP=1", "-f", "/tmp/contract.sql");
                    assertThat(result.getExitCode()).as(path + ": " + result.getStderr()).isZero();
                }
            }
            // This is a rollback-only proposal, outside Flyway's active locations; no future version is reserved.
            try (var connection = DriverManager.getConnection(database.getJdbcUrl(), database.getUsername(), database.getPassword())) {
                connection.setAutoCommit(false);
                try (var statement = connection.createStatement()) {
                    statement.execute(Files.readString(Path.of("../../docs/integration/proposals/cash-movement-traceability.sql")));
                    String check = Files.readString(Path.of("../../docs/integration/proposals/cash-movement-traceability-check.sql"))
                            .replace("\\set ON_ERROR_STOP on", "").replace("BEGIN;", "").replace("ROLLBACK;", "");
                    statement.execute(check);
                    connection.rollback();
                    var indexes = statement.executeQuery("SELECT count(*) FROM pg_indexes WHERE schemaname='wok' AND indexname IN ('ux_cash_movements_request','ux_cash_movements_payment')");
                    indexes.next();
                    assertThat(indexes.getInt(1)).isEqualTo(2);
                }
            }
        }
    }
}
