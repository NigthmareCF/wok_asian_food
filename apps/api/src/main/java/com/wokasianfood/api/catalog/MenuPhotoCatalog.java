package com.wokasianfood.api.catalog;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;

/** Maps the restaurant's supplied menu photographs to known catalog names as a display fallback. */
final class MenuPhotoCatalog {
    private static final Map<String, String> PHOTOS = Map.ofEntries(
            Map.entry("maki atun", "/menu/dishes/maki-atun.webp"),
            Map.entry("maki camaron", "/menu/dishes/maki-camaron.webp"),
            Map.entry("uramaki aguacate", "/menu/dishes/ura-aguacate.webp"),
            Map.entry("uramaki atun", "/menu/dishes/ura-atun.webp"),
            Map.entry("uramaki salmon", "/menu/dishes/ura-salmon.webp"),
            Map.entry("gamba roll", "/menu/dishes/gamba-roll.webp"),
            Map.entry("camaron crunchy", "/menu/dishes/camaron-crunchy.webp"),
            Map.entry("panko", "/menu/dishes/panko.webp"),
            Map.entry("oniguiris surimi", "/menu/dishes/oniguiris.webp"),
            Map.entry("oniguiris atun chipotle", "/menu/dishes/oniguiris.webp"),
            Map.entry("pollo a la naranja", "/menu/dishes/pollo-naranja.webp"),
            Map.entry("miso", "/menu/dishes/miso.webp"),
            Map.entry("miso ramen", "/menu/dishes/miso.webp"),
            Map.entry("matcha latte", "/menu/dishes/matcha-latte.webp"),
            Map.entry("blue matcha", "/menu/dishes/blue-matcha.webp"));

    private MenuPhotoCatalog() {}

    static String reference(String storedReference, String productName) {
        if (storedReference != null && !storedReference.isBlank()) return storedReference;
        return PHOTOS.get(normalize(productName));
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }
}
