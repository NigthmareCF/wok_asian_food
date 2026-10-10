package com.wokasianfood.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MenuPhotoCatalogTest {
    @Test
    void mapsKnownMenuNamesToBundledPhotos() {
        assertThat(MenuPhotoCatalog.reference(null, "Maki Camarón"))
                .isEqualTo("/menu/dishes/maki-camaron.webp");
        assertThat(MenuPhotoCatalog.reference(null, "Oniguiris Atún Chipotle"))
                .isEqualTo("/menu/dishes/oniguiris.webp");
        assertThat(MenuPhotoCatalog.reference(null, "Bebida sin foto"))
                .isNull();
    }

    @Test
    void storedCatalogReferenceTakesPrecedenceOverDisplayFallback() {
        assertThat(MenuPhotoCatalog.reference("https://cdn.example.test/custom.webp", "Panko"))
                .isEqualTo("https://cdn.example.test/custom.webp");
    }
}
