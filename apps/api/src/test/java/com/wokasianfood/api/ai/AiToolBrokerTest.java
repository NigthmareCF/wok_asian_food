package com.wokasianfood.api.ai;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class AiToolBrokerTest {
    @Test void arbitrarySqlIsRejectedBeforeDatabaseAccess() {
        AiToolBroker broker = new AiToolBroker(null);
        assertThrows(SecurityException.class, () -> broker.execute("SELECT * FROM wok.users"));
    }

    @Test void customerSpecificToolIsUnavailableUntilOwnershipChecksExist() {
        assertThrows(SecurityException.class, () -> new AiToolBroker(null).execute("getCustomerOrderStatus"));
    }
}
