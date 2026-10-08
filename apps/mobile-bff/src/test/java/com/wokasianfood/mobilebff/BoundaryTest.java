package com.wokasianfood.mobilebff;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class BoundaryTest {
    @Test
    void coreOriginCannotContainCredentialsPathsOrRemotePlainHttp() {
        for (String url : List.of("http://remote.example", "https://user:secret@api.example", "https://api.example/other",
                "https://api.example?url=other", "https://api.example#fragment", "file:///etc/passwd")) {
            assertThrows(IllegalArgumentException.class, () -> CoreApiClient.validatedOrigin(url), url);
        }
        assertEquals("https", CoreApiClient.validatedOrigin("https://api.example").getScheme());
        assertEquals("http", CoreApiClient.validatedOrigin("http://127.0.0.1:8080").getScheme());
    }

    @Test
    void chatRateLimitIsPerVerifiedUser() {
        var limits = new RequestLimits(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        for (int i = 0; i < 30; i++) limits.check("chat:user-a", 30);
        assertEquals(429, assertThrows(BffFailure.class, () -> limits.check("chat:user-a", 30)).status);
        assertDoesNotThrow(() -> limits.check("chat:user-b", 30));
    }
}
