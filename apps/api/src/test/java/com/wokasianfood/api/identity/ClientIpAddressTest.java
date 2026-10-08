package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ClientIpAddressTest {
    @ParameterizedTest
    @CsvSource({
            "203.0.113.7, 203.0.113.7",
            "0.0.0.0, 0.0.0.0",
            "255.255.255.255, 255.255.255.255",
            "::, 0:0:0:0:0:0:0:0",
            "::1, 0:0:0:0:0:0:0:1",
            "2001:DB8::1, 2001:db8:0:0:0:0:0:1",
            "2001:db8:0:0:0:0:0:1, 2001:db8:0:0:0:0:0:1",
            "::FFFF:203.0.113.7, 203.0.113.7",
            "0:0:0:0:0:ffff:cb00:7107, 203.0.113.7",
            "2001:db8::192.0.2.1, 2001:db8:0:0:0:0:c000:201"
    })
    void normalizesAddressLiterals(String input, String expected) {
        assertEquals(expected, ClientIpAddress.normalize(input));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "localhost", "example.com", "invalid", "256.0.0.1", "127.1",
            "2130706433", "01.2.3.4", "-1.2.3.4", "1.2.3.4.", "203.0.113.7:8080",
            "203.0.113.7/24", "[::1]", "fe80::1%eth0", "::1/128", ":::1", "1::2::3",
            "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8::", "gggg::1",
            "12345::1", "::ffff:256.1.2.3", "203.0.113.1,203.0.113.2"})
    void rejectsAnythingOtherThanAnAddressLiteral(String input) {
        assertNull(ClientIpAddress.normalize(input));
    }
}
