package com.wokasianfood.api.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpResolverTest {
    @ParameterizedTest
    @ValueSource(strings = {"203.0.113.9", "10.1.2.3", "172.18.0.2", "192.168.1.1", "127.0.0.1", "::1", "fc00::1"})
    void emptyConfigurationIgnoresSpoofedHeadersIncludingPrivatePeers(String remote) {
        assertThat(new ClientIpResolver("").resolve(remote, "198.51.100.7"))
                .isEqualTo(ClientIpAddress.normalize(remote));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "192.0.2.10|192.0.2.10|203.0.113.7|203.0.113.7",
            "192.0.2.10|192.0.2.11|203.0.113.7|192.0.2.11",
            "192.0.2.128/25|192.0.2.128|203.0.113.7|203.0.113.7",
            "192.0.2.128/25|192.0.2.255|203.0.113.7|203.0.113.7",
            "192.0.2.128/25|192.0.2.127|203.0.113.7|192.0.2.127",
            "2001:db8::/64|2001:db8::10|2001:db8:1::7|2001:db8:1::7",
            "2001:db8::/64|2001:db8:1::10|203.0.113.7|2001:db8:1::10",
            "2001:db8::10/128|2001:db8::10|203.0.113.7|203.0.113.7",
            "2001:db8::10|2001:db8::11|203.0.113.7|2001:db8::11",
            "192.0.2.10|::ffff:192.0.2.10|203.0.113.7|192.0.2.10",
            "::ffff:192.0.2.10/128|::ffff:192.0.2.10|203.0.113.7|203.0.113.7",
            "192.0.2.10|192.0.2.10|203.0.113.7,198.51.100.8|198.51.100.8",
            "192.0.2.10,198.51.100.0/24|192.0.2.10|203.0.113.7,198.51.100.8|203.0.113.7",
            "192.0.2.10|192.0.2.10|192.0.2.10|192.0.2.10"
    })
    void resolvesOnlyAcrossExplicitlyTrustedIpsAndCidrs(String configured, String remote, String xff, String expected) {
        assertThat(new ClientIpResolver(configured).resolve(remote, xff))
                .isEqualTo(ClientIpAddress.normalize(expected));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"localhost", "203.0.113.7:80", "01.2.3.4", "256.0.0.1", "::1/128",
            "[::1]", "fe80::1%eth0", "1::2::3", "203.0.113.7,invalid", ",203.0.113.7", "203.0.113.7,"})
    void invalidOrMissingForwardedChainFallsBackToTrustedPeer(String forwarded) {
        assertThat(new ClientIpResolver("192.0.2.10").resolve("192.0.2.10", forwarded)).isEqualTo("192.0.2.10");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"localhost", "invalid", "127.0.0.1:80", "fe80::1%eth0"})
    void invalidRemoteCannotBeRescuedByForwardedHeader(String remote) {
        assertThat(new ClientIpResolver("192.0.2.10").resolve(remote, "203.0.113.7")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"localhost", "10/8", "192.0.2.1/33", "::/129", "192.0.2.1/-1", "::/abc",
            "::/01", "::/", "::/64/1", "[::1]", "fe80::1%eth0", "192.0.2.1,", "192.0.2.1,,::1"})
    void invalidConfigurationFailsClosed(String configured) {
        assertThatThrownBy(() -> new ClientIpResolver(configured)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("wok.http.trusted-proxies");
    }

    @Test
    void repeatedHeadersAreTreatedAsOneOrderedChainAndForwardedIsIgnored() {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("192.0.2.10");
        request.addHeader("X-Forwarded-For", "198.51.100.7");
        request.addHeader("X-Forwarded-For", "203.0.113.8");
        request.addHeader("Forwarded", "for=198.51.100.9");
        assertThat(new ClientIpResolver("192.0.2.10").resolve(request)).isEqualTo("203.0.113.8");
        assertThat(new ClientIpResolver("").resolve(request)).isEqualTo("192.0.2.10");
    }
}
