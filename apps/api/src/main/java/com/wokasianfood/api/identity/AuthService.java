package com.wokasianfood.api.identity;

import com.wokasianfood.api.identity.AuthDtos.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final ChallengeService challenges;
    private final AuthSecrets secrets;
    private final GoogleIdentityVerifier googleVerifier;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwords, TokenService tokens,
                       ChallengeService challenges, AuthSecrets secrets, GoogleIdentityVerifier googleVerifier) {
        this.jdbc = jdbc; this.passwords = passwords; this.tokens = tokens; this.challenges = challenges;
        this.secrets = secrets; this.googleVerifier = googleVerifier;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public void register(Register request) {
        String email = normalize(request.email());
        List<UUID> inserted = jdbc.query("""
            INSERT INTO wok.users (email, display_name, status) VALUES (?, ?, 'PENDING_VERIFICATION')
            ON CONFLICT (email) DO NOTHING RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), email, request.displayName().trim());
        if (inserted.isEmpty()) return; // Neutral result for existing accounts.
        UUID userId = inserted.getFirst();
        jdbc.update("INSERT INTO wok.user_credentials (user_id, password_hash) VALUES (?, ?)", userId,
                passwords.encode(request.password()));
        int roleCount = jdbc.update("""
            INSERT INTO wok.user_roles (user_id, role_id)
            SELECT ?, id FROM wok.roles WHERE code = 'CLIENT' AND active
            """, userId);
        if (roleCount != 1) throw new IllegalStateException("CLIENT role seed is missing");
        jdbc.update("INSERT INTO wok.customer_profiles (user_id, full_name) VALUES (?, ?)",
                userId, request.displayName().trim());
        issueChallenge(userId, email, "ACCOUNT_VERIFICATION");
    }

    @Transactional(noRollbackFor = AuthException.class)
    public void verify(Verify request) {
        String email = normalize(request.email());
        List<UUID> ids = jdbc.query("SELECT id FROM wok.users WHERE email = ? AND status = 'PENDING_VERIFICATION'",
                (rs, row) -> rs.getObject(1, UUID.class), email);
        if (ids.isEmpty()) throw new AuthException(400, "Código inválido o vencido.");
        UUID userId = ids.getFirst();
        consumeChallenge(userId, "ACCOUNT_VERIFICATION", request.code());
        jdbc.update("UPDATE wok.users SET status = 'ACTIVE', email_verified_at = now(), updated_at = now() WHERE id = ?", userId);
    }

    @Transactional
    public void requestReset(ResetRequest request) {
        String email = normalize(request.email());
        List<UUID> ids = jdbc.query("SELECT id FROM wok.users WHERE email = ? AND status = 'ACTIVE'",
                (rs, row) -> rs.getObject(1, UUID.class), email);
        if (ids.isEmpty()) return;
        Integer recent = jdbc.queryForObject("""
            SELECT count(*) FROM wok.verification_challenges
            WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND created_at > now() - interval '1 hour'
            """, Integer.class, ids.getFirst());
        if (recent != null && recent >= 3) return;
        issueChallenge(ids.getFirst(), email, "PASSWORD_RESET");
    }

    @Transactional(noRollbackFor = AuthException.class)
    public void completeReset(ResetComplete request) {
        String email = normalize(request.email());
        List<UUID> ids = jdbc.query("SELECT id FROM wok.users WHERE email = ? AND status = 'ACTIVE'",
                (rs, row) -> rs.getObject(1, UUID.class), email);
        if (ids.isEmpty()) throw new AuthException(400, "Código inválido o vencido.");
        UUID userId = ids.getFirst();
        consumeChallenge(userId, "PASSWORD_RESET", request.code());
        jdbc.update("""
            UPDATE wok.user_credentials SET password_hash = ?, password_changed_at = now(),
                credentials_updated_at = now(), must_change_password = false WHERE user_id = ?
            """, passwords.encode(request.newPassword()), userId);
        jdbc.update("UPDATE wok.users SET sessions_valid_after = now(), updated_at = now() WHERE id = ?", userId);
        jdbc.update("UPDATE wok.auth_sessions SET revoked_at = now(), revocation_reason = 'PASSWORD_RESET' WHERE user_id = ? AND revoked_at IS NULL", userId);
        jdbc.update("""
            UPDATE wok.refresh_tokens SET revoked_at = now()
            WHERE session_id IN (SELECT id FROM wok.auth_sessions WHERE user_id = ?) AND revoked_at IS NULL
            """, userId);
    }

    private void consumeChallenge(UUID userId, String purpose, String code) {
        List<ChallengeRow> rows = jdbc.query("""
            SELECT id, code_hash, attempt_count, max_attempts, expires_at
            FROM wok.verification_challenges
            WHERE user_id = ? AND purpose = ?
              AND consumed_at IS NULL AND revoked_at IS NULL
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE
            """, (rs, row) -> new ChallengeRow(rs.getObject("id", UUID.class), rs.getString("code_hash"),
                rs.getInt("attempt_count"), rs.getInt("max_attempts"), rs.getTimestamp("expires_at").toInstant()), userId, purpose);
        if (rows.isEmpty()) throw new AuthException(400, "Código inválido o vencido.");
        ChallengeRow challenge = rows.getFirst();
        if (challenge.expiresAt.isBefore(Instant.now()) || challenge.attempts >= challenge.maxAttempts)
            throw new AuthException(400, "Código inválido o vencido.");
        if (!challenges.matches(purpose, code, challenge.codeHash)) {
            jdbc.update("UPDATE wok.verification_challenges SET attempt_count = attempt_count + 1 WHERE id = ?", challenge.id);
            throw new AuthException(400, "Código inválido o vencido.");
        }
        jdbc.update("UPDATE wok.verification_challenges SET consumed_at = now() WHERE id = ?", challenge.id);
    }

    @Transactional(noRollbackFor = AuthException.class)
    public TokenPair login(Login request) {
        String email = normalize(request.email());
        String clientType = request.clientType() == null ? "WEB" : request.clientType();
        Integer failures = jdbc.queryForObject("""
            SELECT count(*) FROM wok.login_attempts WHERE identifier_used = ? AND success = false
            AND created_at > now() - interval '15 minutes'
            """, Integer.class, email);
        if (failures != null && failures >= 5) throw new AuthException(429, "Demasiados intentos. Intenta más tarde.");
        List<UserCredential> rows = jdbc.query("""
            SELECT u.id, u.status, c.password_hash FROM wok.users u
            JOIN wok.user_credentials c ON c.user_id = u.id WHERE u.email = ?
            """, (rs, row) -> new UserCredential(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getString("password_hash")), email);
        UserCredential user = rows.isEmpty() ? null : rows.getFirst();
        boolean passwordValid = passwords.matches(request.password(), user == null ? dummyHash : user.passwordHash);
        if (user == null || !passwordValid || !"ACTIVE".equals(user.status)) {
            jdbc.update("""
                INSERT INTO wok.login_attempts (user_id, identifier_used, success, failure_reason, client_type)
                VALUES (?, ?, false, 'INVALID_CREDENTIALS', ?)
                """, user == null ? null : user.id, email, clientType);
            throw new AuthException(401, "Credenciales inválidas.");
        }
        jdbc.update("INSERT INTO wok.login_attempts (user_id, identifier_used, success, client_type) VALUES (?, ?, true, ?)",
                user.id, email, clientType);
        return createSession(user.id, clientType);
    }

    @Transactional
    public TokenPair google(GoogleLogin request) {
        GoogleIdentityVerifier.VerifiedIdentity identity = googleVerifier.verify(request.idToken());
        if (identity.subject() == null || identity.subject().isBlank() || !identity.emailVerified())
            throw new AuthException(401, "Identidad externa inválida.");
        List<UUID> ids = jdbc.query("""
            SELECT u.id FROM wok.auth_identities ai JOIN wok.users u ON u.id = ai.user_id
            WHERE ai.provider = 'GOOGLE' AND ai.provider_subject = ? AND u.status = 'ACTIVE'
            """, (rs, row) -> rs.getObject(1, UUID.class), identity.subject());
        if (ids.isEmpty()) throw new AuthException(409, "Vincula tu cuenta WOK antes de ingresar con Google.");
        return createSession(ids.getFirst(), "WEB");
    }

    private TokenPair createSession(UUID userId, String clientType) {
        UUID sessionId = UUID.randomUUID();
        Instant expiry = tokens.refreshExpiry();
        jdbc.update("INSERT INTO wok.auth_sessions (id, user_id, client_type, expires_at) VALUES (?, ?, ?, ?)",
                sessionId, userId, clientType, java.sql.Timestamp.from(expiry));
        String refresh = tokens.refresh();
        jdbc.update("INSERT INTO wok.refresh_tokens (session_id, token_hash, expires_at) VALUES (?, ?, ?)",
                sessionId, tokens.hash(refresh), java.sql.Timestamp.from(expiry));
        return new TokenPair(tokens.access(userId, sessionId), refresh, "Bearer", tokens.accessSeconds());
    }

    @Transactional(noRollbackFor = AuthException.class)
    public TokenPair refresh(Refresh request) {
        String hash = tokens.hash(request.refreshToken());
        List<RefreshRow> rows = jdbc.query("""
            SELECT rt.id, rt.session_id, s.user_id, rt.used_at, rt.revoked_at,
                   rt.expires_at, s.revoked_at AS session_revoked_at, s.expires_at AS session_expires_at,
                   u.status, u.sessions_valid_after, s.created_at AS session_created_at
            FROM wok.refresh_tokens rt JOIN wok.auth_sessions s ON s.id = rt.session_id
            JOIN wok.users u ON u.id = s.user_id
            WHERE rt.token_hash = ? FOR UPDATE OF rt, s
            """, (rs, row) -> mapRefresh(rs), hash);
        if (rows.isEmpty()) throw new AuthException(401, "Sesión inválida.");
        RefreshRow current = rows.getFirst();
        if (current.usedAt != null) {
            jdbc.update("UPDATE wok.auth_sessions SET revoked_at = now(), revocation_reason = 'REFRESH_REUSE' WHERE id = ? AND revoked_at IS NULL", current.sessionId);
            jdbc.update("UPDATE wok.refresh_tokens SET revoked_at = now() WHERE session_id = ? AND revoked_at IS NULL", current.sessionId);
            jdbc.update("""
                INSERT INTO wok.security_events (actor_user_id, session_id, event_type, severity, details)
                VALUES (?, ?, 'REFRESH_TOKEN_REUSE', 'CRITICAL', '{}'::jsonb)
                """, current.userId, current.sessionId);
            throw new AuthException(401, "Sesión inválida.");
        }
        if (current.revokedAt != null || current.sessionRevokedAt != null ||
                current.expiresAt.isBefore(Instant.now()) || current.sessionExpiresAt.isBefore(Instant.now()) ||
                !"ACTIVE".equals(current.status) || current.sessionCreatedAt.isBefore(current.sessionsValidAfter))
            throw new AuthException(401, "Sesión inválida.");
        jdbc.update("UPDATE wok.refresh_tokens SET used_at = now() WHERE id = ?", current.id);
        String next = tokens.refresh();
        jdbc.update("INSERT INTO wok.refresh_tokens (session_id, token_hash, parent_token_id, expires_at) VALUES (?, ?, ?, ?)",
                current.sessionId, tokens.hash(next), current.id, java.sql.Timestamp.from(current.sessionExpiresAt));
        jdbc.update("UPDATE wok.auth_sessions SET last_activity_at = now() WHERE id = ?", current.sessionId);
        return new TokenPair(tokens.access(current.userId, current.sessionId), next, "Bearer", tokens.accessSeconds());
    }

    @Transactional
    public void logout(UUID sessionId, UUID userId) {
        jdbc.update("UPDATE wok.auth_sessions SET revoked_at = now(), revocation_reason = 'LOGOUT' WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
                sessionId, userId);
        jdbc.update("UPDATE wok.refresh_tokens SET revoked_at = now() WHERE session_id = ? AND revoked_at IS NULL", sessionId);
    }

    private void issueChallenge(UUID userId, String email, String purpose) {
        String code = challenges.createCode();
        jdbc.update("""
            UPDATE wok.verification_challenges SET revoked_at = now()
            WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND revoked_at IS NULL
            """, userId, purpose);
        jdbc.update("""
            INSERT INTO wok.verification_challenges (user_id, purpose, code_hash, destination_hash, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """, userId, purpose, challenges.hash(purpose, code), challenges.hash("destination", email),
                java.sql.Timestamp.from(Instant.now().plus(15, ChronoUnit.MINUTES)));
        EncryptedCode encrypted = encrypt(code);
        jdbc.update("""
            INSERT INTO wok.email_outbox (recipient, template_code, payload, status)
            VALUES (?, ?, jsonb_build_object('nonce', ?, 'ciphertext', ?), 'PENDING')
            """, email, purpose, encrypted.nonce, encrypted.ciphertext);
    }

    private EncryptedCode encrypt(String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(secrets.challengeKey());
            byte[] key = mac.doFinal("wok-email-outbox-encryption-v1".getBytes(StandardCharsets.UTF_8));
            byte[] nonce = new byte[12]; random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            return new EncryptedCode(Base64.getEncoder().encodeToString(nonce),
                    Base64.getEncoder().encodeToString(cipher.doFinal(code.getBytes(StandardCharsets.UTF_8))));
        } catch (Exception e) { throw new IllegalStateException("Email code encryption failed", e); }
    }

    private RefreshRow mapRefresh(ResultSet rs) throws SQLException {
        return new RefreshRow(rs.getObject("id", UUID.class), rs.getObject("session_id", UUID.class),
            rs.getObject("user_id", UUID.class), instant(rs, "used_at"), instant(rs, "revoked_at"),
            instant(rs, "expires_at"), instant(rs, "session_revoked_at"), instant(rs, "session_expires_at"),
            rs.getString("status"), instant(rs, "sessions_valid_after"), instant(rs, "session_created_at"));
    }

    private Instant instant(ResultSet rs, String field) throws SQLException {
        var value = rs.getTimestamp(field); return value == null ? null : value.toInstant();
    }

    private String normalize(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private record UserCredential(UUID id, String status, String passwordHash) {}
    private record ChallengeRow(UUID id, String codeHash, int attempts, int maxAttempts, Instant expiresAt) {}
    private record EncryptedCode(String nonce, String ciphertext) {}
    private record RefreshRow(UUID id, UUID sessionId, UUID userId, Instant usedAt, Instant revokedAt,
                              Instant expiresAt, Instant sessionRevokedAt, Instant sessionExpiresAt,
                              String status, Instant sessionsValidAfter, Instant sessionCreatedAt) {}
}
