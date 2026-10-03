package com.wokasianfood.api.identity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

class AuthDtosValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsWeakRegistrationPasswords() {
        var request = new AuthDtos.Register("cliente@example.test", "Cliente Demo", "solomayusculas123");

        assertFalse(validator.validate(request).isEmpty());
    }

    @Test
    void acceptsACompleteRegistrationPassword() {
        var request = new AuthDtos.Register("cliente@example.test", "Cliente Demo", "ClaveSegura!2026");

        assertTrue(validator.validate(request).isEmpty());
    }
}
