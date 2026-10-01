-- Reviewed initial cut from database/design/generate.py; immutable after deployment.
-- Full candidate schema is NOT the Flyway baseline.
CREATE SCHEMA wok;
SET search_path = wok, public;

CREATE TABLE users (
    id UUID CONSTRAINT nn_users_id NOT NULL DEFAULT gen_random_uuid(),
    email TEXT CONSTRAINT nn_users_email NOT NULL,
    phone TEXT,
    display_name TEXT CONSTRAINT nn_users_display_name NOT NULL,
    status TEXT CONSTRAINT nn_users_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    email_verified_at TIMESTAMPTZ,
    sessions_valid_after TIMESTAMPTZ CONSTRAINT nn_users_sessions_valid_after NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ CONSTRAINT nn_users_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_users_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_users_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_1 UNIQUE (email),
    CONSTRAINT ck_users_1 CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
    CONSTRAINT ck_users_2 CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
    CONSTRAINT ck_users_3 CHECK (row_version > 0)
);

CREATE TABLE user_credentials (
    id UUID CONSTRAINT nn_user_credentials_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_user_credentials_user_id NOT NULL,
    password_hash TEXT CONSTRAINT nn_user_credentials_password_hash NOT NULL,
    password_changed_at TIMESTAMPTZ CONSTRAINT nn_user_credentials_password_changed_at NOT NULL DEFAULT now(),
    must_change_password BOOLEAN CONSTRAINT nn_user_credentials_must_change_password NOT NULL DEFAULT false,
    credentials_updated_at TIMESTAMPTZ CONSTRAINT nn_user_credentials_credentials_updated_at NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ CONSTRAINT nn_user_credentials_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_credentials PRIMARY KEY (id),
    CONSTRAINT uq_user_credentials_1 UNIQUE (user_id),
    CONSTRAINT ck_user_credentials_1 CHECK (length(password_hash) >= 40)
);

CREATE TABLE auth_identities (
    id UUID CONSTRAINT nn_auth_identities_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_auth_identities_user_id NOT NULL,
    provider TEXT CONSTRAINT nn_auth_identities_provider NOT NULL,
    provider_subject TEXT CONSTRAINT nn_auth_identities_provider_subject NOT NULL,
    email_at_link TEXT,
    linked_at TIMESTAMPTZ CONSTRAINT nn_auth_identities_linked_at NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_auth_identities_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_auth_identities PRIMARY KEY (id),
    CONSTRAINT uq_auth_identities_1 UNIQUE (provider, provider_subject),
    CONSTRAINT ck_auth_identities_1 CHECK (provider IN ('GOOGLE', 'APPLE')),
    CONSTRAINT ck_auth_identities_2 CHECK (length(provider_subject) > 0)
);

CREATE TABLE roles (
    id UUID CONSTRAINT nn_roles_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_roles_code NOT NULL,
    name TEXT CONSTRAINT nn_roles_name NOT NULL,
    description TEXT,
    active BOOLEAN CONSTRAINT nn_roles_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_roles_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_roles_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_roles_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uq_roles_1 UNIQUE (code),
    CONSTRAINT ck_roles_1 CHECK (row_version > 0)
);

CREATE TABLE permissions (
    id UUID CONSTRAINT nn_permissions_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_permissions_code NOT NULL,
    description TEXT CONSTRAINT nn_permissions_description NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_permissions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_permissions PRIMARY KEY (id),
    CONSTRAINT uq_permissions_1 UNIQUE (code)
);

CREATE TABLE user_roles (
    id UUID CONSTRAINT nn_user_roles_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_user_roles_user_id NOT NULL,
    role_id UUID CONSTRAINT nn_user_roles_role_id NOT NULL,
    granted_by UUID,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_user_roles_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_roles PRIMARY KEY (id)
);

CREATE TABLE role_permissions (
    id UUID CONSTRAINT nn_role_permissions_id NOT NULL DEFAULT gen_random_uuid(),
    role_id UUID CONSTRAINT nn_role_permissions_role_id NOT NULL,
    permission_id UUID CONSTRAINT nn_role_permissions_permission_id NOT NULL,
    granted_by UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_role_permissions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permissions PRIMARY KEY (id),
    CONSTRAINT uq_role_permissions_1 UNIQUE (role_id, permission_id)
);

CREATE TABLE auth_sessions (
    id UUID CONSTRAINT nn_auth_sessions_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_auth_sessions_user_id NOT NULL,
    client_type TEXT CONSTRAINT nn_auth_sessions_client_type NOT NULL,
    device_name TEXT,
    device_identifier TEXT,
    ip_address INET,
    user_agent TEXT,
    last_activity_at TIMESTAMPTZ CONSTRAINT nn_auth_sessions_last_activity_at NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ CONSTRAINT nn_auth_sessions_expires_at NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_auth_sessions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_auth_sessions PRIMARY KEY (id),
    CONSTRAINT ck_auth_sessions_1 CHECK (client_type IN ('WEB', 'MOBILE', 'DESKTOP')),
    CONSTRAINT ck_auth_sessions_2 CHECK (expires_at > created_at)
);

CREATE TABLE refresh_tokens (
    id UUID CONSTRAINT nn_refresh_tokens_id NOT NULL DEFAULT gen_random_uuid(),
    session_id UUID CONSTRAINT nn_refresh_tokens_session_id NOT NULL,
    token_hash TEXT CONSTRAINT nn_refresh_tokens_token_hash NOT NULL,
    parent_token_id UUID,
    expires_at TIMESTAMPTZ CONSTRAINT nn_refresh_tokens_expires_at NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_refresh_tokens_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_1 UNIQUE (token_hash),
    CONSTRAINT uq_refresh_tokens_2 UNIQUE (parent_token_id),
    CONSTRAINT ck_refresh_tokens_1 CHECK (expires_at > created_at),
    CONSTRAINT ck_refresh_tokens_2 CHECK (length(token_hash) >= 40),
    CONSTRAINT ck_refresh_tokens_3 CHECK (parent_token_id IS NULL OR parent_token_id <> id)
);

CREATE TABLE login_attempts (
    id UUID CONSTRAINT nn_login_attempts_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID,
    identifier_used TEXT CONSTRAINT nn_login_attempts_identifier_used NOT NULL,
    success BOOLEAN CONSTRAINT nn_login_attempts_success NOT NULL,
    failure_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    client_type TEXT CONSTRAINT nn_login_attempts_client_type NOT NULL,
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_login_attempts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_login_attempts PRIMARY KEY (id),
    CONSTRAINT ck_login_attempts_1 CHECK (client_type IN ('WEB', 'MOBILE', 'DESKTOP')),
    CONSTRAINT ck_login_attempts_2 CHECK ((success AND failure_reason IS NULL) OR (NOT success AND failure_reason IS NOT NULL))
);

CREATE TABLE account_lockouts (
    id UUID CONSTRAINT nn_account_lockouts_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_account_lockouts_user_id NOT NULL,
    locked_until TIMESTAMPTZ CONSTRAINT nn_account_lockouts_locked_until NOT NULL,
    lock_reason TEXT CONSTRAINT nn_account_lockouts_lock_reason NOT NULL,
    unlocked_at TIMESTAMPTZ,
    unlocked_by UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_account_lockouts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_account_lockouts PRIMARY KEY (id),
    CONSTRAINT ck_account_lockouts_1 CHECK (locked_until > created_at)
);

CREATE TABLE verification_challenges (
    id UUID CONSTRAINT nn_verification_challenges_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_verification_challenges_user_id NOT NULL,
    purpose TEXT CONSTRAINT nn_verification_challenges_purpose NOT NULL,
    code_hash TEXT CONSTRAINT nn_verification_challenges_code_hash NOT NULL,
    destination_hash TEXT CONSTRAINT nn_verification_challenges_destination_hash NOT NULL,
    expires_at TIMESTAMPTZ CONSTRAINT nn_verification_challenges_expires_at NOT NULL,
    attempt_count INTEGER CONSTRAINT nn_verification_challenges_attempt_count NOT NULL DEFAULT 0,
    max_attempts INTEGER CONSTRAINT nn_verification_challenges_max_attempts NOT NULL DEFAULT 5,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_verification_challenges_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_verification_challenges PRIMARY KEY (id),
    CONSTRAINT ck_verification_challenges_1 CHECK (purpose IN ('ACCOUNT_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE', 'SENSITIVE_ACTION')),
    CONSTRAINT ck_verification_challenges_2 CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
    CONSTRAINT ck_verification_challenges_3 CHECK (expires_at > created_at),
    CONSTRAINT ck_verification_challenges_4 CHECK (length(code_hash) >= 40)
);

CREATE TABLE customer_profiles (
    id UUID CONSTRAINT nn_customer_profiles_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID,
    full_name TEXT CONSTRAINT nn_customer_profiles_full_name NOT NULL,
    guest_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_customer_profiles_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_customer_profiles_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_customer_profiles_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_customer_profiles PRIMARY KEY (id),
    CONSTRAINT uq_customer_profiles_1 UNIQUE (user_id),
    CONSTRAINT ck_customer_profiles_1 CHECK (row_version > 0),
    CONSTRAINT ck_customer_profiles_2 CHECK (user_id IS NULL OR guest_phone IS NULL)
);

CREATE TABLE guest_access_tokens (
    id UUID CONSTRAINT nn_guest_access_tokens_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID,
    scope TEXT CONSTRAINT nn_guest_access_tokens_scope NOT NULL,
    resource_id UUID CONSTRAINT nn_guest_access_tokens_resource_id NOT NULL,
    token_hash TEXT CONSTRAINT nn_guest_access_tokens_token_hash NOT NULL,
    expires_at TIMESTAMPTZ CONSTRAINT nn_guest_access_tokens_expires_at NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_guest_access_tokens_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_guest_access_tokens PRIMARY KEY (id),
    CONSTRAINT uq_guest_access_tokens_1 UNIQUE (token_hash),
    CONSTRAINT ck_guest_access_tokens_1 CHECK (scope IN ('RESERVATION', 'ORDER', 'TRACKING')),
    CONSTRAINT ck_guest_access_tokens_2 CHECK (length(token_hash) >= 40),
    CONSTRAINT ck_guest_access_tokens_3 CHECK (expires_at > created_at)
);

CREATE TABLE security_events (
    id UUID CONSTRAINT nn_security_events_id NOT NULL DEFAULT gen_random_uuid(),
    actor_user_id UUID,
    event_type TEXT CONSTRAINT nn_security_events_event_type NOT NULL,
    severity TEXT CONSTRAINT nn_security_events_severity NOT NULL,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    request_id UUID,
    correlation_id UUID,
    details JSONB CONSTRAINT nn_security_events_details NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_security_events_occurred_at NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ CONSTRAINT nn_security_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_security_events PRIMARY KEY (id),
    CONSTRAINT ck_security_events_1 CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))
);

CREATE TABLE currencies (
    id UUID CONSTRAINT nn_currencies_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_currencies_code NOT NULL,
    name TEXT CONSTRAINT nn_currencies_name NOT NULL,
    minor_units INTEGER CONSTRAINT nn_currencies_minor_units NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ CONSTRAINT nn_currencies_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_currencies PRIMARY KEY (id),
    CONSTRAINT uq_currencies_1 UNIQUE (code),
    CONSTRAINT ck_currencies_1 CHECK (code ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_currencies_2 CHECK (minor_units BETWEEN 0 AND 2)
);

CREATE TABLE service_capabilities (
    id UUID CONSTRAINT nn_service_capabilities_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_service_capabilities_code NOT NULL,
    status TEXT CONSTRAINT nn_service_capabilities_status NOT NULL DEFAULT 'DISABLED',
    reason TEXT,
    effective_from TIMESTAMPTZ CONSTRAINT nn_service_capabilities_effective_from NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    changed_by UUID,
    policy_version INTEGER CONSTRAINT nn_service_capabilities_policy_version NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ CONSTRAINT nn_service_capabilities_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_service_capabilities_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_service_capabilities_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_service_capabilities PRIMARY KEY (id),
    CONSTRAINT uq_service_capabilities_1 UNIQUE (code),
    CONSTRAINT ck_service_capabilities_1 CHECK (code IN ('LOCAL', 'RESERVATIONS', 'DINE_IN_ONLINE', 'PICKUP', 'DELIVERY', 'ONLINE_ORDERS', 'MESSAGING', 'ONLINE_PAYMENTS', 'PRODUCTION')),
    CONSTRAINT ck_service_capabilities_2 CHECK (status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED')),
    CONSTRAINT ck_service_capabilities_3 CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT ck_service_capabilities_4 CHECK (policy_version > 0),
    CONSTRAINT ck_service_capabilities_5 CHECK (row_version > 0)
);

CREATE TABLE service_capability_events (
    id UUID CONSTRAINT nn_service_capability_events_id NOT NULL DEFAULT gen_random_uuid(),
    capability_id UUID CONSTRAINT nn_service_capability_events_capability_id NOT NULL,
    previous_status TEXT CONSTRAINT nn_service_capability_events_previous_status NOT NULL,
    new_status TEXT CONSTRAINT nn_service_capability_events_new_status NOT NULL,
    reason TEXT CONSTRAINT nn_service_capability_events_reason NOT NULL,
    actor_user_id UUID CONSTRAINT nn_service_capability_events_actor_user_id NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_service_capability_events_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_service_capability_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_service_capability_events PRIMARY KEY (id),
    CONSTRAINT ck_service_capability_events_1 CHECK (previous_status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED')),
    CONSTRAINT ck_service_capability_events_2 CHECK (new_status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED'))
);

CREATE TABLE business_hours (
    id UUID CONSTRAINT nn_business_hours_id NOT NULL DEFAULT gen_random_uuid(),
    service_type TEXT CONSTRAINT nn_business_hours_service_type NOT NULL,
    weekday INTEGER CONSTRAINT nn_business_hours_weekday NOT NULL,
    opens_at TIME CONSTRAINT nn_business_hours_opens_at NOT NULL,
    closes_at TIME CONSTRAINT nn_business_hours_closes_at NOT NULL,
    timezone_name TEXT CONSTRAINT nn_business_hours_timezone_name NOT NULL,
    active BOOLEAN CONSTRAINT nn_business_hours_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_business_hours_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_business_hours_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_business_hours_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_business_hours PRIMARY KEY (id),
    CONSTRAINT ck_business_hours_1 CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT ck_business_hours_2 CHECK (closes_at > opens_at),
    CONSTRAINT ck_business_hours_3 CHECK (service_type IN ('RESTAURANT', 'DINE_IN', 'PICKUP', 'DELIVERY', 'ONLINE')),
    CONSTRAINT ck_business_hours_4 CHECK (row_version > 0)
);

CREATE TABLE outbox_events (
    id UUID CONSTRAINT nn_outbox_events_id NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type TEXT CONSTRAINT nn_outbox_events_aggregate_type NOT NULL,
    aggregate_id UUID CONSTRAINT nn_outbox_events_aggregate_id NOT NULL,
    aggregate_version INTEGER CONSTRAINT nn_outbox_events_aggregate_version NOT NULL,
    event_type TEXT CONSTRAINT nn_outbox_events_event_type NOT NULL,
    payload JSONB CONSTRAINT nn_outbox_events_payload NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_outbox_events_occurred_at NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempt_count INTEGER CONSTRAINT nn_outbox_events_attempt_count NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ CONSTRAINT nn_outbox_events_next_attempt_at NOT NULL DEFAULT now(),
    claimed_until TIMESTAMPTZ,
    claimed_by TEXT,
    last_error TEXT,
    request_id UUID,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_outbox_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_outbox_events PRIMARY KEY (id),
    CONSTRAINT ck_outbox_events_1 CHECK (aggregate_version > 0 AND attempt_count >= 0)
);

CREATE TABLE email_outbox (
    id UUID CONSTRAINT nn_email_outbox_id NOT NULL DEFAULT gen_random_uuid(),
    recipient TEXT CONSTRAINT nn_email_outbox_recipient NOT NULL,
    template_code TEXT CONSTRAINT nn_email_outbox_template_code NOT NULL,
    payload JSONB CONSTRAINT nn_email_outbox_payload NOT NULL,
    status TEXT CONSTRAINT nn_email_outbox_status NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER CONSTRAINT nn_email_outbox_attempt_count NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ CONSTRAINT nn_email_outbox_next_attempt_at NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    provider_message_id TEXT,
    last_error TEXT,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_email_outbox_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_outbox PRIMARY KEY (id),
    CONSTRAINT ck_email_outbox_1 CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD')),
    CONSTRAINT ck_email_outbox_2 CHECK (attempt_count >= 0)
);

CREATE TABLE idempotency_keys (
    id UUID CONSTRAINT nn_idempotency_keys_id NOT NULL DEFAULT gen_random_uuid(),
    principal_scope TEXT CONSTRAINT nn_idempotency_keys_principal_scope NOT NULL,
    operation TEXT CONSTRAINT nn_idempotency_keys_operation NOT NULL,
    key TEXT CONSTRAINT nn_idempotency_keys_key NOT NULL,
    request_hash TEXT CONSTRAINT nn_idempotency_keys_request_hash NOT NULL,
    status TEXT CONSTRAINT nn_idempotency_keys_status NOT NULL DEFAULT 'IN_PROGRESS',
    resource_type TEXT,
    resource_id UUID,
    response_code INTEGER,
    response_snapshot JSONB,
    locked_until TIMESTAMPTZ CONSTRAINT nn_idempotency_keys_locked_until NOT NULL,
    expires_at TIMESTAMPTZ CONSTRAINT nn_idempotency_keys_expires_at NOT NULL,
    completed_at TIMESTAMPTZ,
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_idempotency_keys_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_idempotency_keys PRIMARY KEY (id),
    CONSTRAINT uq_idempotency_keys_1 UNIQUE (principal_scope, operation, key),
    CONSTRAINT ck_idempotency_keys_1 CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    CONSTRAINT ck_idempotency_keys_2 CHECK (expires_at > created_at),
    CONSTRAINT ck_idempotency_keys_3 CHECK (response_code IS NULL OR response_code BETWEEN 100 AND 599)
);

CREATE TABLE audit_logs (
    id UUID CONSTRAINT nn_audit_logs_id NOT NULL DEFAULT gen_random_uuid(),
    actor_user_id UUID,
    action TEXT CONSTRAINT nn_audit_logs_action NOT NULL,
    entity_type TEXT CONSTRAINT nn_audit_logs_entity_type NOT NULL,
    entity_id UUID CONSTRAINT nn_audit_logs_entity_id NOT NULL,
    before_data JSONB,
    after_data JSONB,
    reason TEXT,
    result TEXT CONSTRAINT nn_audit_logs_result NOT NULL,
    request_id UUID,
    correlation_id UUID,
    actor_label_snapshot TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_audit_logs_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_logs PRIMARY KEY (id),
    CONSTRAINT ck_audit_logs_1 CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED'))
);
ALTER TABLE users ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE users ADD CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE user_credentials ADD CONSTRAINT fk_user_credentials_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE auth_identities ADD CONSTRAINT fk_auth_identities_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE roles ADD CONSTRAINT fk_roles_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE roles ADD CONSTRAINT fk_roles_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_role_id FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_role_id FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_permission_id FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE auth_sessions ADD CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE auth_sessions ADD CONSTRAINT fk_auth_sessions_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_session_id FOREIGN KEY (session_id) REFERENCES auth_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_parent_token_id FOREIGN KEY (parent_token_id) REFERENCES refresh_tokens (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE login_attempts ADD CONSTRAINT fk_login_attempts_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE account_lockouts ADD CONSTRAINT fk_account_lockouts_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE account_lockouts ADD CONSTRAINT fk_account_lockouts_unlocked_by FOREIGN KEY (unlocked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE verification_challenges ADD CONSTRAINT fk_verification_challenges_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE guest_access_tokens ADD CONSTRAINT fk_guest_access_tokens_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_session_id FOREIGN KEY (session_id) REFERENCES auth_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capability_events ADD CONSTRAINT fk_service_capability_events_capability_id FOREIGN KEY (capability_id) REFERENCES service_capabilities (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capability_events ADD CONSTRAINT fk_service_capability_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE business_hours ADD CONSTRAINT fk_business_hours_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE business_hours ADD CONSTRAINT fk_business_hours_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX ix_auth_identities_1 ON auth_identities (user_id);
CREATE UNIQUE INDEX ux_user_roles_1 ON user_roles (user_id, role_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_user_roles_2 ON user_roles (user_id);
CREATE INDEX ix_user_roles_3 ON user_roles (role_id);
CREATE INDEX ix_role_permissions_1 ON role_permissions (permission_id);
CREATE INDEX ix_auth_sessions_1 ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions_2 ON auth_sessions (user_id);
CREATE INDEX ix_refresh_tokens_1 ON refresh_tokens (session_id);
CREATE INDEX ix_login_attempts_1 ON login_attempts (identifier_used, created_at, id);
CREATE INDEX ix_login_attempts_2 ON login_attempts (ip_address, created_at);
CREATE INDEX ix_login_attempts_3 ON login_attempts (user_id);
CREATE INDEX ix_account_lockouts_1 ON account_lockouts (user_id, locked_until) WHERE unlocked_at IS NULL;
CREATE INDEX ix_account_lockouts_2 ON account_lockouts (user_id);
CREATE INDEX ix_verification_challenges_1 ON verification_challenges (user_id, purpose, expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX ix_verification_challenges_2 ON verification_challenges (user_id);
CREATE INDEX ix_guest_access_tokens_1 ON guest_access_tokens (customer_id);
CREATE INDEX ix_security_events_1 ON security_events (occurred_at, id);
CREATE INDEX ix_security_events_2 ON security_events (session_id);
CREATE INDEX ix_service_capabilities_1 ON service_capabilities (changed_by);
CREATE INDEX ix_service_capability_events_1 ON service_capability_events (capability_id);
CREATE INDEX ix_outbox_events_1 ON outbox_events (next_attempt_at, occurred_at, id) WHERE published_at IS NULL;
CREATE INDEX ix_idempotency_keys_1 ON idempotency_keys (expires_at);
CREATE INDEX ix_audit_logs_1 ON audit_logs (entity_type, entity_id, created_at, id);
CREATE INDEX ix_audit_logs_2 ON audit_logs (request_id);
