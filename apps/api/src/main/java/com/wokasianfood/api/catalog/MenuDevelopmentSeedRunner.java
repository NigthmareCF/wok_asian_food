package com.wokasianfood.api.catalog;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

/** Runs the explicitly enabled, repeatable development menu seed after Flyway startup. */
@Component
@ConditionalOnProperty(name = "wok.catalog.seed-enabled", havingValue = "true")
public class MenuDevelopmentSeedRunner implements ApplicationRunner {
    private final DataSource dataSource;
    private final ResourceLoader resources;
    private final String seedLocation;

    public MenuDevelopmentSeedRunner(DataSource dataSource, ResourceLoader resources,
            @Value("${wok.catalog.seed-file:file:../../database/seeds/menu_real_dev.sql}") String seedLocation) {
        this.dataSource = dataSource;
        this.resources = resources;
        this.seedLocation = seedLocation;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        Resource seed = resources.getResource(seedLocation);
        if (!seed.exists()) throw new IllegalStateException("Configured WOK menu seed does not exist: " + seedLocation);
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            ScriptUtils.executeSqlScript(connection, seed);
        }
    }
}
