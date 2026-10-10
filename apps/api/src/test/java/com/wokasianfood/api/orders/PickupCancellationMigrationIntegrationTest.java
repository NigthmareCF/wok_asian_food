package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThat;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PickupCancellationMigrationIntegrationTest {
    @Test
    void upgradesUnchangedPr39SchemaWithoutRewritingItsMigrations() throws Exception {
        try (var database = new PostgreSQLContainer<>("postgres:18-alpine")
                .withDatabaseName("antony_migration").withUsername("antony_test").withPassword("isolated_test_password")) {
            database.start();
            var baseline = Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                    .locations("filesystem:../../database/migrations").target("56").load();
            baseline.migrate();
            try (var connection = java.sql.DriverManager.getConnection(database.getJdbcUrl(), database.getUsername(), database.getPassword());
                 var statement = connection.createStatement()) {
                var history = statement.executeQuery("SELECT count(*) FROM public.flyway_schema_history WHERE success = true AND version IS NOT NULL");
                history.next(); assertThat(history.getInt(1)).isEqualTo(28);
                var upgrade = Flyway.configure().dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
                        .locations("filesystem:../../database/migrations").load();
                assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(4);
                upgrade.validate();
                var tables = statement.executeQuery("SELECT to_regclass('wok.order_change_requests'), to_regclass('wok.order_change_request_events'), to_regclass('wok.payment_attempts')");
                tables.next(); assertThat(tables.getString(1)).isNotNull(); assertThat(tables.getString(2)).isNotNull(); assertThat(tables.getString(3)).isNotNull();
            }
        }
    }
}
