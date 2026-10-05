package com.wokasianfood.api.platform;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class GuatemalaPhoneTest {
    private static final Pattern REQUIRED = Pattern.compile("^" + GuatemalaPhone.PATTERN + "$");
    private static final Pattern OPTIONAL = Pattern.compile(GuatemalaPhone.OPTIONAL_PATTERN);

    @Test
    void acceptsEightDigitsGroupedInFoursWithOptionalGuatemalaPrefix() {
        assertTrue(REQUIRED.matcher("5555 0101").matches());
        assertTrue(REQUIRED.matcher("5555-0101").matches());
        assertTrue(REQUIRED.matcher("+502 5555-0101").matches());
        assertTrue(OPTIONAL.matcher("").matches());
    }

    @Test
    void rejectsUngroupedIncompleteAndOversizedNumbers() {
        assertFalse(REQUIRED.matcher("55550101").matches());
        assertFalse(REQUIRED.matcher("5555 010").matches());
        assertFalse(REQUIRED.matcher("+502 5555 0101 123").matches());
    }
}
