package com.wokasianfood.api.identity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {
    private static final String PASSWORD_PATTERN = "^(?=\\S{12,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).*$";

    private AuthDtos() {}

    public record Register(@Email @NotBlank @Size(max = 254) String email, @NotBlank @Size(min = 2, max = 100) String displayName,
                           @NotBlank @Pattern(regexp = PASSWORD_PATTERN) String password) {}
    public record Verify(@Email @NotBlank @Size(max = 254) String email, @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {}
    public record Login(@Email @NotBlank @Size(max = 254) String email, @NotBlank @Size(max = 128) String password,
                        @NotBlank @Pattern(regexp = "WEB|MOBILE|DESKTOP") String clientType) {}
    public record Refresh(@NotBlank String refreshToken) {}
    public record ResetRequest(@Email @NotBlank @Size(max = 254) String email) {}
    public record ResetComplete(@Email @NotBlank @Size(max = 254) String email, @NotBlank @Pattern(regexp = "[0-9]{6}") String code,
                                @NotBlank @Pattern(regexp = PASSWORD_PATTERN) String newPassword) {}
    public record GoogleLogin(@NotBlank String idToken) {}
    public record TokenPair(String accessToken, String refreshToken, String tokenType, long expiresInSeconds) {}
    public record CurrentUser(UUID userId, String email, String displayName, String status,
                              List<String> roles, List<String> permissions) {}
    public record Message(String message) {}
}
