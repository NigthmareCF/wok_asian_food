package com.wokasianfood.api.identity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {
    private AuthDtos() {}

    public record Register(@Email @NotBlank String email, @NotBlank @Size(min = 2, max = 100) String displayName,
                           @NotBlank @Size(min = 12, max = 128) String password) {}
    public record Verify(@Email @NotBlank String email, @Pattern(regexp = "[0-9]{6}") String code) {}
    public record Login(@Email @NotBlank String email, @NotBlank String password,
                        @Pattern(regexp = "WEB|MOBILE|DESKTOP") String clientType) {}
    public record Refresh(@NotBlank String refreshToken) {}
    public record ResetRequest(@Email @NotBlank String email) {}
    public record ResetComplete(@Email @NotBlank String email, @Pattern(regexp = "[0-9]{6}") String code,
                                @NotBlank @Size(min = 12, max = 128) String newPassword) {}
    public record GoogleLogin(@NotBlank String idToken, @NotBlank @Size(max = 256) String nonce,
                              @Pattern(regexp = "WEB|MOBILE|DESKTOP") String clientType) {
        public GoogleLogin(String idToken, String nonce) { this(idToken, nonce, "WEB"); }
    }
    public record GoogleNonce(String nonce, int expiresInSeconds) {}
    public record TokenPair(String accessToken, String refreshToken, String tokenType, long expiresInSeconds) {}
    public record CurrentUser(UUID userId, String email, String displayName, String status,
                              List<String> roles, List<String> permissions) {}
    public record Message(String message) {}
}
