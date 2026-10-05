package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class DemoSeedPasswordTest {
    private static final Pattern BCRYPT_HASH = Pattern.compile("'(\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53})'");

    @Test
    void keepsDemoCredentialsAlignedWithTheirBcryptHashes() throws IOException {
        String seed = Files.readString(Path.of("..", "..", "database", "seeds", "dev_demo.sql"));
        var matcher = BCRYPT_HASH.matcher(seed);
        var hashes = new ArrayList<String>();
        while (matcher.find()) hashes.add(matcher.group(1));

        assertEquals(2, hashes.size());
        var passwords = new BCryptPasswordEncoder(12);
        assertTrue(passwords.matches("DemoOperativo2026", hashes.get(0)));
        assertTrue(passwords.matches("DemoAdmin2026", hashes.get(1)));
    }
}
