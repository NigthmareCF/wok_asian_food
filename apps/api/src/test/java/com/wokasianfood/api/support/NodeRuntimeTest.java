package com.wokasianfood.api.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class NodeRuntimeTest {
    @ParameterizedTest
    @CsvSource({"Windows 10,node.exe", "Windows 11,node.exe", "Windows Server 2022,node.exe",
        "WINDOWS 11,node.exe", "Linux,node", "Mac OS X,node", "Darwin,node"})
    void selectsExecutableFromOperatingSystem(String operatingSystem, String expected) {
        assertThat(NodeRuntime.executableFor(operatingSystem)).isEqualTo(expected);
    }
}
