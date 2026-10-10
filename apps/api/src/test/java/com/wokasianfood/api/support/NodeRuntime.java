package com.wokasianfood.api.support;

import java.util.Locale;

/** Selecciona Node en PATH sin rutas del equipo ni cambios a la prueba integrada. */
public final class NodeRuntime {
    private NodeRuntime() {}

    public static String executable() {
        return executableFor(System.getProperty("os.name", ""));
    }

    static String executableFor(String osName) {
        return osName.toLowerCase(Locale.ROOT).startsWith("windows") ? "node.exe" : "node";
    }
}
