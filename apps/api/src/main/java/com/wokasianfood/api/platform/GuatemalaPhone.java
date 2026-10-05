package com.wokasianfood.api.platform;

/** Guatemala local phone numbers use eight digits displayed in groups of four. */
public final class GuatemalaPhone {
    public static final String PATTERN = "(?:\\+?502[ .-]?)?[0-9]{4}[ .-][0-9]{4}";
    public static final String OPTIONAL_PATTERN = "^$|^" + PATTERN + "$";

    private GuatemalaPhone() {}
}
