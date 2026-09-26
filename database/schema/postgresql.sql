-- WOK ASIAN FOOD — borrador declarativo PostgreSQL 18. No ejecutar en servidores.
-- Fuente: database/design/generate.py. Invariantes adicionales: docs/database/design-decisions.md.
BEGIN;
CREATE SCHEMA wok;
SET search_path = wok, public;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Identidad de cuenta; nunca contiene contraseñas.
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
COMMENT ON TABLE users IS 'Identidad de cuenta; nunca contiene contraseñas.';

-- Credencial local separada de la identidad.
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
COMMENT ON TABLE user_credentials IS 'Credencial local separada de la identidad.';

-- Identidad externa vinculada mediante subject estable; el correo no vincula cuentas por sí solo.
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
COMMENT ON TABLE auth_identities IS 'Identidad externa vinculada mediante subject estable; el correo no vincula cuentas por sí solo.';

-- Roles operativos y de cliente.
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
COMMENT ON TABLE roles IS 'Roles operativos y de cliente.';

-- Permisos atómicos por recurso y acción.
CREATE TABLE permissions (
    id UUID CONSTRAINT nn_permissions_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_permissions_code NOT NULL,
    description TEXT CONSTRAINT nn_permissions_description NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_permissions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_permissions PRIMARY KEY (id),
    CONSTRAINT uq_permissions_1 UNIQUE (code)
 );
COMMENT ON TABLE permissions IS 'Permisos atómicos por recurso y acción.';

-- Asignaciones multirrol con revocación histórica.
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
COMMENT ON TABLE user_roles IS 'Asignaciones multirrol con revocación histórica.';

-- Conjunto de permisos vigente por rol.
CREATE TABLE role_permissions (
    id UUID CONSTRAINT nn_role_permissions_id NOT NULL DEFAULT gen_random_uuid(),
    role_id UUID CONSTRAINT nn_role_permissions_role_id NOT NULL,
    permission_id UUID CONSTRAINT nn_role_permissions_permission_id NOT NULL,
    granted_by UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_role_permissions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permissions PRIMARY KEY (id),
    CONSTRAINT uq_role_permissions_1 UNIQUE (role_id, permission_id)
 );
COMMENT ON TABLE role_permissions IS 'Conjunto de permisos vigente por rol.';

-- Sesión por dispositivo; admite sesiones simultáneas.
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
COMMENT ON TABLE auth_sessions IS 'Sesión por dispositivo; admite sesiones simultáneas.';

-- Hash de token rotativo; familia definida por sesión.
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
COMMENT ON TABLE refresh_tokens IS 'Hash de token rotativo; familia definida por sesión.';

-- Historial de intentos, incluso identificadores sin cuenta.
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
COMMENT ON TABLE login_attempts IS 'Historial de intentos, incluso identificadores sin cuenta.';

-- Episodios de bloqueo temporal y desbloqueo administrativo.
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
COMMENT ON TABLE account_lockouts IS 'Episodios de bloqueo temporal y desbloqueo administrativo.';

-- PIN protegido con hash autenticado; expiración y uso único.
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
COMMENT ON TABLE verification_challenges IS 'PIN protegido con hash autenticado; expiración y uso único.';

-- Token opaco y acotado a una operación de invitado.
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
COMMENT ON TABLE guest_access_tokens IS 'Token opaco y acotado a una operación de invitado.';

-- Eventos de seguridad independientes de auditoría funcional.
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
COMMENT ON TABLE security_events IS 'Eventos de seguridad independientes de auditoría funcional.';

-- Perfil de cliente con o sin cuenta vinculada.
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
COMMENT ON TABLE customer_profiles IS 'Perfil de cliente con o sin cuenta vinculada.';

-- Perfil laboral; los permisos se resuelven mediante RBAC.
CREATE TABLE employee_profiles (
    id UUID CONSTRAINT nn_employee_profiles_id NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID CONSTRAINT nn_employee_profiles_user_id NOT NULL,
    employee_code TEXT CONSTRAINT nn_employee_profiles_employee_code NOT NULL,
    hired_on DATE CONSTRAINT nn_employee_profiles_hired_on NOT NULL,
    ended_on DATE,
    active BOOLEAN CONSTRAINT nn_employee_profiles_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_employee_profiles_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_employee_profiles_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_employee_profiles_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_employee_profiles PRIMARY KEY (id),
    CONSTRAINT uq_employee_profiles_1 UNIQUE (user_id),
    CONSTRAINT uq_employee_profiles_2 UNIQUE (employee_code),
    CONSTRAINT ck_employee_profiles_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE employee_profiles IS 'Perfil laboral; los permisos se resuelven mediante RBAC.';

-- Direcciones reutilizables; entregas guardan copia histórica.
CREATE TABLE customer_addresses (
    id UUID CONSTRAINT nn_customer_addresses_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_customer_addresses_customer_id NOT NULL,
    label TEXT CONSTRAINT nn_customer_addresses_label NOT NULL,
    address_text TEXT CONSTRAINT nn_customer_addresses_address_text NOT NULL,
    recipient_name TEXT CONSTRAINT nn_customer_addresses_recipient_name NOT NULL,
    recipient_phone TEXT CONSTRAINT nn_customer_addresses_recipient_phone NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    instructions TEXT,
    active BOOLEAN CONSTRAINT nn_customer_addresses_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_customer_addresses_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_customer_addresses_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_customer_addresses_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_customer_addresses PRIMARY KEY (id),
    CONSTRAINT ck_customer_addresses_1 CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_customer_addresses_2 CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_customer_addresses_3 CHECK (row_version > 0),
    CONSTRAINT ck_customer_addresses_4 CHECK (latitude::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_customer_addresses_5 CHECK (longitude::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE customer_addresses IS 'Direcciones reutilizables; entregas guardan copia histórica.';

-- Incidentes documentados sin sustituir restricciones.
CREATE TABLE customer_incidents (
    id UUID CONSTRAINT nn_customer_incidents_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_customer_incidents_customer_id NOT NULL,
    order_id UUID,
    description TEXT CONSTRAINT nn_customer_incidents_description NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_customer_incidents_occurred_at NOT NULL,
    created_by UUID CONSTRAINT nn_customer_incidents_created_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_customer_incidents_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_customer_incidents PRIMARY KEY (id)
 );
COMMENT ON TABLE customer_incidents IS 'Incidentes documentados sin sustituir restricciones.';

-- Restricciones temporales revocables.
CREATE TABLE customer_restrictions (
    id UUID CONSTRAINT nn_customer_restrictions_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_customer_restrictions_customer_id NOT NULL,
    restriction_type TEXT CONSTRAINT nn_customer_restrictions_restriction_type NOT NULL,
    reason TEXT CONSTRAINT nn_customer_restrictions_reason NOT NULL,
    created_by UUID CONSTRAINT nn_customer_restrictions_created_by NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked_by UUID,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_customer_restrictions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_customer_restrictions PRIMARY KEY (id),
    CONSTRAINT ck_customer_restrictions_1 CHECK (restriction_type IN ('NO_DELIVERY', 'PREPAY_ONLY', 'NO_RESERVATIONS', 'NO_MESSAGING', 'FULL_BLOCK', 'REQUIRES_AUTH')),
    CONSTRAINT ck_customer_restrictions_2 CHECK (expires_at IS NULL OR expires_at > created_at)
 );
COMMENT ON TABLE customer_restrictions IS 'Restricciones temporales revocables.';

-- Turnos planificados por intervalo real.
CREATE TABLE staff_schedules (
    id UUID CONSTRAINT nn_staff_schedules_id NOT NULL DEFAULT gen_random_uuid(),
    employee_id UUID CONSTRAINT nn_staff_schedules_employee_id NOT NULL,
    starts_at TIMESTAMPTZ CONSTRAINT nn_staff_schedules_starts_at NOT NULL,
    ends_at TIMESTAMPTZ CONSTRAINT nn_staff_schedules_ends_at NOT NULL,
    preparation_area_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_staff_schedules_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_staff_schedules_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_staff_schedules_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_staff_schedules PRIMARY KEY (id),
    CONSTRAINT ck_staff_schedules_1 CHECK (ends_at > starts_at),
    CONSTRAINT ck_staff_schedules_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE staff_schedules IS 'Turnos planificados por intervalo real.';

-- Ausencias y cambios; referencia opcional al turno afectado.
CREATE TABLE schedule_exceptions (
    id UUID CONSTRAINT nn_schedule_exceptions_id NOT NULL DEFAULT gen_random_uuid(),
    employee_id UUID CONSTRAINT nn_schedule_exceptions_employee_id NOT NULL,
    schedule_id UUID,
    exception_type TEXT CONSTRAINT nn_schedule_exceptions_exception_type NOT NULL,
    starts_at TIMESTAMPTZ CONSTRAINT nn_schedule_exceptions_starts_at NOT NULL,
    ends_at TIMESTAMPTZ CONSTRAINT nn_schedule_exceptions_ends_at NOT NULL,
    reason TEXT CONSTRAINT nn_schedule_exceptions_reason NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_schedule_exceptions_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_schedule_exceptions_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_schedule_exceptions_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_schedule_exceptions PRIMARY KEY (id),
    CONSTRAINT ck_schedule_exceptions_1 CHECK (ends_at > starts_at),
    CONSTRAINT ck_schedule_exceptions_2 CHECK (exception_type IN ('ABSENCE', 'LEAVE', 'EXTRA_TIME', 'CHANGE')),
    CONSTRAINT ck_schedule_exceptions_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE schedule_exceptions IS 'Ausencias y cambios; referencia opcional al turno afectado.';

-- Mesas físicas; estado actual como proyección operativa.
CREATE TABLE dining_tables (
    id UUID CONSTRAINT nn_dining_tables_id NOT NULL DEFAULT gen_random_uuid(),
    name TEXT CONSTRAINT nn_dining_tables_name NOT NULL,
    capacity INTEGER CONSTRAINT nn_dining_tables_capacity NOT NULL,
    zone TEXT CONSTRAINT nn_dining_tables_zone NOT NULL,
    active BOOLEAN CONSTRAINT nn_dining_tables_active NOT NULL DEFAULT true,
    current_status TEXT CONSTRAINT nn_dining_tables_current_status NOT NULL DEFAULT 'FREE',
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_tables_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_dining_tables_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_dining_tables_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_dining_tables PRIMARY KEY (id),
    CONSTRAINT uq_dining_tables_1 UNIQUE (name),
    CONSTRAINT ck_dining_tables_1 CHECK (capacity > 0),
    CONSTRAINT ck_dining_tables_2 CHECK (current_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE')),
    CONSTRAINT ck_dining_tables_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE dining_tables IS 'Mesas físicas; estado actual como proyección operativa.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE dining_table_status_history (
    id UUID CONSTRAINT nn_dining_table_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    dining_table_id UUID CONSTRAINT nn_dining_table_status_history_dining_table_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_dining_table_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_dining_table_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_table_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_dining_table_status_history PRIMARY KEY (id),
    CONSTRAINT ck_dining_table_status_history_1 CHECK (to_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE'))
 );
COMMENT ON TABLE dining_table_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Reserva sin obligación de elegir mesa física.
CREATE TABLE reservations (
    id UUID CONSTRAINT nn_reservations_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_reservations_customer_id NOT NULL,
    party_size INTEGER CONSTRAINT nn_reservations_party_size NOT NULL,
    reservation_at TIMESTAMPTZ CONSTRAINT nn_reservations_reservation_at NOT NULL,
    ends_at TIMESTAMPTZ CONSTRAINT nn_reservations_ends_at NOT NULL,
    requested_at TIMESTAMPTZ CONSTRAINT nn_reservations_requested_at NOT NULL DEFAULT now(),
    status TEXT CONSTRAINT nn_reservations_status NOT NULL DEFAULT 'REQUESTED',
    notes TEXT,
    arrival_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservations_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_reservations_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_reservations_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_reservations PRIMARY KEY (id),
    CONSTRAINT ck_reservations_1 CHECK (party_size > 0),
    CONSTRAINT ck_reservations_2 CHECK (ends_at > reservation_at),
    CONSTRAINT ck_reservations_3 CHECK (status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT ck_reservations_4 CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
    CONSTRAINT ck_reservations_5 CHECK (row_version > 0)
 );
COMMENT ON TABLE reservations IS 'Reserva sin obligación de elegir mesa física.';

-- Resultado histórico de capacidad y condiciones evaluadas por backend.
CREATE TABLE reservation_evaluations (
    id UUID CONSTRAINT nn_reservation_evaluations_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID,
    request_id UUID CONSTRAINT nn_reservation_evaluations_request_id NOT NULL,
    decision TEXT CONSTRAINT nn_reservation_evaluations_decision NOT NULL,
    reason_codes JSONB CONSTRAINT nn_reservation_evaluations_reason_codes NOT NULL,
    alternatives JSONB CONSTRAINT nn_reservation_evaluations_alternatives NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB CONSTRAINT nn_reservation_evaluations_conditions NOT NULL DEFAULT '[]'::jsonb,
    estimated_occupancy_minutes INTEGER CONSTRAINT nn_reservation_evaluations_estimated_occupancy_minutes NOT NULL,
    estimated_ready_at TIMESTAMPTZ,
    public_message TEXT CONSTRAINT nn_reservation_evaluations_public_message NOT NULL,
    policy_version TEXT CONSTRAINT nn_reservation_evaluations_policy_version NOT NULL,
    evaluated_at TIMESTAMPTZ CONSTRAINT nn_reservation_evaluations_evaluated_at NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_evaluations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_evaluations PRIMARY KEY (id),
    CONSTRAINT ck_reservation_evaluations_1 CHECK (decision IN ('ACCEPT', 'ACCEPT_WITH_CONDITIONS', 'SUGGEST_OTHER_TIME', 'REQUIRES_HUMAN_APPROVAL', 'REJECT')),
    CONSTRAINT ck_reservation_evaluations_2 CHECK (estimated_occupancy_minutes > 0)
 );
COMMENT ON TABLE reservation_evaluations IS 'Resultado histórico de capacidad y condiciones evaluadas por backend.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE reservation_status_history (
    id UUID CONSTRAINT nn_reservation_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID CONSTRAINT nn_reservation_status_history_reservation_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_reservation_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_reservation_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_status_history PRIMARY KEY (id),
    CONSTRAINT ck_reservation_status_history_1 CHECK (to_status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'))
 );
COMMENT ON TABLE reservation_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Asignación de una o varias mesas; intervalo bloqueado contra solapes.
CREATE TABLE reservation_table_assignments (
    id UUID CONSTRAINT nn_reservation_table_assignments_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID CONSTRAINT nn_reservation_table_assignments_reservation_id NOT NULL,
    table_id UUID CONSTRAINT nn_reservation_table_assignments_table_id NOT NULL,
    occupied_period TSTZRANGE CONSTRAINT nn_reservation_table_assignments_occupied_period NOT NULL,
    released_at TIMESTAMPTZ,
    assigned_by UUID CONSTRAINT nn_reservation_table_assignments_assigned_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_reservation_table_assignments_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_reservation_table_assignments PRIMARY KEY (id),
    CONSTRAINT ck_reservation_table_assignments_1 CHECK (NOT isempty(occupied_period) AND NOT lower_inf(occupied_period) AND NOT upper_inf(occupied_period) AND lower_inc(occupied_period) AND NOT upper_inc(occupied_period))
 );
COMMENT ON TABLE reservation_table_assignments IS 'Asignación de una o varias mesas; intervalo bloqueado contra solapes.';

-- Atención presencial agrupa mesas, pedidos y pool facturable sin perder historia.
CREATE TABLE dining_sessions (
    id UUID CONSTRAINT nn_dining_sessions_id NOT NULL DEFAULT gen_random_uuid(),
    reservation_id UUID,
    customer_id UUID,
    status TEXT CONSTRAINT nn_dining_sessions_status NOT NULL DEFAULT 'OPEN',
    party_size INTEGER CONSTRAINT nn_dining_sessions_party_size NOT NULL,
    opened_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_opened_at NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    estimated_end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_dining_sessions_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_dining_sessions_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_dining_sessions PRIMARY KEY (id),
    CONSTRAINT ck_dining_sessions_1 CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
    CONSTRAINT ck_dining_sessions_2 CHECK (party_size > 0),
    CONSTRAINT ck_dining_sessions_3 CHECK (closed_at IS NULL OR closed_at >= opened_at),
    CONSTRAINT ck_dining_sessions_4 CHECK (row_version > 0)
 );
COMMENT ON TABLE dining_sessions IS 'Atención presencial agrupa mesas, pedidos y pool facturable sin perder historia.';

-- Historia de mesas asignadas a una sesión de consumo.
CREATE TABLE dining_session_tables (
    id UUID CONSTRAINT nn_dining_session_tables_id NOT NULL DEFAULT gen_random_uuid(),
    dining_session_id UUID CONSTRAINT nn_dining_session_tables_dining_session_id NOT NULL,
    table_id UUID CONSTRAINT nn_dining_session_tables_table_id NOT NULL,
    assigned_at TIMESTAMPTZ CONSTRAINT nn_dining_session_tables_assigned_at NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    assigned_by UUID CONSTRAINT nn_dining_session_tables_assigned_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_dining_session_tables_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_dining_session_tables PRIMARY KEY (id),
    CONSTRAINT ck_dining_session_tables_1 CHECK (released_at IS NULL OR released_at > assigned_at)
 );
COMMENT ON TABLE dining_session_tables IS 'Historia de mesas asignadas a una sesión de consumo.';

-- Clasificación estable del catálogo físico.
CREATE TABLE item_types (
    id UUID CONSTRAINT nn_item_types_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_item_types_code NOT NULL,
    name TEXT CONSTRAINT nn_item_types_name NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_item_types_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_item_types PRIMARY KEY (id),
    CONSTRAINT uq_item_types_1 UNIQUE (code)
 );
COMMENT ON TABLE item_types IS 'Clasificación estable del catálogo físico.';

-- Unidades canónicas y conversión dentro de una dimensión.
CREATE TABLE units (
    id UUID CONSTRAINT nn_units_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_units_code NOT NULL,
    name TEXT CONSTRAINT nn_units_name NOT NULL,
    dimension TEXT CONSTRAINT nn_units_dimension NOT NULL,
    factor_to_base NUMERIC(18,6) CONSTRAINT nn_units_factor_to_base NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_units_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_units PRIMARY KEY (id),
    CONSTRAINT uq_units_1 UNIQUE (code),
    CONSTRAINT ck_units_1 CHECK (factor_to_base > 0),
    CONSTRAINT ck_units_2 CHECK (dimension IN ('MASS', 'VOLUME', 'COUNT')),
    CONSTRAINT ck_units_3 CHECK (factor_to_base::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE units IS 'Unidades canónicas y conversión dentro de una dimensión.';

-- Catálogo único de insumos, productos, preparaciones y consumibles.
CREATE TABLE items (
    id UUID CONSTRAINT nn_items_id NOT NULL DEFAULT gen_random_uuid(),
    sku TEXT CONSTRAINT nn_items_sku NOT NULL,
    name TEXT CONSTRAINT nn_items_name NOT NULL,
    description TEXT,
    item_type_id UUID CONSTRAINT nn_items_item_type_id NOT NULL,
    base_unit_id UUID CONSTRAINT nn_items_base_unit_id NOT NULL,
    track_inventory BOOLEAN CONSTRAINT nn_items_track_inventory NOT NULL DEFAULT true,
    active BOOLEAN CONSTRAINT nn_items_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_items PRIMARY KEY (id),
    CONSTRAINT uq_items_1 UNIQUE (sku),
    CONSTRAINT ck_items_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE items IS 'Catálogo único de insumos, productos, preparaciones y consumibles.';

-- Presentación por item expresada en su unidad base.
CREATE TABLE presentations (
    id UUID CONSTRAINT nn_presentations_id NOT NULL DEFAULT gen_random_uuid(),
    item_id UUID CONSTRAINT nn_presentations_item_id NOT NULL,
    name TEXT CONSTRAINT nn_presentations_name NOT NULL,
    base_quantity NUMERIC(18,6) CONSTRAINT nn_presentations_base_quantity NOT NULL,
    barcode TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_presentations_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_presentations_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_presentations_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_presentations PRIMARY KEY (id),
    CONSTRAINT uq_presentations_1 UNIQUE (item_id, name),
    CONSTRAINT ck_presentations_1 CHECK (base_quantity > 0),
    CONSTRAINT ck_presentations_2 CHECK (row_version > 0),
    CONSTRAINT ck_presentations_3 CHECK (base_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE presentations IS 'Presentación por item expresada en su unidad base.';

-- Identidad de receta que produce un item.
CREATE TABLE recipes (
    id UUID CONSTRAINT nn_recipes_id NOT NULL DEFAULT gen_random_uuid(),
    output_item_id UUID CONSTRAINT nn_recipes_output_item_id NOT NULL,
    name TEXT CONSTRAINT nn_recipes_name NOT NULL,
    active BOOLEAN CONSTRAINT nn_recipes_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_recipes_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_recipes_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_recipes_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_recipes PRIMARY KEY (id),
    CONSTRAINT ck_recipes_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE recipes IS 'Identidad de receta que produce un item.';

-- Versión histórica inmutable después de publicación.
CREATE TABLE recipe_versions (
    id UUID CONSTRAINT nn_recipe_versions_id NOT NULL DEFAULT gen_random_uuid(),
    recipe_id UUID CONSTRAINT nn_recipe_versions_recipe_id NOT NULL,
    version_number INTEGER CONSTRAINT nn_recipe_versions_version_number NOT NULL,
    yield_quantity NUMERIC(18,6) CONSTRAINT nn_recipe_versions_yield_quantity NOT NULL,
    status TEXT CONSTRAINT nn_recipe_versions_status NOT NULL DEFAULT 'DRAFT',
    instructions TEXT,
    published_at TIMESTAMPTZ,
    created_by UUID CONSTRAINT nn_recipe_versions_created_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_recipe_versions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_recipe_versions PRIMARY KEY (id),
    CONSTRAINT uq_recipe_versions_1 UNIQUE (recipe_id, version_number),
    CONSTRAINT ck_recipe_versions_1 CHECK (version_number > 0),
    CONSTRAINT ck_recipe_versions_2 CHECK (yield_quantity > 0),
    CONSTRAINT ck_recipe_versions_3 CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    CONSTRAINT ck_recipe_versions_4 CHECK (yield_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE recipe_versions IS 'Versión histórica inmutable después de publicación.';

-- BOM: componente item; subreceta fijada a versión cuando corresponda.
CREATE TABLE recipe_components (
    id UUID CONSTRAINT nn_recipe_components_id NOT NULL DEFAULT gen_random_uuid(),
    recipe_version_id UUID CONSTRAINT nn_recipe_components_recipe_version_id NOT NULL,
    component_item_id UUID CONSTRAINT nn_recipe_components_component_item_id NOT NULL,
    component_recipe_version_id UUID,
    quantity NUMERIC(18,6) CONSTRAINT nn_recipe_components_quantity NOT NULL,
    waste_fraction NUMERIC(7,6) CONSTRAINT nn_recipe_components_waste_fraction NOT NULL DEFAULT 0,
    position INTEGER CONSTRAINT nn_recipe_components_position NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_recipe_components_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_recipe_components PRIMARY KEY (id),
    CONSTRAINT uq_recipe_components_1 UNIQUE (recipe_version_id, position),
    CONSTRAINT ck_recipe_components_1 CHECK (quantity > 0),
    CONSTRAINT ck_recipe_components_2 CHECK (waste_fraction >= 0 AND waste_fraction < 1),
    CONSTRAINT ck_recipe_components_3 CHECK (position > 0),
    CONSTRAINT ck_recipe_components_4 CHECK (component_recipe_version_id IS NULL OR component_recipe_version_id <> recipe_version_id),
    CONSTRAINT ck_recipe_components_5 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_recipe_components_6 CHECK (waste_fraction::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE recipe_components IS 'BOM: componente item; subreceta fijada a versión cuando corresponda.';

-- Agrupación comercial de platillos.
CREATE TABLE menu_categories (
    id UUID CONSTRAINT nn_menu_categories_id NOT NULL DEFAULT gen_random_uuid(),
    name TEXT CONSTRAINT nn_menu_categories_name NOT NULL,
    display_order INTEGER CONSTRAINT nn_menu_categories_display_order NOT NULL DEFAULT 0,
    active BOOLEAN CONSTRAINT nn_menu_categories_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_menu_categories_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_menu_categories_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_menu_categories_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_menu_categories PRIMARY KEY (id),
    CONSTRAINT uq_menu_categories_1 UNIQUE (name),
    CONSTRAINT ck_menu_categories_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE menu_categories IS 'Agrupación comercial de platillos.';

-- Áreas de preparación y ruteo de comandas.
CREATE TABLE preparation_areas (
    id UUID CONSTRAINT nn_preparation_areas_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_preparation_areas_code NOT NULL,
    name TEXT CONSTRAINT nn_preparation_areas_name NOT NULL,
    active BOOLEAN CONSTRAINT nn_preparation_areas_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_preparation_areas_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_preparation_areas_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_preparation_areas_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_preparation_areas PRIMARY KEY (id),
    CONSTRAINT uq_preparation_areas_1 UNIQUE (code),
    CONSTRAINT ck_preparation_areas_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE preparation_areas IS 'Áreas de preparación y ruteo de comandas.';

-- Oferta comercial asociada a item físico y receta opcional.
CREATE TABLE menu_items (
    id UUID CONSTRAINT nn_menu_items_id NOT NULL DEFAULT gen_random_uuid(),
    item_id UUID CONSTRAINT nn_menu_items_item_id NOT NULL,
    recipe_version_id UUID,
    category_id UUID CONSTRAINT nn_menu_items_category_id NOT NULL,
    preparation_area_id UUID CONSTRAINT nn_menu_items_preparation_area_id NOT NULL,
    name TEXT CONSTRAINT nn_menu_items_name NOT NULL,
    description TEXT,
    price NUMERIC(14,2) CONSTRAINT nn_menu_items_price NOT NULL,
    currency_id UUID CONSTRAINT nn_menu_items_currency_id NOT NULL,
    image_reference TEXT,
    visibility TEXT CONSTRAINT nn_menu_items_visibility NOT NULL DEFAULT 'PUBLIC',
    status TEXT CONSTRAINT nn_menu_items_status NOT NULL DEFAULT 'ACTIVE',
    display_order INTEGER CONSTRAINT nn_menu_items_display_order NOT NULL DEFAULT 0,
    estimated_preparation_seconds INTEGER CONSTRAINT nn_menu_items_estimated_preparation_seconds NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ CONSTRAINT nn_menu_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_menu_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_menu_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_menu_items PRIMARY KEY (id),
    CONSTRAINT ck_menu_items_1 CHECK (price >= 0),
    CONSTRAINT ck_menu_items_2 CHECK (estimated_preparation_seconds >= 0),
    CONSTRAINT ck_menu_items_3 CHECK (visibility IN ('PUBLIC', 'STAFF', 'HIDDEN')),
    CONSTRAINT ck_menu_items_4 CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT ck_menu_items_5 CHECK (row_version > 0),
    CONSTRAINT ck_menu_items_6 CHECK (price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE menu_items IS 'Oferta comercial asociada a item físico y receta opcional.';

-- Reglas de selección independientes del menú.
CREATE TABLE modifier_groups (
    id UUID CONSTRAINT nn_modifier_groups_id NOT NULL DEFAULT gen_random_uuid(),
    name TEXT CONSTRAINT nn_modifier_groups_name NOT NULL,
    min_selection INTEGER CONSTRAINT nn_modifier_groups_min_selection NOT NULL DEFAULT 0,
    max_selection INTEGER CONSTRAINT nn_modifier_groups_max_selection NOT NULL,
    required BOOLEAN CONSTRAINT nn_modifier_groups_required NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ CONSTRAINT nn_modifier_groups_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_modifier_groups_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_modifier_groups_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_modifier_groups PRIMARY KEY (id),
    CONSTRAINT ck_modifier_groups_1 CHECK (min_selection >= 0 AND max_selection >= min_selection),
    CONSTRAINT ck_modifier_groups_2 CHECK (required = (min_selection > 0)),
    CONSTRAINT ck_modifier_groups_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE modifier_groups IS 'Reglas de selección independientes del menú.';

-- Opciones con diferencia de precio; impactos separados.
CREATE TABLE modifiers (
    id UUID CONSTRAINT nn_modifiers_id NOT NULL DEFAULT gen_random_uuid(),
    group_id UUID CONSTRAINT nn_modifiers_group_id NOT NULL,
    name TEXT CONSTRAINT nn_modifiers_name NOT NULL,
    price_delta NUMERIC(14,2) CONSTRAINT nn_modifiers_price_delta NOT NULL DEFAULT 0,
    active BOOLEAN CONSTRAINT nn_modifiers_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_modifiers_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_modifiers_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_modifiers_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_modifiers PRIMARY KEY (id),
    CONSTRAINT uq_modifiers_1 UNIQUE (group_id, name),
    CONSTRAINT uq_modifiers_2 UNIQUE (id, group_id),
    CONSTRAINT ck_modifiers_1 CHECK (row_version > 0),
    CONSTRAINT ck_modifiers_2 CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE modifiers IS 'Opciones con diferencia de precio; impactos separados.';

-- Grupos habilitados por platillo.
CREATE TABLE menu_item_modifier_groups (
    id UUID CONSTRAINT nn_menu_item_modifier_groups_id NOT NULL DEFAULT gen_random_uuid(),
    menu_item_id UUID CONSTRAINT nn_menu_item_modifier_groups_menu_item_id NOT NULL,
    group_id UUID CONSTRAINT nn_menu_item_modifier_groups_group_id NOT NULL,
    display_order INTEGER CONSTRAINT nn_menu_item_modifier_groups_display_order NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ CONSTRAINT nn_menu_item_modifier_groups_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_menu_item_modifier_groups PRIMARY KEY (id),
    CONSTRAINT uq_menu_item_modifier_groups_1 UNIQUE (menu_item_id, group_id)
 );
COMMENT ON TABLE menu_item_modifier_groups IS 'Grupos habilitados por platillo.';

-- Delta firmado de consumo en unidad base por modificador.
CREATE TABLE modifier_item_impacts (
    id UUID CONSTRAINT nn_modifier_item_impacts_id NOT NULL DEFAULT gen_random_uuid(),
    modifier_id UUID CONSTRAINT nn_modifier_item_impacts_modifier_id NOT NULL,
    item_id UUID CONSTRAINT nn_modifier_item_impacts_item_id NOT NULL,
    quantity_delta NUMERIC(18,6) CONSTRAINT nn_modifier_item_impacts_quantity_delta NOT NULL,
    affects_availability BOOLEAN CONSTRAINT nn_modifier_item_impacts_affects_availability NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_modifier_item_impacts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_modifier_item_impacts PRIMARY KEY (id),
    CONSTRAINT uq_modifier_item_impacts_1 UNIQUE (modifier_id, item_id),
    CONSTRAINT ck_modifier_item_impacts_1 CHECK (quantity_delta <> 0),
    CONSTRAINT ck_modifier_item_impacts_2 CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE modifier_item_impacts IS 'Delta firmado de consumo en unidad base por modificador.';

-- Ubicaciones físicas de existencias.
CREATE TABLE inventory_locations (
    id UUID CONSTRAINT nn_inventory_locations_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_inventory_locations_code NOT NULL,
    name TEXT CONSTRAINT nn_inventory_locations_name NOT NULL,
    active BOOLEAN CONSTRAINT nn_inventory_locations_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_locations_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_inventory_locations_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_inventory_locations_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_inventory_locations PRIMARY KEY (id),
    CONSTRAINT uq_inventory_locations_1 UNIQUE (code),
    CONSTRAINT ck_inventory_locations_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE inventory_locations IS 'Ubicaciones físicas de existencias.';

-- Identidad del lote; cantidad y ubicación se consultan en saldos/movimientos.
CREATE TABLE inventory_lots (
    id UUID CONSTRAINT nn_inventory_lots_id NOT NULL DEFAULT gen_random_uuid(),
    item_id UUID CONSTRAINT nn_inventory_lots_item_id NOT NULL,
    lot_code TEXT CONSTRAINT nn_inventory_lots_lot_code NOT NULL,
    received_at TIMESTAMPTZ CONSTRAINT nn_inventory_lots_received_at NOT NULL,
    expires_at TIMESTAMPTZ,
    unit_cost NUMERIC(18,6) CONSTRAINT nn_inventory_lots_unit_cost NOT NULL,
    currency_id UUID CONSTRAINT nn_inventory_lots_currency_id NOT NULL,
    goods_receipt_item_id UUID,
    production_output_id UUID,
    source_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_lots_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_inventory_lots PRIMARY KEY (id),
    CONSTRAINT uq_inventory_lots_1 UNIQUE (item_id, lot_code),
    CONSTRAINT ck_inventory_lots_1 CHECK (unit_cost >= 0),
    CONSTRAINT ck_inventory_lots_2 CHECK (expires_at IS NULL OR expires_at > received_at),
    CONSTRAINT ck_inventory_lots_3 CHECK (num_nonnulls(goods_receipt_item_id, production_output_id, source_reason) = 1),
    CONSTRAINT ck_inventory_lots_4 CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE inventory_lots IS 'Identidad del lote; cantidad y ubicación se consultan en saldos/movimientos.';

-- Proyección reconstruible del libro de inventario por lote y ubicación.
CREATE TABLE inventory_balances (
    id UUID CONSTRAINT nn_inventory_balances_id NOT NULL DEFAULT gen_random_uuid(),
    lot_id UUID CONSTRAINT nn_inventory_balances_lot_id NOT NULL,
    location_id UUID CONSTRAINT nn_inventory_balances_location_id NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_inventory_balances_quantity NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC(18,6) CONSTRAINT nn_inventory_balances_reserved_quantity NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_balances_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_inventory_balances_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_inventory_balances_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_inventory_balances PRIMARY KEY (id),
    CONSTRAINT uq_inventory_balances_1 UNIQUE (lot_id, location_id),
    CONSTRAINT ck_inventory_balances_1 CHECK (quantity >= 0 AND reserved_quantity >= 0 AND reserved_quantity <= quantity),
    CONSTRAINT ck_inventory_balances_2 CHECK (row_version > 0),
    CONSTRAINT ck_inventory_balances_3 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_inventory_balances_4 CHECK (reserved_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE inventory_balances IS 'Proyección reconstruible del libro de inventario por lote y ubicación.';

-- Libro inmutable con cantidad firmada; corrección mediante contramovimiento.
CREATE TABLE inventory_movements (
    id UUID CONSTRAINT nn_inventory_movements_id NOT NULL DEFAULT gen_random_uuid(),
    lot_id UUID CONSTRAINT nn_inventory_movements_lot_id NOT NULL,
    location_id UUID CONSTRAINT nn_inventory_movements_location_id NOT NULL,
    movement_type TEXT CONSTRAINT nn_inventory_movements_movement_type NOT NULL,
    quantity_delta NUMERIC(18,6) CONSTRAINT nn_inventory_movements_quantity_delta NOT NULL,
    unit_cost NUMERIC(18,6) CONSTRAINT nn_inventory_movements_unit_cost NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_inventory_movements_occurred_at NOT NULL DEFAULT now(),
    created_by UUID CONSTRAINT nn_inventory_movements_created_by NOT NULL,
    goods_receipt_item_id UUID,
    production_consumption_id UUID,
    production_output_id UUID,
    order_item_id UUID,
    transfer_id UUID,
    reversal_of_id UUID,
    reason TEXT CONSTRAINT nn_inventory_movements_reason NOT NULL,
    request_id UUID,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_movements_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_inventory_movements PRIMARY KEY (id),
    CONSTRAINT uq_inventory_movements_1 UNIQUE (reversal_of_id),
    CONSTRAINT ck_inventory_movements_1 CHECK (movement_type IN ('PURCHASE', 'PRODUCTION', 'CONSUMPTION', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN', 'TRANSFER', 'INTERNAL_USE')),
    CONSTRAINT ck_inventory_movements_2 CHECK (quantity_delta <> 0),
    CONSTRAINT ck_inventory_movements_3 CHECK (unit_cost >= 0),
    CONSTRAINT ck_inventory_movements_4 CHECK (movement_type <> 'PURCHASE' OR (goods_receipt_item_id IS NOT NULL AND quantity_delta > 0)),
    CONSTRAINT ck_inventory_movements_5 CHECK (movement_type <> 'TRANSFER' OR transfer_id IS NOT NULL),
    CONSTRAINT ck_inventory_movements_6 CHECK (movement_type NOT IN ('CONSUMPTION','SALE','WASTE','INTERNAL_USE') OR quantity_delta < 0),
    CONSTRAINT ck_inventory_movements_7 CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_inventory_movements_8 CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE inventory_movements IS 'Libro inmutable con cantidad firmada; corrección mediante contramovimiento.';

-- Cabecera de transferencia; dos asientos balanceados por lote.
CREATE TABLE inventory_transfers (
    id UUID CONSTRAINT nn_inventory_transfers_id NOT NULL DEFAULT gen_random_uuid(),
    source_location_id UUID CONSTRAINT nn_inventory_transfers_source_location_id NOT NULL,
    destination_location_id UUID CONSTRAINT nn_inventory_transfers_destination_location_id NOT NULL,
    reason TEXT CONSTRAINT nn_inventory_transfers_reason NOT NULL,
    created_by UUID CONSTRAINT nn_inventory_transfers_created_by NOT NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_transfers_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_inventory_transfers PRIMARY KEY (id),
    CONSTRAINT ck_inventory_transfers_1 CHECK (source_location_id <> destination_location_id)
 );
COMMENT ON TABLE inventory_transfers IS 'Cabecera de transferencia; dos asientos balanceados por lote.';

-- Umbrales por item y ubicación.
CREATE TABLE stock_thresholds (
    id UUID CONSTRAINT nn_stock_thresholds_id NOT NULL DEFAULT gen_random_uuid(),
    item_id UUID CONSTRAINT nn_stock_thresholds_item_id NOT NULL,
    location_id UUID CONSTRAINT nn_stock_thresholds_location_id NOT NULL,
    minimum_quantity NUMERIC(18,6) CONSTRAINT nn_stock_thresholds_minimum_quantity NOT NULL,
    target_quantity NUMERIC(18,6) CONSTRAINT nn_stock_thresholds_target_quantity NOT NULL,
    maximum_quantity NUMERIC(18,6) CONSTRAINT nn_stock_thresholds_maximum_quantity NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_stock_thresholds_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_stock_thresholds_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_stock_thresholds_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_stock_thresholds PRIMARY KEY (id),
    CONSTRAINT uq_stock_thresholds_1 UNIQUE (item_id, location_id),
    CONSTRAINT ck_stock_thresholds_1 CHECK (minimum_quantity >= 0 AND target_quantity >= minimum_quantity AND maximum_quantity >= target_quantity),
    CONSTRAINT ck_stock_thresholds_2 CHECK (row_version > 0),
    CONSTRAINT ck_stock_thresholds_3 CHECK (minimum_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_stock_thresholds_4 CHECK (target_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_stock_thresholds_5 CHECK (maximum_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE stock_thresholds IS 'Umbrales por item y ubicación.';

-- Reserva de existencias para evitar sobreventa antes de consumir.
CREATE TABLE inventory_allocations (
    id UUID CONSTRAINT nn_inventory_allocations_id NOT NULL DEFAULT gen_random_uuid(),
    order_item_id UUID,
    production_order_id UUID,
    lot_id UUID CONSTRAINT nn_inventory_allocations_lot_id NOT NULL,
    location_id UUID CONSTRAINT nn_inventory_allocations_location_id NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_inventory_allocations_quantity NOT NULL,
    expires_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_inventory_allocations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_inventory_allocations PRIMARY KEY (id),
    CONSTRAINT ck_inventory_allocations_1 CHECK (num_nonnulls(order_item_id, production_order_id) = 1),
    CONSTRAINT ck_inventory_allocations_2 CHECK (quantity > 0),
    CONSTRAINT ck_inventory_allocations_3 CHECK (NOT (released_at IS NOT NULL AND consumed_at IS NOT NULL)),
    CONSTRAINT ck_inventory_allocations_4 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE inventory_allocations IS 'Reserva de existencias para evitar sobreventa antes de consumir.';

-- Proveedor y contacto operativo.
CREATE TABLE suppliers (
    id UUID CONSTRAINT nn_suppliers_id NOT NULL DEFAULT gen_random_uuid(),
    name TEXT CONSTRAINT nn_suppliers_name NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address_text TEXT,
    tax_identifier TEXT,
    active BOOLEAN CONSTRAINT nn_suppliers_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_suppliers_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_suppliers_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_suppliers_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_suppliers PRIMARY KEY (id),
    CONSTRAINT ck_suppliers_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE suppliers IS 'Proveedor y contacto operativo.';

-- Oferta de proveedor por presentación; historial de precios separado.
CREATE TABLE supplier_items (
    id UUID CONSTRAINT nn_supplier_items_id NOT NULL DEFAULT gen_random_uuid(),
    supplier_id UUID CONSTRAINT nn_supplier_items_supplier_id NOT NULL,
    presentation_id UUID CONSTRAINT nn_supplier_items_presentation_id NOT NULL,
    supplier_sku TEXT,
    preferred BOOLEAN CONSTRAINT nn_supplier_items_preferred NOT NULL DEFAULT false,
    active BOOLEAN CONSTRAINT nn_supplier_items_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_supplier_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_supplier_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_supplier_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_supplier_items PRIMARY KEY (id),
    CONSTRAINT uq_supplier_items_1 UNIQUE (supplier_id, presentation_id),
    CONSTRAINT ck_supplier_items_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE supplier_items IS 'Oferta de proveedor por presentación; historial de precios separado.';

-- Precio histórico con intervalo de vigencia.
CREATE TABLE supplier_item_prices (
    id UUID CONSTRAINT nn_supplier_item_prices_id NOT NULL DEFAULT gen_random_uuid(),
    supplier_item_id UUID CONSTRAINT nn_supplier_item_prices_supplier_item_id NOT NULL,
    price NUMERIC(14,2) CONSTRAINT nn_supplier_item_prices_price NOT NULL,
    currency_id UUID CONSTRAINT nn_supplier_item_prices_currency_id NOT NULL,
    valid_from TIMESTAMPTZ CONSTRAINT nn_supplier_item_prices_valid_from NOT NULL,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_supplier_item_prices_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_supplier_item_prices PRIMARY KEY (id),
    CONSTRAINT uq_supplier_item_prices_1 UNIQUE (supplier_item_id, valid_from),
    CONSTRAINT ck_supplier_item_prices_1 CHECK (price >= 0),
    CONSTRAINT ck_supplier_item_prices_2 CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT ck_supplier_item_prices_3 CHECK (price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE supplier_item_prices IS 'Precio histórico con intervalo de vigencia.';

-- Solicitud y compromiso de compra; no genera existencias.
CREATE TABLE purchase_orders (
    id UUID CONSTRAINT nn_purchase_orders_id NOT NULL DEFAULT gen_random_uuid(),
    supplier_id UUID CONSTRAINT nn_purchase_orders_supplier_id NOT NULL,
    status TEXT CONSTRAINT nn_purchase_orders_status NOT NULL DEFAULT 'REQUESTED',
    currency_id UUID CONSTRAINT nn_purchase_orders_currency_id NOT NULL,
    requested_at TIMESTAMPTZ CONSTRAINT nn_purchase_orders_requested_at NOT NULL DEFAULT now(),
    ordered_at TIMESTAMPTZ,
    expected_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_purchase_orders_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_purchase_orders_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_purchase_orders_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_purchase_orders PRIMARY KEY (id),
    CONSTRAINT ck_purchase_orders_1 CHECK (status IN ('REQUESTED', 'PARTIALLY_PURCHASED', 'PURCHASED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT ck_purchase_orders_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE purchase_orders IS 'Solicitud y compromiso de compra; no genera existencias.';

-- Cantidades solicitadas y comprometidas en unidad base con precio pactado.
CREATE TABLE purchase_order_items (
    id UUID CONSTRAINT nn_purchase_order_items_id NOT NULL DEFAULT gen_random_uuid(),
    purchase_order_id UUID CONSTRAINT nn_purchase_order_items_purchase_order_id NOT NULL,
    item_id UUID CONSTRAINT nn_purchase_order_items_item_id NOT NULL,
    presentation_id UUID,
    requested_quantity NUMERIC(18,6) CONSTRAINT nn_purchase_order_items_requested_quantity NOT NULL,
    purchased_quantity NUMERIC(18,6) CONSTRAINT nn_purchase_order_items_purchased_quantity NOT NULL DEFAULT 0,
    unit_price NUMERIC(18,6) CONSTRAINT nn_purchase_order_items_unit_price NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_purchase_order_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_purchase_order_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_purchase_order_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_purchase_order_items PRIMARY KEY (id),
    CONSTRAINT ck_purchase_order_items_1 CHECK (requested_quantity > 0 AND purchased_quantity >= 0 AND purchased_quantity <= requested_quantity),
    CONSTRAINT ck_purchase_order_items_2 CHECK (unit_price >= 0),
    CONSTRAINT ck_purchase_order_items_3 CHECK (row_version > 0),
    CONSTRAINT ck_purchase_order_items_4 CHECK (requested_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_purchase_order_items_5 CHECK (purchased_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_purchase_order_items_6 CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE purchase_order_items IS 'Cantidades solicitadas y comprometidas en unidad base con precio pactado.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE purchase_order_status_history (
    id UUID CONSTRAINT nn_purchase_order_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    purchase_order_id UUID CONSTRAINT nn_purchase_order_status_history_purchase_order_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_purchase_order_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_purchase_order_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_purchase_order_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_purchase_order_status_history PRIMARY KEY (id),
    CONSTRAINT ck_purchase_order_status_history_1 CHECK (to_status IN ('REQUESTED', 'PARTIALLY_PURCHASED', 'PURCHASED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))
 );
COMMENT ON TABLE purchase_order_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Recepción física; contabilización única genera lotes y movimientos.
CREATE TABLE goods_receipts (
    id UUID CONSTRAINT nn_goods_receipts_id NOT NULL DEFAULT gen_random_uuid(),
    purchase_order_id UUID CONSTRAINT nn_goods_receipts_purchase_order_id NOT NULL,
    receipt_reference TEXT CONSTRAINT nn_goods_receipts_receipt_reference NOT NULL,
    received_at TIMESTAMPTZ CONSTRAINT nn_goods_receipts_received_at NOT NULL,
    received_by UUID CONSTRAINT nn_goods_receipts_received_by NOT NULL,
    status TEXT CONSTRAINT nn_goods_receipts_status NOT NULL DEFAULT 'DRAFT',
    posted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_goods_receipts_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_goods_receipts_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_goods_receipts_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_goods_receipts PRIMARY KEY (id),
    CONSTRAINT uq_goods_receipts_1 UNIQUE (purchase_order_id, receipt_reference),
    CONSTRAINT ck_goods_receipts_1 CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
    CONSTRAINT ck_goods_receipts_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE goods_receipts IS 'Recepción física; contabilización única genera lotes y movimientos.';

-- Recepción parcial y rechazos por línea comprada.
CREATE TABLE goods_receipt_items (
    id UUID CONSTRAINT nn_goods_receipt_items_id NOT NULL DEFAULT gen_random_uuid(),
    goods_receipt_id UUID CONSTRAINT nn_goods_receipt_items_goods_receipt_id NOT NULL,
    purchase_order_item_id UUID CONSTRAINT nn_goods_receipt_items_purchase_order_item_id NOT NULL,
    accepted_quantity NUMERIC(18,6) CONSTRAINT nn_goods_receipt_items_accepted_quantity NOT NULL,
    rejected_quantity NUMERIC(18,6) CONSTRAINT nn_goods_receipt_items_rejected_quantity NOT NULL DEFAULT 0,
    unit_cost NUMERIC(18,6) CONSTRAINT nn_goods_receipt_items_unit_cost NOT NULL,
    location_id UUID CONSTRAINT nn_goods_receipt_items_location_id NOT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_goods_receipt_items_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_goods_receipt_items PRIMARY KEY (id),
    CONSTRAINT ck_goods_receipt_items_1 CHECK (accepted_quantity >= 0 AND rejected_quantity >= 0 AND accepted_quantity + rejected_quantity > 0),
    CONSTRAINT ck_goods_receipt_items_2 CHECK (unit_cost >= 0),
    CONSTRAINT ck_goods_receipt_items_3 CHECK (rejected_quantity = 0 OR rejection_reason IS NOT NULL),
    CONSTRAINT ck_goods_receipt_items_4 CHECK (accepted_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_goods_receipt_items_5 CHECK (rejected_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_goods_receipt_items_6 CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE goods_receipt_items IS 'Recepción parcial y rechazos por línea comprada.';

-- Sugerencia o solicitud de producir una versión exacta.
CREATE TABLE production_orders (
    id UUID CONSTRAINT nn_production_orders_id NOT NULL DEFAULT gen_random_uuid(),
    recipe_version_id UUID CONSTRAINT nn_production_orders_recipe_version_id NOT NULL,
    currency_id UUID CONSTRAINT nn_production_orders_currency_id NOT NULL,
    planned_quantity NUMERIC(18,6) CONSTRAINT nn_production_orders_planned_quantity NOT NULL,
    status TEXT CONSTRAINT nn_production_orders_status NOT NULL DEFAULT 'PENDING',
    suggested_by_ai_session_id UUID,
    accepted_by UUID,
    accepted_at TIMESTAMPTZ,
    modified_by UUID,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    reason TEXT,
    planned_start_at TIMESTAMPTZ,
    planned_end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_orders_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_production_orders_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_production_orders_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_production_orders PRIMARY KEY (id),
    CONSTRAINT ck_production_orders_1 CHECK (planned_quantity > 0),
    CONSTRAINT ck_production_orders_2 CHECK (status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED')),
    CONSTRAINT ck_production_orders_3 CHECK (row_version > 0),
    CONSTRAINT ck_production_orders_4 CHECK (planned_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE production_orders IS 'Sugerencia o solicitud de producir una versión exacta.';

-- Ejecución física de una orden; conserva costo real.
CREATE TABLE production_batches (
    id UUID CONSTRAINT nn_production_batches_id NOT NULL DEFAULT gen_random_uuid(),
    production_order_id UUID CONSTRAINT nn_production_batches_production_order_id NOT NULL,
    batch_code TEXT CONSTRAINT nn_production_batches_batch_code NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT CONSTRAINT nn_production_batches_status NOT NULL DEFAULT 'PENDING',
    responsible_user_id UUID CONSTRAINT nn_production_batches_responsible_user_id NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_batches_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_production_batches_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_production_batches_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_production_batches PRIMARY KEY (id),
    CONSTRAINT uq_production_batches_1 UNIQUE (batch_code),
    CONSTRAINT ck_production_batches_1 CHECK (status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED')),
    CONSTRAINT ck_production_batches_2 CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
    CONSTRAINT ck_production_batches_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE production_batches IS 'Ejecución física de una orden; conserva costo real.';

-- Consumo real por lote; conserva costo unitario.
CREATE TABLE production_consumptions (
    id UUID CONSTRAINT nn_production_consumptions_id NOT NULL DEFAULT gen_random_uuid(),
    production_batch_id UUID CONSTRAINT nn_production_consumptions_production_batch_id NOT NULL,
    lot_id UUID CONSTRAINT nn_production_consumptions_lot_id NOT NULL,
    location_id UUID CONSTRAINT nn_production_consumptions_location_id NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_production_consumptions_quantity NOT NULL,
    unit_cost NUMERIC(18,6) CONSTRAINT nn_production_consumptions_unit_cost NOT NULL,
    consumed_at TIMESTAMPTZ CONSTRAINT nn_production_consumptions_consumed_at NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_consumptions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_production_consumptions PRIMARY KEY (id),
    CONSTRAINT ck_production_consumptions_1 CHECK (quantity > 0),
    CONSTRAINT ck_production_consumptions_2 CHECK (unit_cost >= 0),
    CONSTRAINT ck_production_consumptions_3 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_production_consumptions_4 CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE production_consumptions IS 'Consumo real por lote; conserva costo unitario.';

-- Salida real, incluida merma, vinculada a lote producido.
CREATE TABLE production_outputs (
    id UUID CONSTRAINT nn_production_outputs_id NOT NULL DEFAULT gen_random_uuid(),
    production_batch_id UUID CONSTRAINT nn_production_outputs_production_batch_id NOT NULL,
    item_id UUID CONSTRAINT nn_production_outputs_item_id NOT NULL,
    location_id UUID CONSTRAINT nn_production_outputs_location_id NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_production_outputs_quantity NOT NULL,
    unit_cost NUMERIC(18,6) CONSTRAINT nn_production_outputs_unit_cost NOT NULL,
    output_type TEXT CONSTRAINT nn_production_outputs_output_type NOT NULL,
    produced_at TIMESTAMPTZ CONSTRAINT nn_production_outputs_produced_at NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_outputs_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_production_outputs PRIMARY KEY (id),
    CONSTRAINT ck_production_outputs_1 CHECK (quantity > 0),
    CONSTRAINT ck_production_outputs_2 CHECK (unit_cost >= 0),
    CONSTRAINT ck_production_outputs_3 CHECK (output_type IN ('USABLE', 'WASTE')),
    CONSTRAINT ck_production_outputs_4 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_production_outputs_5 CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE production_outputs IS 'Salida real, incluida merma, vinculada a lote producido.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE production_status_history (
    id UUID CONSTRAINT nn_production_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    production_order_id UUID CONSTRAINT nn_production_status_history_production_order_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_production_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_production_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_production_status_history PRIMARY KEY (id),
    CONSTRAINT ck_production_status_history_1 CHECK (to_status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))
 );
COMMENT ON TABLE production_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Decisión manual prioritaria sobre disponibilidad calculada.
CREATE TABLE menu_item_availability_overrides (
    id UUID CONSTRAINT nn_menu_item_availability_overrides_id NOT NULL DEFAULT gen_random_uuid(),
    menu_item_id UUID CONSTRAINT nn_menu_item_availability_overrides_menu_item_id NOT NULL,
    channel TEXT CONSTRAINT nn_menu_item_availability_overrides_channel NOT NULL,
    is_available BOOLEAN CONSTRAINT nn_menu_item_availability_overrides_is_available NOT NULL,
    reason TEXT CONSTRAINT nn_menu_item_availability_overrides_reason NOT NULL,
    created_by UUID CONSTRAINT nn_menu_item_availability_overrides_created_by NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked_by UUID,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_menu_item_availability_overrides_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_menu_item_availability_overrides PRIMARY KEY (id),
    CONSTRAINT ck_menu_item_availability_overrides_1 CHECK (channel IN ('ALL', 'DINE_IN', 'PICKUP', 'DELIVERY')),
    CONSTRAINT ck_menu_item_availability_overrides_2 CHECK (expires_at IS NULL OR expires_at > created_at)
 );
COMMENT ON TABLE menu_item_availability_overrides IS 'Decisión manual prioritaria sobre disponibilidad calculada.';

-- Estado actual único del restaurante; dimensiones independientes.
CREATE TABLE service_status (
    id UUID CONSTRAINT nn_service_status_id NOT NULL DEFAULT gen_random_uuid(),
    singleton_key INTEGER CONSTRAINT nn_service_status_singleton_key NOT NULL DEFAULT 1,
    restaurant_open BOOLEAN CONSTRAINT nn_service_status_restaurant_open NOT NULL DEFAULT false,
    dine_in_enabled BOOLEAN CONSTRAINT nn_service_status_dine_in_enabled NOT NULL DEFAULT false,
    pickup_enabled BOOLEAN CONSTRAINT nn_service_status_pickup_enabled NOT NULL DEFAULT false,
    delivery_enabled BOOLEAN CONSTRAINT nn_service_status_delivery_enabled NOT NULL DEFAULT false,
    online_orders_enabled BOOLEAN CONSTRAINT nn_service_status_online_orders_enabled NOT NULL DEFAULT false,
    high_demand BOOLEAN CONSTRAINT nn_service_status_high_demand NOT NULL DEFAULT false,
    production_in_progress BOOLEAN CONSTRAINT nn_service_status_production_in_progress NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ CONSTRAINT nn_service_status_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_service_status_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_service_status_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_service_status PRIMARY KEY (id),
    CONSTRAINT uq_service_status_1 UNIQUE (singleton_key),
    CONSTRAINT ck_service_status_1 CHECK (singleton_key = 1),
    CONSTRAINT ck_service_status_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE service_status IS 'Estado actual único del restaurante; dimensiones independientes.';

-- Estado independiente por capacidad con override auditable.
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
COMMENT ON TABLE service_capabilities IS 'Estado independiente por capacidad con override auditable.';

-- Historial inmutable de cambios por capacidad.
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
COMMENT ON TABLE service_capability_events IS 'Historial inmutable de cambios por capacidad.';

-- Cambio operativo con estado anterior y posterior.
CREATE TABLE service_status_history (
    id UUID CONSTRAINT nn_service_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    service_status_id UUID CONSTRAINT nn_service_status_history_service_status_id NOT NULL,
    actor_user_id UUID CONSTRAINT nn_service_status_history_actor_user_id NOT NULL,
    reason TEXT CONSTRAINT nn_service_status_history_reason NOT NULL,
    before_data JSONB CONSTRAINT nn_service_status_history_before_data NOT NULL,
    after_data JSONB CONSTRAINT nn_service_status_history_after_data NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_service_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_service_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_service_status_history PRIMARY KEY (id)
 );
COMMENT ON TABLE service_status_history IS 'Cambio operativo con estado anterior y posterior.';

-- Capacidad por área e intervalo para estimación de carga.
CREATE TABLE preparation_capacity_slots (
    id UUID CONSTRAINT nn_preparation_capacity_slots_id NOT NULL DEFAULT gen_random_uuid(),
    preparation_area_id UUID CONSTRAINT nn_preparation_capacity_slots_preparation_area_id NOT NULL,
    starts_at TIMESTAMPTZ CONSTRAINT nn_preparation_capacity_slots_starts_at NOT NULL,
    ends_at TIMESTAMPTZ CONSTRAINT nn_preparation_capacity_slots_ends_at NOT NULL,
    capacity_units NUMERIC(18,6) CONSTRAINT nn_preparation_capacity_slots_capacity_units NOT NULL,
    reserved_units NUMERIC(18,6) CONSTRAINT nn_preparation_capacity_slots_reserved_units NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ CONSTRAINT nn_preparation_capacity_slots_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_preparation_capacity_slots_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_preparation_capacity_slots_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_preparation_capacity_slots PRIMARY KEY (id),
    CONSTRAINT uq_preparation_capacity_slots_1 UNIQUE (preparation_area_id, starts_at),
    CONSTRAINT ck_preparation_capacity_slots_1 CHECK (ends_at > starts_at),
    CONSTRAINT ck_preparation_capacity_slots_2 CHECK (capacity_units >= 0 AND reserved_units >= 0 AND reserved_units <= capacity_units),
    CONSTRAINT ck_preparation_capacity_slots_3 CHECK (row_version > 0),
    CONSTRAINT ck_preparation_capacity_slots_4 CHECK (capacity_units::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_preparation_capacity_slots_5 CHECK (reserved_units::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE preparation_capacity_slots IS 'Capacidad por área e intervalo para estimación de carga.';

-- Pedido comercial multicanal; preventa vinculable a reserva.
CREATE TABLE orders (
    id UUID CONSTRAINT nn_orders_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID,
    table_id UUID,
    reservation_id UUID,
    channel TEXT CONSTRAINT nn_orders_channel NOT NULL,
    order_type TEXT CONSTRAINT nn_orders_order_type NOT NULL,
    status TEXT CONSTRAINT nn_orders_status NOT NULL DEFAULT 'DRAFT',
    currency_id UUID CONSTRAINT nn_orders_currency_id NOT NULL,
    comments TEXT,
    ordered_at TIMESTAMPTZ CONSTRAINT nn_orders_ordered_at NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    estimated_ready_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    request_id UUID,
    correlation_id UUID,
    client_action_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_orders_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_orders_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_orders_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_orders PRIMARY KEY (id),
    CONSTRAINT ck_orders_1 CHECK (channel IN ('WEB', 'MOBILE', 'DESKTOP', 'STAFF', 'WHATSAPP', 'INSTAGRAM', 'OTHER')),
    CONSTRAINT ck_orders_2 CHECK (order_type IN ('DINE_IN', 'PICKUP', 'DELIVERY')),
    CONSTRAINT ck_orders_3 CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT ck_orders_4 CHECK (row_version > 0)
 );
COMMENT ON TABLE orders IS 'Pedido comercial multicanal; preventa vinculable a reserva.';

-- Línea histórica con precio y receta congelados al enviar.
CREATE TABLE order_items (
    id UUID CONSTRAINT nn_order_items_id NOT NULL DEFAULT gen_random_uuid(),
    order_id UUID CONSTRAINT nn_order_items_order_id NOT NULL,
    menu_item_id UUID CONSTRAINT nn_order_items_menu_item_id NOT NULL,
    recipe_version_id UUID,
    item_name_snapshot TEXT CONSTRAINT nn_order_items_item_name_snapshot NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_order_items_quantity NOT NULL,
    unit_price NUMERIC(14,2) CONSTRAINT nn_order_items_unit_price NOT NULL,
    status TEXT CONSTRAINT nn_order_items_status NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    replaces_order_item_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_order_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_order_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_order_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_order_items PRIMARY KEY (id),
    CONSTRAINT uq_order_items_1 UNIQUE (id, order_id),
    CONSTRAINT ck_order_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_order_items_2 CHECK (unit_price >= 0),
    CONSTRAINT ck_order_items_3 CHECK (status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED')),
    CONSTRAINT ck_order_items_4 CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)),
    CONSTRAINT ck_order_items_5 CHECK (row_version > 0),
    CONSTRAINT ck_order_items_6 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_order_items_7 CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE order_items IS 'Línea histórica con precio y receta congelados al enviar.';

-- Selección histórica; delta de precio congelado.
CREATE TABLE order_item_modifiers (
    id UUID CONSTRAINT nn_order_item_modifiers_id NOT NULL DEFAULT gen_random_uuid(),
    order_item_id UUID CONSTRAINT nn_order_item_modifiers_order_item_id NOT NULL,
    modifier_id UUID CONSTRAINT nn_order_item_modifiers_modifier_id NOT NULL,
    name_snapshot TEXT CONSTRAINT nn_order_item_modifiers_name_snapshot NOT NULL,
    quantity INTEGER CONSTRAINT nn_order_item_modifiers_quantity NOT NULL DEFAULT 1,
    price_delta NUMERIC(14,2) CONSTRAINT nn_order_item_modifiers_price_delta NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_order_item_modifiers_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_order_item_modifiers PRIMARY KEY (id),
    CONSTRAINT ck_order_item_modifiers_1 CHECK (quantity > 0),
    CONSTRAINT ck_order_item_modifiers_2 CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE order_item_modifiers IS 'Selección histórica; delta de precio congelado.';

-- Impacto de inventario congelado; no cambia con el catálogo.
CREATE TABLE order_modifier_item_impacts (
    id UUID CONSTRAINT nn_order_modifier_item_impacts_id NOT NULL DEFAULT gen_random_uuid(),
    order_item_modifier_id UUID CONSTRAINT nn_order_modifier_item_impacts_order_item_modifier_id NOT NULL,
    item_id UUID CONSTRAINT nn_order_modifier_item_impacts_item_id NOT NULL,
    quantity_delta NUMERIC(18,6) CONSTRAINT nn_order_modifier_item_impacts_quantity_delta NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_order_modifier_item_impacts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_order_modifier_item_impacts PRIMARY KEY (id),
    CONSTRAINT uq_order_modifier_item_impacts_1 UNIQUE (order_item_modifier_id, item_id),
    CONSTRAINT ck_order_modifier_item_impacts_1 CHECK (quantity_delta <> 0),
    CONSTRAINT ck_order_modifier_item_impacts_2 CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE order_modifier_item_impacts IS 'Impacto de inventario congelado; no cambia con el catálogo.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE order_status_history (
    id UUID CONSTRAINT nn_order_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    order_id UUID CONSTRAINT nn_order_status_history_order_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_order_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_order_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_order_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_order_status_history PRIMARY KEY (id),
    CONSTRAINT ck_order_status_history_1 CHECK (to_status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED'))
 );
COMMENT ON TABLE order_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE order_item_status_history (
    id UUID CONSTRAINT nn_order_item_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    order_item_id UUID CONSTRAINT nn_order_item_status_history_order_item_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_order_item_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_order_item_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_order_item_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_order_item_status_history PRIMARY KEY (id),
    CONSTRAINT ck_order_item_status_history_1 CHECK (to_status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED'))
 );
COMMENT ON TABLE order_item_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Solicitudes especiales evaluadas por personal.
CREATE TABLE special_requests (
    id UUID CONSTRAINT nn_special_requests_id NOT NULL DEFAULT gen_random_uuid(),
    order_id UUID CONSTRAINT nn_special_requests_order_id NOT NULL,
    order_item_id UUID,
    description TEXT CONSTRAINT nn_special_requests_description NOT NULL,
    status TEXT CONSTRAINT nn_special_requests_status NOT NULL DEFAULT 'PENDING',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    response TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_special_requests_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_special_requests_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_special_requests_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_special_requests PRIMARY KEY (id),
    CONSTRAINT ck_special_requests_1 CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_special_requests_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE special_requests IS 'Solicitudes especiales evaluadas por personal.';

-- Comanda dividida por área, admite envíos incrementales.
CREATE TABLE kitchen_tickets (
    id UUID CONSTRAINT nn_kitchen_tickets_id NOT NULL DEFAULT gen_random_uuid(),
    order_id UUID CONSTRAINT nn_kitchen_tickets_order_id NOT NULL,
    preparation_area_id UUID CONSTRAINT nn_kitchen_tickets_preparation_area_id NOT NULL,
    status TEXT CONSTRAINT nn_kitchen_tickets_status NOT NULL DEFAULT 'QUEUED',
    sent_at TIMESTAMPTZ CONSTRAINT nn_kitchen_tickets_sent_at NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    sequence_number INTEGER CONSTRAINT nn_kitchen_tickets_sequence_number NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_kitchen_tickets_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_kitchen_tickets_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_kitchen_tickets_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_kitchen_tickets PRIMARY KEY (id),
    CONSTRAINT uq_kitchen_tickets_1 UNIQUE (order_id, preparation_area_id, sequence_number),
    CONSTRAINT ck_kitchen_tickets_1 CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED')),
    CONSTRAINT ck_kitchen_tickets_2 CHECK (sequence_number > 0),
    CONSTRAINT ck_kitchen_tickets_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE kitchen_tickets IS 'Comanda dividida por área, admite envíos incrementales.';

-- Detalle enviado y cantidad por comanda; cancelación explícita.
CREATE TABLE kitchen_ticket_items (
    id UUID CONSTRAINT nn_kitchen_ticket_items_id NOT NULL DEFAULT gen_random_uuid(),
    kitchen_ticket_id UUID CONSTRAINT nn_kitchen_ticket_items_kitchen_ticket_id NOT NULL,
    order_item_id UUID CONSTRAINT nn_kitchen_ticket_items_order_item_id NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_kitchen_ticket_items_quantity NOT NULL,
    status TEXT CONSTRAINT nn_kitchen_ticket_items_status NOT NULL DEFAULT 'QUEUED',
    cancelled_at TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_kitchen_ticket_items_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_kitchen_ticket_items_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_kitchen_ticket_items_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_kitchen_ticket_items PRIMARY KEY (id),
    CONSTRAINT uq_kitchen_ticket_items_1 UNIQUE (kitchen_ticket_id, order_item_id),
    CONSTRAINT ck_kitchen_ticket_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_kitchen_ticket_items_2 CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED')),
    CONSTRAINT ck_kitchen_ticket_items_3 CHECK (row_version > 0),
    CONSTRAINT ck_kitchen_ticket_items_4 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE kitchen_ticket_items IS 'Detalle enviado y cantidad por comanda; cancelación explícita.';

-- Repartidor interno o proveedor externo.
CREATE TABLE delivery_partners (
    id UUID CONSTRAINT nn_delivery_partners_id NOT NULL DEFAULT gen_random_uuid(),
    partner_type TEXT CONSTRAINT nn_delivery_partners_partner_type NOT NULL,
    employee_id UUID,
    name TEXT CONSTRAINT nn_delivery_partners_name NOT NULL,
    phone TEXT,
    active BOOLEAN CONSTRAINT nn_delivery_partners_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_delivery_partners_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_delivery_partners_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_delivery_partners_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_delivery_partners PRIMARY KEY (id),
    CONSTRAINT ck_delivery_partners_1 CHECK (partner_type IN ('INTERNAL', 'EXTERNAL')),
    CONSTRAINT ck_delivery_partners_2 CHECK ((partner_type = 'INTERNAL') = (employee_id IS NOT NULL)),
    CONSTRAINT ck_delivery_partners_3 CHECK (row_version > 0)
 );
COMMENT ON TABLE delivery_partners IS 'Repartidor interno o proveedor externo.';

-- Entrega con dirección y contacto históricos; permite reintentos.
CREATE TABLE deliveries (
    id UUID CONSTRAINT nn_deliveries_id NOT NULL DEFAULT gen_random_uuid(),
    order_id UUID CONSTRAINT nn_deliveries_order_id NOT NULL,
    partner_id UUID,
    attempt_number INTEGER CONSTRAINT nn_deliveries_attempt_number NOT NULL DEFAULT 1,
    status TEXT CONSTRAINT nn_deliveries_status NOT NULL DEFAULT 'PENDING',
    recipient_name_snapshot TEXT CONSTRAINT nn_deliveries_recipient_name_snapshot NOT NULL,
    phone_snapshot TEXT CONSTRAINT nn_deliveries_phone_snapshot NOT NULL,
    address_snapshot TEXT CONSTRAINT nn_deliveries_address_snapshot NOT NULL,
    instructions_snapshot TEXT,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    fee NUMERIC(14,2) CONSTRAINT nn_deliveries_fee NOT NULL DEFAULT 0,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    external_reference TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_deliveries_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_deliveries_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_deliveries_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_deliveries PRIMARY KEY (id),
    CONSTRAINT uq_deliveries_1 UNIQUE (order_id, attempt_number),
    CONSTRAINT ck_deliveries_1 CHECK (attempt_number > 0),
    CONSTRAINT ck_deliveries_2 CHECK (fee >= 0),
    CONSTRAINT ck_deliveries_3 CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_deliveries_4 CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_deliveries_5 CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_deliveries_6 CHECK (row_version > 0),
    CONSTRAINT ck_deliveries_7 CHECK (latitude::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_deliveries_8 CHECK (longitude::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_deliveries_9 CHECK (fee::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE deliveries IS 'Entrega con dirección y contacto históricos; permite reintentos.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE delivery_status_history (
    id UUID CONSTRAINT nn_delivery_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    deliverie_id UUID CONSTRAINT nn_delivery_status_history_deliverie_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_delivery_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_delivery_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_delivery_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_delivery_status_history PRIMARY KEY (id),
    CONSTRAINT ck_delivery_status_history_1 CHECK (to_status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'))
 );
COMMENT ON TABLE delivery_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Conversación multicanal con cliente y modo de atención.
CREATE TABLE conversations (
    id UUID CONSTRAINT nn_conversations_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID,
    channel TEXT CONSTRAINT nn_conversations_channel NOT NULL,
    external_thread_id TEXT,
    status TEXT CONSTRAINT nn_conversations_status NOT NULL DEFAULT 'OPEN',
    handling_mode TEXT CONSTRAINT nn_conversations_handling_mode NOT NULL DEFAULT 'HUMAN',
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_conversations_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_conversations_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_conversations_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_conversations PRIMARY KEY (id),
    CONSTRAINT uq_conversations_1 UNIQUE (channel, external_thread_id),
    CONSTRAINT ck_conversations_1 CHECK (channel IN ('WEB', 'WHATSAPP', 'INSTAGRAM', 'OTHER')),
    CONSTRAINT ck_conversations_2 CHECK (status IN ('OPEN', 'WAITING', 'CLOSED')),
    CONSTRAINT ck_conversations_3 CHECK (handling_mode IN ('AI', 'HUMAN')),
    CONSTRAINT ck_conversations_4 CHECK (row_version > 0)
 );
COMMENT ON TABLE conversations IS 'Conversación multicanal con cliente y modo de atención.';

-- Mensaje con emisor humano, cliente, sistema o IA.
CREATE TABLE messages (
    id UUID CONSTRAINT nn_messages_id NOT NULL DEFAULT gen_random_uuid(),
    conversation_id UUID CONSTRAINT nn_messages_conversation_id NOT NULL,
    sender_type TEXT CONSTRAINT nn_messages_sender_type NOT NULL,
    sender_user_id UUID,
    ai_session_id UUID,
    direction TEXT CONSTRAINT nn_messages_direction NOT NULL,
    body TEXT,
    attachment_uri TEXT,
    external_message_id TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    status TEXT CONSTRAINT nn_messages_status NOT NULL DEFAULT 'PENDING',
    reply_to_message_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_messages_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_messages PRIMARY KEY (id),
    CONSTRAINT uq_messages_1 UNIQUE (conversation_id, external_message_id),
    CONSTRAINT ck_messages_1 CHECK (sender_type IN ('CUSTOMER', 'HUMAN', 'AI', 'SYSTEM')),
    CONSTRAINT ck_messages_2 CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    CONSTRAINT ck_messages_3 CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
    CONSTRAINT ck_messages_4 CHECK (body IS NOT NULL OR attachment_uri IS NOT NULL),
    CONSTRAINT ck_messages_5 CHECK (sender_type <> 'HUMAN' OR sender_user_id IS NOT NULL),
    CONSTRAINT ck_messages_6 CHECK (sender_type <> 'AI' OR ai_session_id IS NOT NULL)
 );
COMMENT ON TABLE messages IS 'Mensaje con emisor humano, cliente, sistema o IA.';

-- Identidad por proveedor verificada antes de vincular con cliente interno.
CREATE TABLE external_customer_identities (
    id UUID CONSTRAINT nn_external_customer_identities_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID CONSTRAINT nn_external_customer_identities_customer_id NOT NULL,
    provider TEXT CONSTRAINT nn_external_customer_identities_provider NOT NULL,
    external_subject TEXT CONSTRAINT nn_external_customer_identities_external_subject NOT NULL,
    verified_at TIMESTAMPTZ,
    linked_by UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_external_customer_identities_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_external_customer_identities PRIMARY KEY (id),
    CONSTRAINT uq_external_customer_identities_1 UNIQUE (provider, external_subject),
    CONSTRAINT ck_external_customer_identities_1 CHECK (length(external_subject) > 0)
 );
COMMENT ON TABLE external_customer_identities IS 'Identidad por proveedor verificada antes de vincular con cliente interno.';

-- Metadatos y retención de adjuntos; contenido fuera de PostgreSQL.
CREATE TABLE message_attachments (
    id UUID CONSTRAINT nn_message_attachments_id NOT NULL DEFAULT gen_random_uuid(),
    message_id UUID CONSTRAINT nn_message_attachments_message_id NOT NULL,
    storage_key TEXT CONSTRAINT nn_message_attachments_storage_key NOT NULL,
    mime_type TEXT CONSTRAINT nn_message_attachments_mime_type NOT NULL,
    byte_size INTEGER CONSTRAINT nn_message_attachments_byte_size NOT NULL,
    checksum_sha256 TEXT CONSTRAINT nn_message_attachments_checksum_sha256 NOT NULL,
    scan_status TEXT CONSTRAINT nn_message_attachments_scan_status NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_message_attachments_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_message_attachments PRIMARY KEY (id),
    CONSTRAINT uq_message_attachments_1 UNIQUE (storage_key),
    CONSTRAINT ck_message_attachments_1 CHECK (byte_size > 0),
    CONSTRAINT ck_message_attachments_2 CHECK (length(checksum_sha256) = 64),
    CONSTRAINT ck_message_attachments_3 CHECK (scan_status IN ('PENDING', 'CLEAN', 'REJECTED'))
 );
COMMENT ON TABLE message_attachments IS 'Metadatos y retención de adjuntos; contenido fuera de PostgreSQL.';

-- Transcripción de audio con proveedor y resultado separados del original.
CREATE TABLE message_transcriptions (
    id UUID CONSTRAINT nn_message_transcriptions_id NOT NULL DEFAULT gen_random_uuid(),
    attachment_id UUID CONSTRAINT nn_message_transcriptions_attachment_id NOT NULL,
    provider TEXT CONSTRAINT nn_message_transcriptions_provider NOT NULL,
    language_code TEXT,
    text TEXT CONSTRAINT nn_message_transcriptions_text NOT NULL,
    status TEXT CONSTRAINT nn_message_transcriptions_status NOT NULL,
    confidence NUMERIC(7,6),
    created_at TIMESTAMPTZ CONSTRAINT nn_message_transcriptions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_message_transcriptions PRIMARY KEY (id),
    CONSTRAINT uq_message_transcriptions_1 UNIQUE (attachment_id),
    CONSTRAINT ck_message_transcriptions_1 CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    CONSTRAINT ck_message_transcriptions_2 CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT ck_message_transcriptions_3 CHECK (confidence::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE message_transcriptions IS 'Transcripción de audio con proveedor y resultado separados del original.';

-- Historial de asignación y liberación humana.
CREATE TABLE conversation_assignments (
    id UUID CONSTRAINT nn_conversation_assignments_id NOT NULL DEFAULT gen_random_uuid(),
    conversation_id UUID CONSTRAINT nn_conversation_assignments_conversation_id NOT NULL,
    assigned_to UUID CONSTRAINT nn_conversation_assignments_assigned_to NOT NULL,
    assigned_by UUID,
    released_at TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_conversation_assignments_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_conversation_assignments PRIMARY KEY (id)
 );
COMMENT ON TABLE conversation_assignments IS 'Historial de asignación y liberación humana.';

-- Plantillas aprobadas y versionadas por canal e idioma.
CREATE TABLE message_templates (
    id UUID CONSTRAINT nn_message_templates_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_message_templates_code NOT NULL,
    version_number INTEGER CONSTRAINT nn_message_templates_version_number NOT NULL,
    channel TEXT CONSTRAINT nn_message_templates_channel NOT NULL,
    locale TEXT CONSTRAINT nn_message_templates_locale NOT NULL,
    body TEXT CONSTRAINT nn_message_templates_body NOT NULL,
    active BOOLEAN CONSTRAINT nn_message_templates_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_message_templates_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_message_templates_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_message_templates_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_message_templates PRIMARY KEY (id),
    CONSTRAINT uq_message_templates_1 UNIQUE (code, version_number, locale),
    CONSTRAINT ck_message_templates_1 CHECK (version_number > 0),
    CONSTRAINT ck_message_templates_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE message_templates IS 'Plantillas aprobadas y versionadas por canal e idioma.';

-- Monedas ISO; una moneda por documento, sin conversión implícita.
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
COMMENT ON TABLE currencies IS 'Monedas ISO; una moneda por documento, sin conversión implícita.';

-- Cuenta independiente de mesa; total calculado desde líneas.
CREATE TABLE bills (
    id UUID CONSTRAINT nn_bills_id NOT NULL DEFAULT gen_random_uuid(),
    customer_id UUID,
    currency_id UUID CONSTRAINT nn_bills_currency_id NOT NULL,
    name TEXT,
    status TEXT CONSTRAINT nn_bills_status NOT NULL DEFAULT 'OPEN',
    issued_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    void_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_bills_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_bills_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_bills_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_bills PRIMARY KEY (id),
    CONSTRAINT ck_bills_1 CHECK (status IN ('OPEN', 'ISSUED', 'PAID', 'VOID')),
    CONSTRAINT ck_bills_2 CHECK (row_version > 0)
 );
COMMENT ON TABLE bills IS 'Cuenta independiente de mesa; total calculado desde líneas.';

-- Una cuenta reúne pedidos; un pedido se divide entre cuentas.
CREATE TABLE bill_orders (
    id UUID CONSTRAINT nn_bill_orders_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_bill_orders_bill_id NOT NULL,
    order_id UUID CONSTRAINT nn_bill_orders_order_id NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_bill_orders_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_bill_orders PRIMARY KEY (id),
    CONSTRAINT uq_bill_orders_1 UNIQUE (bill_id, order_id)
 );
COMMENT ON TABLE bill_orders IS 'Una cuenta reúne pedidos; un pedido se divide entre cuentas.';

-- Fracción facturable de una línea o cargo explícito; importes históricos.
CREATE TABLE bill_items (
    id UUID CONSTRAINT nn_bill_items_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_bill_items_bill_id NOT NULL,
    order_item_id UUID,
    line_type TEXT CONSTRAINT nn_bill_items_line_type NOT NULL,
    description_snapshot TEXT CONSTRAINT nn_bill_items_description_snapshot NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_bill_items_quantity NOT NULL,
    unit_price NUMERIC(14,2) CONSTRAINT nn_bill_items_unit_price NOT NULL,
    discount_amount NUMERIC(14,2) CONSTRAINT nn_bill_items_discount_amount NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) CONSTRAINT nn_bill_items_tax_amount NOT NULL DEFAULT 0,
    tax_rate_snapshot NUMERIC(9,6) CONSTRAINT nn_bill_items_tax_rate_snapshot NOT NULL DEFAULT 0,
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_bill_items_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_bill_items PRIMARY KEY (id),
    CONSTRAINT ck_bill_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_bill_items_2 CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0),
    CONSTRAINT ck_bill_items_3 CHECK (discount_amount <= round(quantity * unit_price, 2)),
    CONSTRAINT ck_bill_items_4 CHECK (tax_rate_snapshot >= 0),
    CONSTRAINT ck_bill_items_5 CHECK (line_type IN ('SALE', 'DELIVERY_FEE', 'SERVICE_FEE')),
    CONSTRAINT ck_bill_items_6 CHECK (line_type <> 'SALE' OR order_item_id IS NOT NULL),
    CONSTRAINT ck_bill_items_7 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_bill_items_8 CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_bill_items_9 CHECK (discount_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_bill_items_10 CHECK (tax_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_bill_items_11 CHECK (tax_rate_snapshot::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE bill_items IS 'Fracción facturable de una línea o cargo explícito; importes históricos.';

-- Métodos configurables; distingue efectivo para caja.
CREATE TABLE payment_methods (
    id UUID CONSTRAINT nn_payment_methods_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_payment_methods_code NOT NULL,
    name TEXT CONSTRAINT nn_payment_methods_name NOT NULL,
    is_cash BOOLEAN CONSTRAINT nn_payment_methods_is_cash NOT NULL DEFAULT false,
    active BOOLEAN CONSTRAINT nn_payment_methods_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_methods_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_payment_methods_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_payment_methods_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_payment_methods PRIMARY KEY (id),
    CONSTRAINT uq_payment_methods_1 UNIQUE (code),
    CONSTRAINT ck_payment_methods_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE payment_methods IS 'Métodos configurables; distingue efectivo para caja.';

-- Intento/cobro individual parcial de una cuenta; no almacena PAN/CVV.
CREATE TABLE payments (
    id UUID CONSTRAINT nn_payments_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_payments_bill_id NOT NULL,
    payment_method_id UUID CONSTRAINT nn_payments_payment_method_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_payments_amount NOT NULL,
    status TEXT CONSTRAINT nn_payments_status NOT NULL DEFAULT 'CREATED',
    provider TEXT,
    provider_reference TEXT,
    paid_at TIMESTAMPTZ,
    received_by UUID,
    request_id UUID,
    correlation_id UUID,
    client_action_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_payments_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_payments_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_payments_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_payments PRIMARY KEY (id),
    CONSTRAINT uq_payments_1 UNIQUE (provider, provider_reference),
    CONSTRAINT ck_payments_1 CHECK (amount > 0),
    CONSTRAINT ck_payments_2 CHECK (status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED')),
    CONSTRAINT ck_payments_3 CHECK (status <> 'CAPTURED' OR paid_at IS NOT NULL),
    CONSTRAINT ck_payments_4 CHECK ((provider IS NULL) = (provider_reference IS NULL)),
    CONSTRAINT ck_payments_5 CHECK (row_version > 0),
    CONSTRAINT ck_payments_6 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payments IS 'Intento/cobro individual parcial de una cuenta; no almacena PAN/CVV.';

-- Intento de pasarela autorizado por backend; no almacena PAN/CVV.
CREATE TABLE payment_intents (
    id UUID CONSTRAINT nn_payment_intents_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_payment_intents_bill_id NOT NULL,
    provider TEXT CONSTRAINT nn_payment_intents_provider NOT NULL,
    provider_intent_id TEXT,
    amount NUMERIC(14,2) CONSTRAINT nn_payment_intents_amount NOT NULL,
    currency_id UUID CONSTRAINT nn_payment_intents_currency_id NOT NULL,
    status TEXT CONSTRAINT nn_payment_intents_status NOT NULL DEFAULT 'CREATED',
    idempotency_key TEXT CONSTRAINT nn_payment_intents_idempotency_key NOT NULL,
    requires_action_url TEXT,
    expires_at TIMESTAMPTZ,
    captured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_intents_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_payment_intents_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_payment_intents_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_payment_intents PRIMARY KEY (id),
    CONSTRAINT uq_payment_intents_1 UNIQUE (provider, provider_intent_id),
    CONSTRAINT uq_payment_intents_2 UNIQUE (provider, idempotency_key),
    CONSTRAINT ck_payment_intents_1 CHECK (amount > 0),
    CONSTRAINT ck_payment_intents_2 CHECK (status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED')),
    CONSTRAINT ck_payment_intents_3 CHECK (row_version > 0),
    CONSTRAINT ck_payment_intents_4 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payment_intents IS 'Intento de pasarela autorizado por backend; no almacena PAN/CVV.';

-- Evento crudo referenciado para deduplicación y conciliación de webhook.
CREATE TABLE payment_gateway_events (
    id UUID CONSTRAINT nn_payment_gateway_events_id NOT NULL DEFAULT gen_random_uuid(),
    payment_intent_id UUID,
    provider TEXT CONSTRAINT nn_payment_gateway_events_provider NOT NULL,
    provider_event_id TEXT CONSTRAINT nn_payment_gateway_events_provider_event_id NOT NULL,
    event_type TEXT CONSTRAINT nn_payment_gateway_events_event_type NOT NULL,
    payload_hash TEXT CONSTRAINT nn_payment_gateway_events_payload_hash NOT NULL,
    received_at TIMESTAMPTZ CONSTRAINT nn_payment_gateway_events_received_at NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processing_status TEXT CONSTRAINT nn_payment_gateway_events_processing_status NOT NULL DEFAULT 'RECEIVED',
    error_code TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_gateway_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_payment_gateway_events PRIMARY KEY (id),
    CONSTRAINT uq_payment_gateway_events_1 UNIQUE (provider, provider_event_id),
    CONSTRAINT ck_payment_gateway_events_1 CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')),
    CONSTRAINT ck_payment_gateway_events_2 CHECK (length(payload_hash) = 64)
 );
COMMENT ON TABLE payment_gateway_events IS 'Evento crudo referenciado para deduplicación y conciliación de webhook.';

-- Distribuye el cobro entre venta y propina.
CREATE TABLE payment_allocations (
    id UUID CONSTRAINT nn_payment_allocations_id NOT NULL DEFAULT gen_random_uuid(),
    payment_id UUID CONSTRAINT nn_payment_allocations_payment_id NOT NULL,
    tip_id UUID,
    allocation_type TEXT CONSTRAINT nn_payment_allocations_allocation_type NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_payment_allocations_amount NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_allocations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_payment_allocations PRIMARY KEY (id),
    CONSTRAINT ck_payment_allocations_1 CHECK (amount > 0),
    CONSTRAINT ck_payment_allocations_2 CHECK (allocation_type IN ('SALE', 'TIP')),
    CONSTRAINT ck_payment_allocations_3 CHECK ((allocation_type = 'TIP') = (tip_id IS NOT NULL)),
    CONSTRAINT ck_payment_allocations_4 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payment_allocations IS 'Distribuye el cobro entre venta y propina.';

-- Reembolso explícito sin borrar el pago original.
CREATE TABLE payment_refunds (
    id UUID CONSTRAINT nn_payment_refunds_id NOT NULL DEFAULT gen_random_uuid(),
    payment_id UUID CONSTRAINT nn_payment_refunds_payment_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_payment_refunds_amount NOT NULL,
    status TEXT CONSTRAINT nn_payment_refunds_status NOT NULL DEFAULT 'PENDING',
    reason TEXT CONSTRAINT nn_payment_refunds_reason NOT NULL,
    provider_reference TEXT,
    refunded_at TIMESTAMPTZ,
    created_by UUID CONSTRAINT nn_payment_refunds_created_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_refunds_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_payment_refunds_updated_at NOT NULL DEFAULT now(),
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_payment_refunds_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_payment_refunds PRIMARY KEY (id),
    CONSTRAINT ck_payment_refunds_1 CHECK (amount > 0),
    CONSTRAINT ck_payment_refunds_2 CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_payment_refunds_3 CHECK (row_version > 0),
    CONSTRAINT ck_payment_refunds_4 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payment_refunds IS 'Reembolso explícito sin borrar el pago original.';

-- Identifica la parte de venta o propina devuelta.
CREATE TABLE refund_allocations (
    id UUID CONSTRAINT nn_refund_allocations_id NOT NULL DEFAULT gen_random_uuid(),
    refund_id UUID CONSTRAINT nn_refund_allocations_refund_id NOT NULL,
    payment_allocation_id UUID CONSTRAINT nn_refund_allocations_payment_allocation_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_refund_allocations_amount NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_refund_allocations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_refund_allocations PRIMARY KEY (id),
    CONSTRAINT uq_refund_allocations_1 UNIQUE (refund_id, payment_allocation_id),
    CONSTRAINT ck_refund_allocations_1 CHECK (amount > 0),
    CONSTRAINT ck_refund_allocations_2 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE refund_allocations IS 'Identifica la parte de venta o propina devuelta.';

-- Comisión del procesador separada del cobro y la propina.
CREATE TABLE payment_fees (
    id UUID CONSTRAINT nn_payment_fees_id NOT NULL DEFAULT gen_random_uuid(),
    payment_id UUID CONSTRAINT nn_payment_fees_payment_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_payment_fees_amount NOT NULL,
    description TEXT CONSTRAINT nn_payment_fees_description NOT NULL,
    assessed_at TIMESTAMPTZ CONSTRAINT nn_payment_fees_assessed_at NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_fees_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_payment_fees PRIMARY KEY (id),
    CONSTRAINT ck_payment_fees_1 CHECK (amount >= 0),
    CONSTRAINT ck_payment_fees_2 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payment_fees IS 'Comisión del procesador separada del cobro y la propina.';

-- Propina voluntaria separada del ingreso por venta.
CREATE TABLE tips (
    id UUID CONSTRAINT nn_tips_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_tips_bill_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_tips_amount NOT NULL,
    status TEXT CONSTRAINT nn_tips_status NOT NULL DEFAULT 'PLEDGED',
    created_by UUID,
    voided_at TIMESTAMPTZ,
    reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_tips_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_tips_updated_at NOT NULL DEFAULT now(),
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_tips_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_tips PRIMARY KEY (id),
    CONSTRAINT ck_tips_1 CHECK (amount > 0),
    CONSTRAINT ck_tips_2 CHECK (status IN ('PLEDGED', 'COLLECTED', 'DISTRIBUTED', 'VOID')),
    CONSTRAINT ck_tips_3 CHECK (row_version > 0),
    CONSTRAINT ck_tips_4 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE tips IS 'Propina voluntaria separada del ingreso por venta.';

-- Distribución de propina a empleados, pendiente o entregada.
CREATE TABLE tip_distributions (
    id UUID CONSTRAINT nn_tip_distributions_id NOT NULL DEFAULT gen_random_uuid(),
    tip_id UUID CONSTRAINT nn_tip_distributions_tip_id NOT NULL,
    employee_id UUID CONSTRAINT nn_tip_distributions_employee_id NOT NULL,
    amount NUMERIC(14,2) CONSTRAINT nn_tip_distributions_amount NOT NULL,
    paid_at TIMESTAMPTZ,
    cash_movement_id UUID,
    created_by UUID CONSTRAINT nn_tip_distributions_created_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_tip_distributions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_tip_distributions PRIMARY KEY (id),
    CONSTRAINT ck_tip_distributions_1 CHECK (amount > 0),
    CONSTRAINT ck_tip_distributions_2 CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE tip_distributions IS 'Distribución de propina a empleados, pendiente o entregada.';

-- Cajas físicas y moneda de arqueo.
CREATE TABLE cash_registers (
    id UUID CONSTRAINT nn_cash_registers_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_cash_registers_code NOT NULL,
    name TEXT CONSTRAINT nn_cash_registers_name NOT NULL,
    currency_id UUID CONSTRAINT nn_cash_registers_currency_id NOT NULL,
    active BOOLEAN CONSTRAINT nn_cash_registers_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_cash_registers_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_cash_registers_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_cash_registers_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_cash_registers PRIMARY KEY (id),
    CONSTRAINT uq_cash_registers_1 UNIQUE (code),
    CONSTRAINT ck_cash_registers_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE cash_registers IS 'Cajas físicas y moneda de arqueo.';

-- Turno de caja; saldo inicial se asienta como movimiento OPENING.
CREATE TABLE cash_sessions (
    id UUID CONSTRAINT nn_cash_sessions_id NOT NULL DEFAULT gen_random_uuid(),
    cash_register_id UUID CONSTRAINT nn_cash_sessions_cash_register_id NOT NULL,
    opened_by UUID CONSTRAINT nn_cash_sessions_opened_by NOT NULL,
    opened_at TIMESTAMPTZ CONSTRAINT nn_cash_sessions_opened_at NOT NULL DEFAULT now(),
    closed_by UUID,
    closed_at TIMESTAMPTZ,
    status TEXT CONSTRAINT nn_cash_sessions_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ CONSTRAINT nn_cash_sessions_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_cash_sessions_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_cash_sessions_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_cash_sessions PRIMARY KEY (id),
    CONSTRAINT ck_cash_sessions_1 CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED')),
    CONSTRAINT ck_cash_sessions_2 CHECK (closed_at IS NULL OR closed_at >= opened_at),
    CONSTRAINT ck_cash_sessions_3 CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
    CONSTRAINT ck_cash_sessions_4 CHECK (row_version > 0)
 );
COMMENT ON TABLE cash_sessions IS 'Turno de caja; saldo inicial se asienta como movimiento OPENING.';

-- Libro de caja firmado; efectivo neto recibido, egresos y reversos.
CREATE TABLE cash_movements (
    id UUID CONSTRAINT nn_cash_movements_id NOT NULL DEFAULT gen_random_uuid(),
    cash_session_id UUID CONSTRAINT nn_cash_movements_cash_session_id NOT NULL,
    movement_type TEXT CONSTRAINT nn_cash_movements_movement_type NOT NULL,
    amount_delta NUMERIC(14,2) CONSTRAINT nn_cash_movements_amount_delta NOT NULL,
    payment_id UUID,
    refund_id UUID,
    reversal_of_id UUID,
    reason TEXT CONSTRAINT nn_cash_movements_reason NOT NULL,
    responsible_user_id UUID CONSTRAINT nn_cash_movements_responsible_user_id NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_cash_movements_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_cash_movements_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_cash_movements PRIMARY KEY (id),
    CONSTRAINT uq_cash_movements_1 UNIQUE (payment_id),
    CONSTRAINT uq_cash_movements_2 UNIQUE (refund_id),
    CONSTRAINT uq_cash_movements_3 UNIQUE (reversal_of_id),
    CONSTRAINT ck_cash_movements_1 CHECK (movement_type IN ('OPENING', 'SALE', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'REFUND', 'TIP_PAYOUT', 'REVERSAL')),
    CONSTRAINT ck_cash_movements_2 CHECK (amount_delta <> 0 OR movement_type = 'OPENING'),
    CONSTRAINT ck_cash_movements_3 CHECK (movement_type NOT IN ('EXPENSE','WITHDRAWAL','REFUND','TIP_PAYOUT') OR amount_delta < 0),
    CONSTRAINT ck_cash_movements_4 CHECK (movement_type NOT IN ('OPENING','SALE','INCOME') OR amount_delta >= 0),
    CONSTRAINT ck_cash_movements_5 CHECK (movement_type <> 'SALE' OR payment_id IS NOT NULL),
    CONSTRAINT ck_cash_movements_6 CHECK (movement_type <> 'REFUND' OR refund_id IS NOT NULL),
    CONSTRAINT ck_cash_movements_7 CHECK (amount_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE cash_movements IS 'Libro de caja firmado; efectivo neto recibido, egresos y reversos.';

-- Arqueo histórico; diferencia calculada, cierre conserva corte.
CREATE TABLE cash_reconciliations (
    id UUID CONSTRAINT nn_cash_reconciliations_id NOT NULL DEFAULT gen_random_uuid(),
    cash_session_id UUID CONSTRAINT nn_cash_reconciliations_cash_session_id NOT NULL,
    expected_cash NUMERIC(14,2) CONSTRAINT nn_cash_reconciliations_expected_cash NOT NULL,
    counted_cash NUMERIC(14,2) CONSTRAINT nn_cash_reconciliations_counted_cash NOT NULL,
    difference NUMERIC(14,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED CONSTRAINT nn_cash_reconciliations_difference NOT NULL,
    counted_by UUID CONSTRAINT nn_cash_reconciliations_counted_by NOT NULL,
    counted_at TIMESTAMPTZ CONSTRAINT nn_cash_reconciliations_counted_at NOT NULL DEFAULT now(),
    is_final BOOLEAN CONSTRAINT nn_cash_reconciliations_is_final NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_cash_reconciliations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_cash_reconciliations PRIMARY KEY (id),
    CONSTRAINT ck_cash_reconciliations_1 CHECK (counted_cash >= 0),
    CONSTRAINT ck_cash_reconciliations_2 CHECK (expected_cash::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_cash_reconciliations_3 CHECK (counted_cash::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_cash_reconciliations_4 CHECK (difference::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE cash_reconciliations IS 'Arqueo histórico; diferencia calculada, cierre conserva corte.';

-- Documento fiscal con emisor/receptor históricos; NIT opcional.
CREATE TABLE invoices (
    id UUID CONSTRAINT nn_invoices_id NOT NULL DEFAULT gen_random_uuid(),
    bill_id UUID CONSTRAINT nn_invoices_bill_id NOT NULL,
    customer_id UUID,
    document_type TEXT CONSTRAINT nn_invoices_document_type NOT NULL,
    original_invoice_id UUID,
    series TEXT,
    document_number TEXT,
    status TEXT CONSTRAINT nn_invoices_status NOT NULL DEFAULT 'DRAFT',
    issuer_snapshot JSONB CONSTRAINT nn_invoices_issuer_snapshot NOT NULL,
    customer_name_snapshot TEXT CONSTRAINT nn_invoices_customer_name_snapshot NOT NULL,
    tax_identifier_snapshot TEXT,
    address_snapshot TEXT,
    currency_id UUID CONSTRAINT nn_invoices_currency_id NOT NULL,
    subtotal NUMERIC(14,2) CONSTRAINT nn_invoices_subtotal NOT NULL,
    tax_total NUMERIC(14,2) CONSTRAINT nn_invoices_tax_total NOT NULL,
    total NUMERIC(14,2) CONSTRAINT nn_invoices_total NOT NULL,
    issued_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    external_authorization TEXT,
    document_uri TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_invoices_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_invoices PRIMARY KEY (id),
    CONSTRAINT uq_invoices_1 UNIQUE (series, document_number),
    CONSTRAINT uq_invoices_2 UNIQUE (external_authorization),
    CONSTRAINT ck_invoices_1 CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE')),
    CONSTRAINT ck_invoices_2 CHECK (status IN ('DRAFT', 'PENDING_CERTIFICATION', 'CERTIFYING', 'CERTIFIED', 'REJECTED', 'UNKNOWN', 'CONTINGENCY', 'CANCELLATION_PENDING', 'CANCELLED')),
    CONSTRAINT ck_invoices_3 CHECK (subtotal >= 0 AND tax_total >= 0 AND total = subtotal + tax_total),
    CONSTRAINT ck_invoices_4 CHECK (document_type <> 'CREDIT_NOTE' OR original_invoice_id IS NOT NULL),
    CONSTRAINT ck_invoices_5 CHECK ((series IS NULL) = (document_number IS NULL)),
    CONSTRAINT ck_invoices_6 CHECK (status <> 'CERTIFIED' OR (series IS NOT NULL AND document_number IS NOT NULL AND external_authorization IS NOT NULL)),
    CONSTRAINT ck_invoices_7 CHECK (subtotal::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoices_8 CHECK (tax_total::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoices_9 CHECK (total::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE invoices IS 'Documento fiscal con emisor/receptor históricos; NIT opcional.';

-- Reserva del pool facturable por documento en una sesión o cuenta.
CREATE TABLE fiscal_allocations (
    id UUID CONSTRAINT nn_fiscal_allocations_id NOT NULL DEFAULT gen_random_uuid(),
    invoice_id UUID CONSTRAINT nn_fiscal_allocations_invoice_id NOT NULL,
    bill_id UUID CONSTRAINT nn_fiscal_allocations_bill_id NOT NULL,
    allocated_amount NUMERIC(14,2) CONSTRAINT nn_fiscal_allocations_allocated_amount NOT NULL,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_fiscal_allocations_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_fiscal_allocations PRIMARY KEY (id),
    CONSTRAINT uq_fiscal_allocations_1 UNIQUE (invoice_id, bill_id),
    CONSTRAINT ck_fiscal_allocations_1 CHECK (allocated_amount > 0),
    CONSTRAINT ck_fiscal_allocations_2 CHECK (allocated_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE fiscal_allocations IS 'Reserva del pool facturable por documento en una sesión o cuenta.';

-- Intento de certificación externa por documento; UNKNOWN requiere conciliación.
CREATE TABLE fiscal_attempts (
    id UUID CONSTRAINT nn_fiscal_attempts_id NOT NULL DEFAULT gen_random_uuid(),
    invoice_id UUID CONSTRAINT nn_fiscal_attempts_invoice_id NOT NULL,
    provider TEXT CONSTRAINT nn_fiscal_attempts_provider NOT NULL,
    request_id UUID CONSTRAINT nn_fiscal_attempts_request_id NOT NULL,
    status TEXT CONSTRAINT nn_fiscal_attempts_status NOT NULL,
    submitted_at TIMESTAMPTZ CONSTRAINT nn_fiscal_attempts_submitted_at NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    provider_reference TEXT,
    error_code TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_fiscal_attempts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_fiscal_attempts PRIMARY KEY (id),
    CONSTRAINT uq_fiscal_attempts_1 UNIQUE (request_id),
    CONSTRAINT ck_fiscal_attempts_1 CHECK (status IN ('PENDING_CERTIFICATION', 'CERTIFYING', 'CERTIFIED', 'REJECTED', 'UNKNOWN', 'CONTINGENCY', 'CANCELLATION_PENDING', 'CANCELLED'))
 );
COMMENT ON TABLE fiscal_attempts IS 'Intento de certificación externa por documento; UNKNOWN requiere conciliación.';

-- XML/PDF/acuses inmutables en storage con hash y referencia fiscal.
CREATE TABLE fiscal_artifacts (
    id UUID CONSTRAINT nn_fiscal_artifacts_id NOT NULL DEFAULT gen_random_uuid(),
    invoice_id UUID CONSTRAINT nn_fiscal_artifacts_invoice_id NOT NULL,
    artifact_type TEXT CONSTRAINT nn_fiscal_artifacts_artifact_type NOT NULL,
    storage_key TEXT CONSTRAINT nn_fiscal_artifacts_storage_key NOT NULL,
    sha256 TEXT CONSTRAINT nn_fiscal_artifacts_sha256 NOT NULL,
    provider_uuid TEXT,
    series TEXT,
    document_number TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_fiscal_artifacts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_fiscal_artifacts PRIMARY KEY (id),
    CONSTRAINT uq_fiscal_artifacts_1 UNIQUE (storage_key),
    CONSTRAINT ck_fiscal_artifacts_1 CHECK (artifact_type IN ('ORIGINAL_XML', 'CERTIFIED_XML', 'PDF', 'ACKNOWLEDGEMENT')),
    CONSTRAINT ck_fiscal_artifacts_2 CHECK (length(sha256) = 64)
 );
COMMENT ON TABLE fiscal_artifacts IS 'XML/PDF/acuses inmutables en storage con hash y referencia fiscal.';

-- Líneas fiscales congeladas; nunca releer precios actuales del menú.
CREATE TABLE invoice_items (
    id UUID CONSTRAINT nn_invoice_items_id NOT NULL DEFAULT gen_random_uuid(),
    invoice_id UUID CONSTRAINT nn_invoice_items_invoice_id NOT NULL,
    bill_item_id UUID,
    description_snapshot TEXT CONSTRAINT nn_invoice_items_description_snapshot NOT NULL,
    quantity NUMERIC(18,6) CONSTRAINT nn_invoice_items_quantity NOT NULL,
    unit_price NUMERIC(14,2) CONSTRAINT nn_invoice_items_unit_price NOT NULL,
    discount_amount NUMERIC(14,2) CONSTRAINT nn_invoice_items_discount_amount NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) CONSTRAINT nn_invoice_items_tax_amount NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) CONSTRAINT nn_invoice_items_line_total NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_invoice_items_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_invoice_items PRIMARY KEY (id),
    CONSTRAINT ck_invoice_items_1 CHECK (quantity > 0),
    CONSTRAINT ck_invoice_items_2 CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0),
    CONSTRAINT ck_invoice_items_3 CHECK (line_total = round(quantity * unit_price, 2) - discount_amount + tax_amount),
    CONSTRAINT ck_invoice_items_4 CHECK (line_total >= 0),
    CONSTRAINT ck_invoice_items_5 CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoice_items_6 CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoice_items_7 CHECK (discount_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoice_items_8 CHECK (tax_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_invoice_items_9 CHECK (line_total::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE invoice_items IS 'Líneas fiscales congeladas; nunca releer precios actuales del menú.';

-- Sesión operativa de IA; sin razonamiento interno.
CREATE TABLE ai_sessions (
    id UUID CONSTRAINT nn_ai_sessions_id NOT NULL DEFAULT gen_random_uuid(),
    conversation_id UUID,
    initiated_by UUID,
    model_reference TEXT CONSTRAINT nn_ai_sessions_model_reference NOT NULL,
    status TEXT CONSTRAINT nn_ai_sessions_status NOT NULL DEFAULT 'ACTIVE',
    started_at TIMESTAMPTZ CONSTRAINT nn_ai_sessions_started_at NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_ai_sessions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_sessions PRIMARY KEY (id),
    CONSTRAINT ck_ai_sessions_1 CHECK (status IN ('ACTIVE', 'COMPLETED', 'HANDED_OFF', 'FAILED'))
 );
COMMENT ON TABLE ai_sessions IS 'Sesión operativa de IA; sin razonamiento interno.';

-- Invocación autorizada de herramienta con datos redactados.
CREATE TABLE ai_tool_calls (
    id UUID CONSTRAINT nn_ai_tool_calls_id NOT NULL DEFAULT gen_random_uuid(),
    ai_session_id UUID CONSTRAINT nn_ai_tool_calls_ai_session_id NOT NULL,
    tool_name TEXT CONSTRAINT nn_ai_tool_calls_tool_name NOT NULL,
    arguments_redacted JSONB CONSTRAINT nn_ai_tool_calls_arguments_redacted NOT NULL,
    result_summary JSONB,
    status TEXT CONSTRAINT nn_ai_tool_calls_status NOT NULL,
    authorized_user_id UUID,
    started_at TIMESTAMPTZ CONSTRAINT nn_ai_tool_calls_started_at NOT NULL,
    finished_at TIMESTAMPTZ,
    request_id UUID CONSTRAINT nn_ai_tool_calls_request_id NOT NULL,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_ai_tool_calls_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_tool_calls PRIMARY KEY (id),
    CONSTRAINT ck_ai_tool_calls_1 CHECK (status IN ('REQUESTED', 'ALLOWED', 'DENIED', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_ai_tool_calls_2 CHECK (finished_at IS NULL OR finished_at >= started_at)
 );
COMMENT ON TABLE ai_tool_calls IS 'Invocación autorizada de herramienta con datos redactados.';

-- Escalamiento a humano y resultado de aceptación.
CREATE TABLE ai_handoffs (
    id UUID CONSTRAINT nn_ai_handoffs_id NOT NULL DEFAULT gen_random_uuid(),
    ai_session_id UUID CONSTRAINT nn_ai_handoffs_ai_session_id NOT NULL,
    conversation_id UUID CONSTRAINT nn_ai_handoffs_conversation_id NOT NULL,
    reason TEXT CONSTRAINT nn_ai_handoffs_reason NOT NULL,
    requested_at TIMESTAMPTZ CONSTRAINT nn_ai_handoffs_requested_at NOT NULL DEFAULT now(),
    accepted_by UUID,
    accepted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_ai_handoffs_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_handoffs PRIMARY KEY (id)
 );
COMMENT ON TABLE ai_handoffs IS 'Escalamiento a humano y resultado de aceptación.';

-- Corrección revisable; jamás dispara aprendizaje automático.
CREATE TABLE ai_feedback (
    id UUID CONSTRAINT nn_ai_feedback_id NOT NULL DEFAULT gen_random_uuid(),
    ai_session_id UUID CONSTRAINT nn_ai_feedback_ai_session_id NOT NULL,
    message_id UUID,
    rating INTEGER,
    outcome TEXT CONSTRAINT nn_ai_feedback_outcome NOT NULL,
    human_answer TEXT,
    correction TEXT,
    category TEXT,
    status TEXT CONSTRAINT nn_ai_feedback_status NOT NULL DEFAULT 'RECORDED',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_ai_feedback_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_feedback PRIMARY KEY (id),
    CONSTRAINT ck_ai_feedback_1 CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    CONSTRAINT ck_ai_feedback_2 CHECK (status IN ('RECORDED', 'TRAINING_CANDIDATE', 'APPROVED', 'REJECTED'))
 );
COMMENT ON TABLE ai_feedback IS 'Corrección revisable; jamás dispara aprendizaje automático.';

-- Dataset versionado aprobado por humano para entrenamiento separado.
CREATE TABLE ai_dataset_versions (
    id UUID CONSTRAINT nn_ai_dataset_versions_id NOT NULL DEFAULT gen_random_uuid(),
    version_tag TEXT CONSTRAINT nn_ai_dataset_versions_version_tag NOT NULL,
    storage_key TEXT CONSTRAINT nn_ai_dataset_versions_storage_key NOT NULL,
    sha256 TEXT CONSTRAINT nn_ai_dataset_versions_sha256 NOT NULL,
    record_count INTEGER CONSTRAINT nn_ai_dataset_versions_record_count NOT NULL,
    status TEXT CONSTRAINT nn_ai_dataset_versions_status NOT NULL DEFAULT 'DRAFT',
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ CONSTRAINT nn_ai_dataset_versions_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_dataset_versions PRIMARY KEY (id),
    CONSTRAINT uq_ai_dataset_versions_1 UNIQUE (version_tag),
    CONSTRAINT ck_ai_dataset_versions_1 CHECK (record_count >= 0),
    CONSTRAINT ck_ai_dataset_versions_2 CHECK (length(sha256) = 64),
    CONSTRAINT ck_ai_dataset_versions_3 CHECK (status IN ('DRAFT', 'REVIEWED', 'APPROVED', 'RETIRED'))
 );
COMMENT ON TABLE ai_dataset_versions IS 'Dataset versionado aprobado por humano para entrenamiento separado.';

-- Extracción visual no equivale a pago confirmado.
CREATE TABLE voucher_evidence (
    id UUID CONSTRAINT nn_voucher_evidence_id NOT NULL DEFAULT gen_random_uuid(),
    payment_id UUID,
    order_id UUID,
    storage_key TEXT CONSTRAINT nn_voucher_evidence_storage_key NOT NULL,
    sha256 TEXT CONSTRAINT nn_voucher_evidence_sha256 NOT NULL,
    status TEXT CONSTRAINT nn_voucher_evidence_status NOT NULL DEFAULT 'RECEIVED',
    extracted_fields JSONB CONSTRAINT nn_voucher_evidence_extracted_fields NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ CONSTRAINT nn_voucher_evidence_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_voucher_evidence PRIMARY KEY (id),
    CONSTRAINT uq_voucher_evidence_1 UNIQUE (sha256),
    CONSTRAINT ck_voucher_evidence_1 CHECK (status IN ('RECEIVED', 'EXTRACTED', 'MATCHED', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED')),
    CONSTRAINT ck_voucher_evidence_2 CHECK (length(sha256) = 64)
 );
COMMENT ON TABLE voucher_evidence IS 'Extracción visual no equivale a pago confirmado.';

-- Fuentes de cámara; credenciales en gestor de secretos externo.
CREATE TABLE camera_sources (
    id UUID CONSTRAINT nn_camera_sources_id NOT NULL DEFAULT gen_random_uuid(),
    code TEXT CONSTRAINT nn_camera_sources_code NOT NULL,
    name TEXT CONSTRAINT nn_camera_sources_name NOT NULL,
    location_description TEXT CONSTRAINT nn_camera_sources_location_description NOT NULL,
    stream_reference TEXT CONSTRAINT nn_camera_sources_stream_reference NOT NULL,
    active BOOLEAN CONSTRAINT nn_camera_sources_active NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ CONSTRAINT nn_camera_sources_created_at NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ CONSTRAINT nn_camera_sources_updated_at NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    row_version INTEGER CONSTRAINT nn_camera_sources_row_version NOT NULL DEFAULT 1,
    CONSTRAINT pk_camera_sources PRIMARY KEY (id),
    CONSTRAINT uq_camera_sources_1 UNIQUE (code),
    CONSTRAINT ck_camera_sources_1 CHECK (row_version > 0)
 );
COMMENT ON TABLE camera_sources IS 'Fuentes de cámara; credenciales en gestor de secretos externo.';

-- Detección sin video pesado; evidencia externa opcional.
CREATE TABLE vision_events (
    id UUID CONSTRAINT nn_vision_events_id NOT NULL DEFAULT gen_random_uuid(),
    camera_source_id UUID CONSTRAINT nn_vision_events_camera_source_id NOT NULL,
    event_type TEXT CONSTRAINT nn_vision_events_event_type NOT NULL,
    confidence NUMERIC(7,6) CONSTRAINT nn_vision_events_confidence NOT NULL,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_vision_events_occurred_at NOT NULL,
    model_reference TEXT CONSTRAINT nn_vision_events_model_reference NOT NULL,
    evidence_uri TEXT,
    evidence_expires_at TIMESTAMPTZ,
    metadata JSONB CONSTRAINT nn_vision_events_metadata NOT NULL DEFAULT '{}'::jsonb,
    correlation_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_vision_events_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_vision_events PRIMARY KEY (id),
    CONSTRAINT ck_vision_events_1 CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT ck_vision_events_2 CHECK (confidence::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE vision_events IS 'Detección sin video pesado; evidencia externa opcional.';

-- Evaluación humana; decisiones previas se conservan.
CREATE TABLE vision_event_reviews (
    id UUID CONSTRAINT nn_vision_event_reviews_id NOT NULL DEFAULT gen_random_uuid(),
    vision_event_id UUID CONSTRAINT nn_vision_event_reviews_vision_event_id NOT NULL,
    reviewer_user_id UUID CONSTRAINT nn_vision_event_reviews_reviewer_user_id NOT NULL,
    decision TEXT CONSTRAINT nn_vision_event_reviews_decision NOT NULL,
    reason TEXT CONSTRAINT nn_vision_event_reviews_reason NOT NULL,
    reviewed_at TIMESTAMPTZ CONSTRAINT nn_vision_event_reviews_reviewed_at NOT NULL DEFAULT now(),
    supersedes_review_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_vision_event_reviews_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_vision_event_reviews PRIMARY KEY (id),
    CONSTRAINT uq_vision_event_reviews_1 UNIQUE (supersedes_review_id),
    CONSTRAINT ck_vision_event_reviews_1 CHECK (decision IN ('CONFIRM', 'REJECT'))
 );
COMMENT ON TABLE vision_event_reviews IS 'Evaluación humana; decisiones previas se conservan.';

-- Auditoría independiente de la vida de la entidad; snapshots redactados.
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
COMMENT ON TABLE audit_logs IS 'Auditoría independiente de la vida de la entidad; snapshots redactados.';

-- Configuración versionada por clave; valor JSON validado por contrato.
CREATE TABLE system_settings (
    id UUID CONSTRAINT nn_system_settings_id NOT NULL DEFAULT gen_random_uuid(),
    key TEXT CONSTRAINT nn_system_settings_key NOT NULL,
    version_number INTEGER CONSTRAINT nn_system_settings_version_number NOT NULL,
    value JSONB CONSTRAINT nn_system_settings_value NOT NULL,
    value_schema_version INTEGER CONSTRAINT nn_system_settings_value_schema_version NOT NULL,
    effective_from TIMESTAMPTZ CONSTRAINT nn_system_settings_effective_from NOT NULL,
    retired_at TIMESTAMPTZ,
    reason TEXT CONSTRAINT nn_system_settings_reason NOT NULL,
    created_by UUID CONSTRAINT nn_system_settings_created_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_system_settings_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_system_settings PRIMARY KEY (id),
    CONSTRAINT uq_system_settings_1 UNIQUE (key, version_number),
    CONSTRAINT ck_system_settings_1 CHECK (version_number > 0 AND value_schema_version > 0),
    CONSTRAINT ck_system_settings_2 CHECK (retired_at IS NULL OR retired_at > effective_from)
 );
COMMENT ON TABLE system_settings IS 'Configuración versionada por clave; valor JSON validado por contrato.';

-- Ventanas semanales locales; cruces de medianoche se dividen en dos filas.
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
COMMENT ON TABLE business_hours IS 'Ventanas semanales locales; cruces de medianoche se dividen en dos filas.';

-- Evento transaccional para publicación al menos una vez; distinto de auditoría.
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
COMMENT ON TABLE outbox_events IS 'Evento transaccional para publicación al menos una vez; distinto de auditoría.';

-- Correo transaccional en cola; no bloquea el commit de negocio.
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
COMMENT ON TABLE email_outbox IS 'Correo transaccional en cola; no bloquea el commit de negocio.';

-- Reserva durable por principal, operación y clave para mutaciones críticas.
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
COMMENT ON TABLE idempotency_keys IS 'Reserva durable por principal, operación y clave para mutaciones críticas.';

-- Historial de transiciones con responsable y motivo.
CREATE TABLE production_batch_status_history (
    id UUID CONSTRAINT nn_production_batch_status_history_id NOT NULL DEFAULT gen_random_uuid(),
    production_batch_id UUID CONSTRAINT nn_production_batch_status_history_production_batch_id NOT NULL,
    from_status TEXT,
    to_status TEXT CONSTRAINT nn_production_batch_status_history_to_status NOT NULL,
    reason TEXT,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ CONSTRAINT nn_production_batch_status_history_occurred_at NOT NULL DEFAULT now(),
    request_id UUID,
    created_at TIMESTAMPTZ CONSTRAINT nn_production_batch_status_history_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_production_batch_status_history PRIMARY KEY (id),
    CONSTRAINT ck_production_batch_status_history_1 CHECK (to_status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))
 );
COMMENT ON TABLE production_batch_status_history IS 'Historial de transiciones con responsable y motivo.';

-- Comprobante no fiscal inmutable de cobro; distinto de factura y recepción de mercadería.
CREATE TABLE payment_receipts (
    id UUID CONSTRAINT nn_payment_receipts_id NOT NULL DEFAULT gen_random_uuid(),
    payment_id UUID CONSTRAINT nn_payment_receipts_payment_id NOT NULL,
    receipt_number TEXT CONSTRAINT nn_payment_receipts_receipt_number NOT NULL,
    issued_at TIMESTAMPTZ CONSTRAINT nn_payment_receipts_issued_at NOT NULL,
    amount_snapshot NUMERIC(14,2) CONSTRAINT nn_payment_receipts_amount_snapshot NOT NULL,
    currency_id UUID CONSTRAINT nn_payment_receipts_currency_id NOT NULL,
    payer_name_snapshot TEXT,
    document_uri TEXT,
    issued_by UUID CONSTRAINT nn_payment_receipts_issued_by NOT NULL,
    created_at TIMESTAMPTZ CONSTRAINT nn_payment_receipts_created_at NOT NULL DEFAULT now(),
    CONSTRAINT pk_payment_receipts PRIMARY KEY (id),
    CONSTRAINT uq_payment_receipts_1 UNIQUE (payment_id),
    CONSTRAINT uq_payment_receipts_2 UNIQUE (receipt_number),
    CONSTRAINT ck_payment_receipts_1 CHECK (amount_snapshot > 0),
    CONSTRAINT ck_payment_receipts_2 CHECK (amount_snapshot::text NOT IN ('NaN', 'Infinity', '-Infinity'))
 );
COMMENT ON TABLE payment_receipts IS 'Comprobante no fiscal inmutable de cobro; distinto de factura y recepción de mercadería.';
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
ALTER TABLE guest_access_tokens ADD CONSTRAINT fk_guest_access_tokens_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_session_id FOREIGN KEY (session_id) REFERENCES auth_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_profiles ADD CONSTRAINT fk_customer_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE employee_profiles ADD CONSTRAINT fk_employee_profiles_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE employee_profiles ADD CONSTRAINT fk_employee_profiles_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE employee_profiles ADD CONSTRAINT fk_employee_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_addresses ADD CONSTRAINT fk_customer_addresses_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_addresses ADD CONSTRAINT fk_customer_addresses_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_addresses ADD CONSTRAINT fk_customer_addresses_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_incidents ADD CONSTRAINT fk_customer_incidents_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_incidents ADD CONSTRAINT fk_customer_incidents_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_incidents ADD CONSTRAINT fk_customer_incidents_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_restrictions ADD CONSTRAINT fk_customer_restrictions_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_restrictions ADD CONSTRAINT fk_customer_restrictions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE customer_restrictions ADD CONSTRAINT fk_customer_restrictions_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_employee_id FOREIGN KEY (employee_id) REFERENCES employee_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_preparation_area_id FOREIGN KEY (preparation_area_id) REFERENCES preparation_areas (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE schedule_exceptions ADD CONSTRAINT fk_schedule_exceptions_employee_id FOREIGN KEY (employee_id) REFERENCES employee_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE schedule_exceptions ADD CONSTRAINT fk_schedule_exceptions_schedule_id FOREIGN KEY (schedule_id) REFERENCES staff_schedules (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE schedule_exceptions ADD CONSTRAINT fk_schedule_exceptions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE schedule_exceptions ADD CONSTRAINT fk_schedule_exceptions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_tables ADD CONSTRAINT fk_dining_tables_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_tables ADD CONSTRAINT fk_dining_tables_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_table_status_history ADD CONSTRAINT fk_dining_table_status_history_dining_table_id FOREIGN KEY (dining_table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_table_status_history ADD CONSTRAINT fk_dining_table_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_evaluations ADD CONSTRAINT fk_reservation_evaluations_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_status_history ADD CONSTRAINT fk_reservation_status_history_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_status_history ADD CONSTRAINT fk_reservation_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_table_id FOREIGN KEY (table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT fk_reservation_table_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_sessions ADD CONSTRAINT fk_dining_sessions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_dining_session_id FOREIGN KEY (dining_session_id) REFERENCES dining_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_table_id FOREIGN KEY (table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dining_session_tables ADD CONSTRAINT fk_dining_session_tables_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE items ADD CONSTRAINT fk_items_item_type_id FOREIGN KEY (item_type_id) REFERENCES item_types (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE items ADD CONSTRAINT fk_items_base_unit_id FOREIGN KEY (base_unit_id) REFERENCES units (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE items ADD CONSTRAINT fk_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE items ADD CONSTRAINT fk_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE presentations ADD CONSTRAINT fk_presentations_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE presentations ADD CONSTRAINT fk_presentations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE presentations ADD CONSTRAINT fk_presentations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipes ADD CONSTRAINT fk_recipes_output_item_id FOREIGN KEY (output_item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipes ADD CONSTRAINT fk_recipes_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipes ADD CONSTRAINT fk_recipes_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipe_versions ADD CONSTRAINT fk_recipe_versions_recipe_id FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipe_versions ADD CONSTRAINT fk_recipe_versions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipe_components ADD CONSTRAINT fk_recipe_components_recipe_version_id FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipe_components ADD CONSTRAINT fk_recipe_components_component_item_id FOREIGN KEY (component_item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE recipe_components ADD CONSTRAINT fk_recipe_components_component_recipe_version_id FOREIGN KEY (component_recipe_version_id) REFERENCES recipe_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_categories ADD CONSTRAINT fk_menu_categories_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_categories ADD CONSTRAINT fk_menu_categories_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE preparation_areas ADD CONSTRAINT fk_preparation_areas_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE preparation_areas ADD CONSTRAINT fk_preparation_areas_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_recipe_version_id FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_category_id FOREIGN KEY (category_id) REFERENCES menu_categories (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_preparation_area_id FOREIGN KEY (preparation_area_id) REFERENCES preparation_areas (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifier_groups ADD CONSTRAINT fk_modifier_groups_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifier_groups ADD CONSTRAINT fk_modifier_groups_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifiers ADD CONSTRAINT fk_modifiers_group_id FOREIGN KEY (group_id) REFERENCES modifier_groups (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifiers ADD CONSTRAINT fk_modifiers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifiers ADD CONSTRAINT fk_modifiers_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_item_modifier_groups ADD CONSTRAINT fk_menu_item_modifier_groups_menu_item_id FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_item_modifier_groups ADD CONSTRAINT fk_menu_item_modifier_groups_group_id FOREIGN KEY (group_id) REFERENCES modifier_groups (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifier_item_impacts ADD CONSTRAINT fk_modifier_item_impacts_modifier_id FOREIGN KEY (modifier_id) REFERENCES modifiers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE modifier_item_impacts ADD CONSTRAINT fk_modifier_item_impacts_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_locations ADD CONSTRAINT fk_inventory_locations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_locations ADD CONSTRAINT fk_inventory_locations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_lots ADD CONSTRAINT fk_inventory_lots_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_lots ADD CONSTRAINT fk_inventory_lots_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_lots ADD CONSTRAINT fk_inventory_lots_goods_receipt_item_id FOREIGN KEY (goods_receipt_item_id) REFERENCES goods_receipt_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_lots ADD CONSTRAINT fk_inventory_lots_production_output_id FOREIGN KEY (production_output_id) REFERENCES production_outputs (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_balances ADD CONSTRAINT fk_inventory_balances_lot_id FOREIGN KEY (lot_id) REFERENCES inventory_lots (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_balances ADD CONSTRAINT fk_inventory_balances_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_balances ADD CONSTRAINT fk_inventory_balances_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_balances ADD CONSTRAINT fk_inventory_balances_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_lot_id FOREIGN KEY (lot_id) REFERENCES inventory_lots (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_goods_receipt_item_id FOREIGN KEY (goods_receipt_item_id) REFERENCES goods_receipt_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_production_consumption_id FOREIGN KEY (production_consumption_id) REFERENCES production_consumptions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_production_output_id FOREIGN KEY (production_output_id) REFERENCES production_outputs (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_transfer_id FOREIGN KEY (transfer_id) REFERENCES inventory_transfers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_reversal_of_id FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_transfers ADD CONSTRAINT fk_inventory_transfers_source_location_id FOREIGN KEY (source_location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_transfers ADD CONSTRAINT fk_inventory_transfers_destination_location_id FOREIGN KEY (destination_location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_transfers ADD CONSTRAINT fk_inventory_transfers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_thresholds ADD CONSTRAINT fk_stock_thresholds_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_thresholds ADD CONSTRAINT fk_stock_thresholds_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_thresholds ADD CONSTRAINT fk_stock_thresholds_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_thresholds ADD CONSTRAINT fk_stock_thresholds_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_allocations ADD CONSTRAINT fk_inventory_allocations_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_allocations ADD CONSTRAINT fk_inventory_allocations_production_order_id FOREIGN KEY (production_order_id) REFERENCES production_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_allocations ADD CONSTRAINT fk_inventory_allocations_lot_id FOREIGN KEY (lot_id) REFERENCES inventory_lots (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory_allocations ADD CONSTRAINT fk_inventory_allocations_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_items ADD CONSTRAINT fk_supplier_items_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_items ADD CONSTRAINT fk_supplier_items_presentation_id FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_items ADD CONSTRAINT fk_supplier_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_items ADD CONSTRAINT fk_supplier_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_item_prices ADD CONSTRAINT fk_supplier_item_prices_supplier_item_id FOREIGN KEY (supplier_item_id) REFERENCES supplier_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE supplier_item_prices ADD CONSTRAINT fk_supplier_item_prices_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_purchase_order_id FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_presentation_id FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_items ADD CONSTRAINT fk_purchase_order_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_status_history ADD CONSTRAINT fk_purchase_order_status_history_purchase_order_id FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE purchase_order_status_history ADD CONSTRAINT fk_purchase_order_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipts ADD CONSTRAINT fk_goods_receipts_purchase_order_id FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipts ADD CONSTRAINT fk_goods_receipts_received_by FOREIGN KEY (received_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipts ADD CONSTRAINT fk_goods_receipts_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipts ADD CONSTRAINT fk_goods_receipts_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipt_items ADD CONSTRAINT fk_goods_receipt_items_goods_receipt_id FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipt_items ADD CONSTRAINT fk_goods_receipt_items_purchase_order_item_id FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE goods_receipt_items ADD CONSTRAINT fk_goods_receipt_items_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_recipe_version_id FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_suggested_by_ai_session_id FOREIGN KEY (suggested_by_ai_session_id) REFERENCES ai_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_accepted_by FOREIGN KEY (accepted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_modified_by FOREIGN KEY (modified_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_rejected_by FOREIGN KEY (rejected_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batches ADD CONSTRAINT fk_production_batches_production_order_id FOREIGN KEY (production_order_id) REFERENCES production_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batches ADD CONSTRAINT fk_production_batches_responsible_user_id FOREIGN KEY (responsible_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batches ADD CONSTRAINT fk_production_batches_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batches ADD CONSTRAINT fk_production_batches_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_consumptions ADD CONSTRAINT fk_production_consumptions_production_batch_id FOREIGN KEY (production_batch_id) REFERENCES production_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_consumptions ADD CONSTRAINT fk_production_consumptions_lot_id FOREIGN KEY (lot_id) REFERENCES inventory_lots (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_consumptions ADD CONSTRAINT fk_production_consumptions_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_outputs ADD CONSTRAINT fk_production_outputs_production_batch_id FOREIGN KEY (production_batch_id) REFERENCES production_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_outputs ADD CONSTRAINT fk_production_outputs_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_outputs ADD CONSTRAINT fk_production_outputs_location_id FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_status_history ADD CONSTRAINT fk_production_status_history_production_order_id FOREIGN KEY (production_order_id) REFERENCES production_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_status_history ADD CONSTRAINT fk_production_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_item_availability_overrides ADD CONSTRAINT fk_menu_item_availability_overrides_menu_item_id FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_item_availability_overrides ADD CONSTRAINT fk_menu_item_availability_overrides_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE menu_item_availability_overrides ADD CONSTRAINT fk_menu_item_availability_overrides_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_status ADD CONSTRAINT fk_service_status_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_status ADD CONSTRAINT fk_service_status_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capabilities ADD CONSTRAINT fk_service_capabilities_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capability_events ADD CONSTRAINT fk_service_capability_events_capability_id FOREIGN KEY (capability_id) REFERENCES service_capabilities (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_capability_events ADD CONSTRAINT fk_service_capability_events_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_status_history ADD CONSTRAINT fk_service_status_history_service_status_id FOREIGN KEY (service_status_id) REFERENCES service_status (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE service_status_history ADD CONSTRAINT fk_service_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE preparation_capacity_slots ADD CONSTRAINT fk_preparation_capacity_slots_preparation_area_id FOREIGN KEY (preparation_area_id) REFERENCES preparation_areas (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE preparation_capacity_slots ADD CONSTRAINT fk_preparation_capacity_slots_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE preparation_capacity_slots ADD CONSTRAINT fk_preparation_capacity_slots_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_table_id FOREIGN KEY (table_id) REFERENCES dining_tables (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_reservation_id FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT fk_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_menu_item_id FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_recipe_version_id FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_replaces_order_item_id FOREIGN KEY (replaces_order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_item_modifiers ADD CONSTRAINT fk_order_item_modifiers_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_item_modifiers ADD CONSTRAINT fk_order_item_modifiers_modifier_id FOREIGN KEY (modifier_id) REFERENCES modifiers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_modifier_item_impacts ADD CONSTRAINT fk_order_modifier_item_impacts_order_item_modifier_id FOREIGN KEY (order_item_modifier_id) REFERENCES order_item_modifiers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_modifier_item_impacts ADD CONSTRAINT fk_order_modifier_item_impacts_item_id FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_status_history ADD CONSTRAINT fk_order_status_history_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_status_history ADD CONSTRAINT fk_order_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_item_status_history ADD CONSTRAINT fk_order_item_status_history_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_item_status_history ADD CONSTRAINT fk_order_item_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_tickets ADD CONSTRAINT fk_kitchen_tickets_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_tickets ADD CONSTRAINT fk_kitchen_tickets_preparation_area_id FOREIGN KEY (preparation_area_id) REFERENCES preparation_areas (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_tickets ADD CONSTRAINT fk_kitchen_tickets_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_tickets ADD CONSTRAINT fk_kitchen_tickets_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_ticket_items ADD CONSTRAINT fk_kitchen_ticket_items_kitchen_ticket_id FOREIGN KEY (kitchen_ticket_id) REFERENCES kitchen_tickets (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_ticket_items ADD CONSTRAINT fk_kitchen_ticket_items_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_ticket_items ADD CONSTRAINT fk_kitchen_ticket_items_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE kitchen_ticket_items ADD CONSTRAINT fk_kitchen_ticket_items_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE delivery_partners ADD CONSTRAINT fk_delivery_partners_employee_id FOREIGN KEY (employee_id) REFERENCES employee_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE delivery_partners ADD CONSTRAINT fk_delivery_partners_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE delivery_partners ADD CONSTRAINT fk_delivery_partners_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT fk_deliveries_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT fk_deliveries_partner_id FOREIGN KEY (partner_id) REFERENCES delivery_partners (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT fk_deliveries_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE deliveries ADD CONSTRAINT fk_deliveries_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE delivery_status_history ADD CONSTRAINT fk_delivery_status_history_deliverie_id FOREIGN KEY (deliverie_id) REFERENCES deliveries (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE delivery_status_history ADD CONSTRAINT fk_delivery_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_sender_user_id FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_ai_session_id FOREIGN KEY (ai_session_id) REFERENCES ai_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_reply_to_message_id FOREIGN KEY (reply_to_message_id) REFERENCES messages (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE external_customer_identities ADD CONSTRAINT fk_external_customer_identities_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE external_customer_identities ADD CONSTRAINT fk_external_customer_identities_linked_by FOREIGN KEY (linked_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE message_attachments ADD CONSTRAINT fk_message_attachments_message_id FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE message_transcriptions ADD CONSTRAINT fk_message_transcriptions_attachment_id FOREIGN KEY (attachment_id) REFERENCES message_attachments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversation_assignments ADD CONSTRAINT fk_conversation_assignments_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversation_assignments ADD CONSTRAINT fk_conversation_assignments_assigned_to FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE conversation_assignments ADD CONSTRAINT fk_conversation_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE message_templates ADD CONSTRAINT fk_message_templates_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE message_templates ADD CONSTRAINT fk_message_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bills ADD CONSTRAINT fk_bills_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bills ADD CONSTRAINT fk_bills_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bills ADD CONSTRAINT fk_bills_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bills ADD CONSTRAINT fk_bills_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bill_orders ADD CONSTRAINT fk_bill_orders_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bill_orders ADD CONSTRAINT fk_bill_orders_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bill_items ADD CONSTRAINT fk_bill_items_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bill_items ADD CONSTRAINT fk_bill_items_order_item_id FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE bill_items ADD CONSTRAINT fk_bill_items_voided_by FOREIGN KEY (voided_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_methods ADD CONSTRAINT fk_payment_methods_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_methods ADD CONSTRAINT fk_payment_methods_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_payment_method_id FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT fk_payments_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_intents ADD CONSTRAINT fk_payment_intents_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_intents ADD CONSTRAINT fk_payment_intents_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_intents ADD CONSTRAINT fk_payment_intents_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_intents ADD CONSTRAINT fk_payment_intents_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_gateway_events ADD CONSTRAINT fk_payment_gateway_events_payment_intent_id FOREIGN KEY (payment_intent_id) REFERENCES payment_intents (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_tip_id FOREIGN KEY (tip_id) REFERENCES tips (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_refunds ADD CONSTRAINT fk_payment_refunds_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_refunds ADD CONSTRAINT fk_payment_refunds_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_refunds ADD CONSTRAINT fk_payment_refunds_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refund_allocations ADD CONSTRAINT fk_refund_allocations_refund_id FOREIGN KEY (refund_id) REFERENCES payment_refunds (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refund_allocations ADD CONSTRAINT fk_refund_allocations_payment_allocation_id FOREIGN KEY (payment_allocation_id) REFERENCES payment_allocations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_fees ADD CONSTRAINT fk_payment_fees_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tips ADD CONSTRAINT fk_tips_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tips ADD CONSTRAINT fk_tips_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tips ADD CONSTRAINT fk_tips_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tip_distributions ADD CONSTRAINT fk_tip_distributions_tip_id FOREIGN KEY (tip_id) REFERENCES tips (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tip_distributions ADD CONSTRAINT fk_tip_distributions_employee_id FOREIGN KEY (employee_id) REFERENCES employee_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tip_distributions ADD CONSTRAINT fk_tip_distributions_cash_movement_id FOREIGN KEY (cash_movement_id) REFERENCES cash_movements (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tip_distributions ADD CONSTRAINT fk_tip_distributions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_registers ADD CONSTRAINT fk_cash_registers_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_registers ADD CONSTRAINT fk_cash_registers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_registers ADD CONSTRAINT fk_cash_registers_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_cash_register_id FOREIGN KEY (cash_register_id) REFERENCES cash_registers (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_opened_by FOREIGN KEY (opened_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_closed_by FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT fk_cash_movements_cash_session_id FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT fk_cash_movements_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT fk_cash_movements_refund_id FOREIGN KEY (refund_id) REFERENCES payment_refunds (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT fk_cash_movements_reversal_of_id FOREIGN KEY (reversal_of_id) REFERENCES cash_movements (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT fk_cash_movements_responsible_user_id FOREIGN KEY (responsible_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_reconciliations ADD CONSTRAINT fk_cash_reconciliations_cash_session_id FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_reconciliations ADD CONSTRAINT fk_cash_reconciliations_counted_by FOREIGN KEY (counted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customer_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_original_invoice_id FOREIGN KEY (original_invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE fiscal_allocations ADD CONSTRAINT fk_fiscal_allocations_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE fiscal_allocations ADD CONSTRAINT fk_fiscal_allocations_bill_id FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE fiscal_attempts ADD CONSTRAINT fk_fiscal_attempts_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE fiscal_artifacts ADD CONSTRAINT fk_fiscal_artifacts_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_bill_item_id FOREIGN KEY (bill_item_id) REFERENCES bill_items (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_sessions ADD CONSTRAINT fk_ai_sessions_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_sessions ADD CONSTRAINT fk_ai_sessions_initiated_by FOREIGN KEY (initiated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_tool_calls ADD CONSTRAINT fk_ai_tool_calls_ai_session_id FOREIGN KEY (ai_session_id) REFERENCES ai_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_tool_calls ADD CONSTRAINT fk_ai_tool_calls_authorized_user_id FOREIGN KEY (authorized_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_handoffs ADD CONSTRAINT fk_ai_handoffs_ai_session_id FOREIGN KEY (ai_session_id) REFERENCES ai_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_handoffs ADD CONSTRAINT fk_ai_handoffs_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_handoffs ADD CONSTRAINT fk_ai_handoffs_accepted_by FOREIGN KEY (accepted_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_feedback ADD CONSTRAINT fk_ai_feedback_ai_session_id FOREIGN KEY (ai_session_id) REFERENCES ai_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_feedback ADD CONSTRAINT fk_ai_feedback_message_id FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_feedback ADD CONSTRAINT fk_ai_feedback_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ai_dataset_versions ADD CONSTRAINT fk_ai_dataset_versions_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE voucher_evidence ADD CONSTRAINT fk_voucher_evidence_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE voucher_evidence ADD CONSTRAINT fk_voucher_evidence_order_id FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE voucher_evidence ADD CONSTRAINT fk_voucher_evidence_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE camera_sources ADD CONSTRAINT fk_camera_sources_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE camera_sources ADD CONSTRAINT fk_camera_sources_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE vision_events ADD CONSTRAINT fk_vision_events_camera_source_id FOREIGN KEY (camera_source_id) REFERENCES camera_sources (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE vision_event_reviews ADD CONSTRAINT fk_vision_event_reviews_vision_event_id FOREIGN KEY (vision_event_id) REFERENCES vision_events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE vision_event_reviews ADD CONSTRAINT fk_vision_event_reviews_reviewer_user_id FOREIGN KEY (reviewer_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE vision_event_reviews ADD CONSTRAINT fk_vision_event_reviews_supersedes_review_id FOREIGN KEY (supersedes_review_id) REFERENCES vision_event_reviews (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE business_hours ADD CONSTRAINT fk_business_hours_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE business_hours ADD CONSTRAINT fk_business_hours_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batch_status_history ADD CONSTRAINT fk_production_batch_status_history_production_batch_id FOREIGN KEY (production_batch_id) REFERENCES production_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE production_batch_status_history ADD CONSTRAINT fk_production_batch_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_receipts ADD CONSTRAINT fk_payment_receipts_payment_id FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_receipts ADD CONSTRAINT fk_payment_receipts_currency_id FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_receipts ADD CONSTRAINT fk_payment_receipts_issued_by FOREIGN KEY (issued_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE special_requests ADD CONSTRAINT fk_special_requests_context FOREIGN KEY (order_item_id, order_id) REFERENCES order_items (id, order_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reservation_table_assignments ADD CONSTRAINT ex_reservation_tables_period EXCLUDE USING gist (table_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL);
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
CREATE INDEX ix_customer_addresses_1 ON customer_addresses (customer_id);
CREATE INDEX ix_customer_incidents_1 ON customer_incidents (customer_id);
CREATE INDEX ix_customer_incidents_2 ON customer_incidents (order_id);
CREATE INDEX ix_customer_restrictions_1 ON customer_restrictions (customer_id);
CREATE INDEX ix_staff_schedules_1 ON staff_schedules (employee_id);
CREATE INDEX ix_staff_schedules_2 ON staff_schedules (preparation_area_id);
CREATE INDEX ix_schedule_exceptions_1 ON schedule_exceptions (employee_id);
CREATE INDEX ix_schedule_exceptions_2 ON schedule_exceptions (schedule_id);
CREATE INDEX ix_dining_table_status_history_1 ON dining_table_status_history (dining_table_id);
CREATE INDEX ix_reservations_1 ON reservations (status, reservation_at, id);
CREATE INDEX ix_reservations_2 ON reservations (customer_id);
CREATE INDEX ix_reservation_evaluations_1 ON reservation_evaluations (reservation_id);
CREATE INDEX ix_reservation_status_history_1 ON reservation_status_history (reservation_id);
CREATE INDEX ix_reservation_table_assignments_1 ON reservation_table_assignments (reservation_id);
CREATE INDEX ix_reservation_table_assignments_2 ON reservation_table_assignments (table_id);
CREATE INDEX ix_dining_sessions_1 ON dining_sessions (reservation_id);
CREATE INDEX ix_dining_sessions_2 ON dining_sessions (customer_id);
CREATE INDEX ix_dining_session_tables_1 ON dining_session_tables (dining_session_id);
CREATE INDEX ix_dining_session_tables_2 ON dining_session_tables (table_id);
CREATE INDEX ix_items_1 ON items (item_type_id);
CREATE INDEX ix_items_2 ON items (base_unit_id);
CREATE INDEX ix_recipes_1 ON recipes (output_item_id);
CREATE INDEX ix_recipe_components_1 ON recipe_components (component_item_id);
CREATE INDEX ix_recipe_components_2 ON recipe_components (component_recipe_version_id);
CREATE INDEX ix_menu_items_1 ON menu_items (category_id, status, display_order, id);
CREATE INDEX ix_menu_items_2 ON menu_items (item_id);
CREATE INDEX ix_menu_items_3 ON menu_items (recipe_version_id);
CREATE INDEX ix_menu_items_4 ON menu_items (preparation_area_id);
CREATE INDEX ix_menu_items_5 ON menu_items (currency_id);
CREATE INDEX ix_menu_item_modifier_groups_1 ON menu_item_modifier_groups (group_id);
CREATE INDEX ix_modifier_item_impacts_1 ON modifier_item_impacts (item_id);
CREATE INDEX ix_inventory_lots_1 ON inventory_lots (item_id, expires_at, id);
CREATE INDEX ix_inventory_lots_2 ON inventory_lots (currency_id);
CREATE INDEX ix_inventory_lots_3 ON inventory_lots (goods_receipt_item_id);
CREATE INDEX ix_inventory_lots_4 ON inventory_lots (production_output_id);
CREATE INDEX ix_inventory_balances_1 ON inventory_balances (location_id);
CREATE INDEX ix_inventory_movements_1 ON inventory_movements (lot_id, location_id, occurred_at, id);
CREATE INDEX ix_inventory_movements_2 ON inventory_movements (location_id);
CREATE INDEX ix_inventory_movements_3 ON inventory_movements (goods_receipt_item_id);
CREATE INDEX ix_inventory_movements_4 ON inventory_movements (production_consumption_id);
CREATE INDEX ix_inventory_movements_5 ON inventory_movements (production_output_id);
CREATE INDEX ix_inventory_movements_6 ON inventory_movements (order_item_id);
CREATE INDEX ix_inventory_movements_7 ON inventory_movements (transfer_id);
CREATE INDEX ix_inventory_transfers_1 ON inventory_transfers (source_location_id);
CREATE INDEX ix_inventory_transfers_2 ON inventory_transfers (destination_location_id);
CREATE INDEX ix_stock_thresholds_1 ON stock_thresholds (location_id);
CREATE INDEX ix_inventory_allocations_1 ON inventory_allocations (lot_id, location_id) WHERE released_at IS NULL AND consumed_at IS NULL;
CREATE INDEX ix_inventory_allocations_2 ON inventory_allocations (order_item_id);
CREATE INDEX ix_inventory_allocations_3 ON inventory_allocations (production_order_id);
CREATE INDEX ix_inventory_allocations_4 ON inventory_allocations (lot_id);
CREATE INDEX ix_inventory_allocations_5 ON inventory_allocations (location_id);
CREATE UNIQUE INDEX ux_supplier_items_1 ON supplier_items (presentation_id) WHERE preferred AND active;
CREATE INDEX ix_supplier_items_2 ON supplier_items (presentation_id);
CREATE INDEX ix_supplier_item_prices_1 ON supplier_item_prices (currency_id);
CREATE INDEX ix_purchase_orders_1 ON purchase_orders (supplier_id);
CREATE INDEX ix_purchase_orders_2 ON purchase_orders (currency_id);
CREATE INDEX ix_purchase_order_items_1 ON purchase_order_items (purchase_order_id);
CREATE INDEX ix_purchase_order_items_2 ON purchase_order_items (item_id);
CREATE INDEX ix_purchase_order_items_3 ON purchase_order_items (presentation_id);
CREATE INDEX ix_purchase_order_status_history_1 ON purchase_order_status_history (purchase_order_id);
CREATE INDEX ix_goods_receipts_1 ON goods_receipts (received_by);
CREATE INDEX ix_goods_receipt_items_1 ON goods_receipt_items (goods_receipt_id);
CREATE INDEX ix_goods_receipt_items_2 ON goods_receipt_items (purchase_order_item_id);
CREATE INDEX ix_goods_receipt_items_3 ON goods_receipt_items (location_id);
CREATE INDEX ix_production_orders_1 ON production_orders (status, planned_start_at, id);
CREATE INDEX ix_production_orders_2 ON production_orders (recipe_version_id);
CREATE INDEX ix_production_orders_3 ON production_orders (currency_id);
CREATE INDEX ix_production_orders_4 ON production_orders (suggested_by_ai_session_id);
CREATE INDEX ix_production_orders_5 ON production_orders (accepted_by);
CREATE INDEX ix_production_orders_6 ON production_orders (modified_by);
CREATE INDEX ix_production_orders_7 ON production_orders (rejected_by);
CREATE INDEX ix_production_batches_1 ON production_batches (production_order_id);
CREATE INDEX ix_production_batches_2 ON production_batches (responsible_user_id);
CREATE INDEX ix_production_consumptions_1 ON production_consumptions (production_batch_id);
CREATE INDEX ix_production_consumptions_2 ON production_consumptions (lot_id);
CREATE INDEX ix_production_consumptions_3 ON production_consumptions (location_id);
CREATE INDEX ix_production_outputs_1 ON production_outputs (production_batch_id);
CREATE INDEX ix_production_outputs_2 ON production_outputs (item_id);
CREATE INDEX ix_production_outputs_3 ON production_outputs (location_id);
CREATE INDEX ix_production_status_history_1 ON production_status_history (production_order_id);
CREATE INDEX ix_menu_item_availability_overrides_1 ON menu_item_availability_overrides (menu_item_id, channel, created_at, id) WHERE revoked_at IS NULL;
CREATE INDEX ix_menu_item_availability_overrides_2 ON menu_item_availability_overrides (menu_item_id);
CREATE INDEX ix_service_capabilities_1 ON service_capabilities (changed_by);
CREATE INDEX ix_service_capability_events_1 ON service_capability_events (capability_id);
CREATE INDEX ix_service_status_history_1 ON service_status_history (service_status_id);
CREATE INDEX ix_orders_1 ON orders (status, ordered_at, id);
CREATE INDEX ix_orders_2 ON orders (customer_id, ordered_at, id);
CREATE INDEX ix_orders_3 ON orders (table_id);
CREATE INDEX ix_orders_4 ON orders (reservation_id);
CREATE INDEX ix_orders_5 ON orders (currency_id);
CREATE INDEX ix_order_items_1 ON order_items (order_id, status);
CREATE INDEX ix_order_items_2 ON order_items (menu_item_id);
CREATE INDEX ix_order_items_3 ON order_items (recipe_version_id);
CREATE INDEX ix_order_items_4 ON order_items (replaces_order_item_id);
CREATE INDEX ix_order_item_modifiers_1 ON order_item_modifiers (order_item_id);
CREATE INDEX ix_order_item_modifiers_2 ON order_item_modifiers (modifier_id);
CREATE INDEX ix_order_modifier_item_impacts_1 ON order_modifier_item_impacts (item_id);
CREATE INDEX ix_order_status_history_1 ON order_status_history (order_id, occurred_at, id);
CREATE INDEX ix_order_item_status_history_1 ON order_item_status_history (order_item_id);
CREATE INDEX ix_special_requests_1 ON special_requests (order_id);
CREATE INDEX ix_special_requests_2 ON special_requests (order_item_id);
CREATE INDEX ix_special_requests_3 ON special_requests (reviewed_by);
CREATE INDEX ix_kitchen_tickets_1 ON kitchen_tickets (preparation_area_id, sent_at, id) WHERE status IN ('QUEUED','IN_PROGRESS');
CREATE INDEX ix_kitchen_tickets_2 ON kitchen_tickets (preparation_area_id);
CREATE INDEX ix_kitchen_ticket_items_1 ON kitchen_ticket_items (order_item_id);
CREATE INDEX ix_delivery_partners_1 ON delivery_partners (employee_id);
CREATE INDEX ix_deliveries_1 ON deliveries (status, created_at, id);
CREATE INDEX ix_deliveries_2 ON deliveries (partner_id);
CREATE INDEX ix_delivery_status_history_1 ON delivery_status_history (deliverie_id);
CREATE INDEX ix_conversations_1 ON conversations (customer_id);
CREATE INDEX ix_messages_1 ON messages (conversation_id, created_at, id);
CREATE INDEX ix_messages_2 ON messages (sender_user_id);
CREATE INDEX ix_messages_3 ON messages (ai_session_id);
CREATE INDEX ix_messages_4 ON messages (reply_to_message_id);
CREATE INDEX ix_external_customer_identities_1 ON external_customer_identities (customer_id);
CREATE INDEX ix_external_customer_identities_2 ON external_customer_identities (linked_by);
CREATE INDEX ix_message_attachments_1 ON message_attachments (message_id);
CREATE UNIQUE INDEX ux_conversation_assignments_1 ON conversation_assignments (conversation_id) WHERE released_at IS NULL;
CREATE INDEX ix_conversation_assignments_2 ON conversation_assignments (conversation_id);
CREATE INDEX ix_conversation_assignments_3 ON conversation_assignments (assigned_to);
CREATE INDEX ix_bills_1 ON bills (customer_id);
CREATE INDEX ix_bills_2 ON bills (currency_id);
CREATE INDEX ix_bill_orders_1 ON bill_orders (order_id);
CREATE INDEX ix_bill_items_1 ON bill_items (bill_id);
CREATE INDEX ix_bill_items_2 ON bill_items (order_item_id);
CREATE INDEX ix_bill_items_3 ON bill_items (voided_by);
CREATE INDEX ix_payments_1 ON payments (bill_id, status);
CREATE INDEX ix_payments_2 ON payments (payment_method_id);
CREATE INDEX ix_payments_3 ON payments (received_by);
CREATE INDEX ix_payment_intents_1 ON payment_intents (bill_id);
CREATE INDEX ix_payment_intents_2 ON payment_intents (currency_id);
CREATE INDEX ix_payment_gateway_events_1 ON payment_gateway_events (payment_intent_id);
CREATE UNIQUE INDEX ux_payment_allocations_1 ON payment_allocations (payment_id) WHERE allocation_type = 'SALE';
CREATE UNIQUE INDEX ux_payment_allocations_2 ON payment_allocations (payment_id, tip_id) WHERE allocation_type = 'TIP';
CREATE INDEX ix_payment_allocations_3 ON payment_allocations (payment_id);
CREATE INDEX ix_payment_allocations_4 ON payment_allocations (tip_id);
CREATE INDEX ix_payment_refunds_1 ON payment_refunds (payment_id);
CREATE INDEX ix_refund_allocations_1 ON refund_allocations (payment_allocation_id);
CREATE INDEX ix_payment_fees_1 ON payment_fees (payment_id);
CREATE INDEX ix_tips_1 ON tips (bill_id);
CREATE INDEX ix_tip_distributions_1 ON tip_distributions (tip_id);
CREATE INDEX ix_tip_distributions_2 ON tip_distributions (employee_id);
CREATE INDEX ix_tip_distributions_3 ON tip_distributions (cash_movement_id);
CREATE INDEX ix_cash_registers_1 ON cash_registers (currency_id);
CREATE UNIQUE INDEX ux_cash_sessions_1 ON cash_sessions (cash_register_id) WHERE status IN ('OPEN','CLOSING');
CREATE INDEX ix_cash_sessions_2 ON cash_sessions (cash_register_id);
CREATE INDEX ix_cash_sessions_3 ON cash_sessions (opened_by);
CREATE INDEX ix_cash_sessions_4 ON cash_sessions (closed_by);
CREATE UNIQUE INDEX ux_cash_movements_1 ON cash_movements (cash_session_id) WHERE movement_type = 'OPENING';
CREATE INDEX ix_cash_movements_2 ON cash_movements (cash_session_id, occurred_at, id);
CREATE INDEX ix_cash_movements_3 ON cash_movements (responsible_user_id);
CREATE UNIQUE INDEX ux_cash_reconciliations_1 ON cash_reconciliations (cash_session_id) WHERE is_final;
CREATE INDEX ix_cash_reconciliations_2 ON cash_reconciliations (cash_session_id);
CREATE INDEX ix_cash_reconciliations_3 ON cash_reconciliations (counted_by);
CREATE INDEX ix_invoices_1 ON invoices (bill_id);
CREATE INDEX ix_invoices_2 ON invoices (customer_id);
CREATE INDEX ix_invoices_3 ON invoices (original_invoice_id);
CREATE INDEX ix_invoices_4 ON invoices (currency_id);
CREATE INDEX ix_fiscal_allocations_1 ON fiscal_allocations (bill_id);
CREATE INDEX ix_fiscal_attempts_1 ON fiscal_attempts (invoice_id);
CREATE INDEX ix_fiscal_artifacts_1 ON fiscal_artifacts (invoice_id);
CREATE INDEX ix_invoice_items_1 ON invoice_items (invoice_id);
CREATE INDEX ix_invoice_items_2 ON invoice_items (bill_item_id);
CREATE INDEX ix_ai_sessions_1 ON ai_sessions (conversation_id);
CREATE INDEX ix_ai_sessions_2 ON ai_sessions (initiated_by);
CREATE INDEX ix_ai_tool_calls_1 ON ai_tool_calls (ai_session_id);
CREATE INDEX ix_ai_tool_calls_2 ON ai_tool_calls (authorized_user_id);
CREATE INDEX ix_ai_handoffs_1 ON ai_handoffs (ai_session_id);
CREATE INDEX ix_ai_handoffs_2 ON ai_handoffs (conversation_id);
CREATE INDEX ix_ai_handoffs_3 ON ai_handoffs (accepted_by);
CREATE INDEX ix_ai_feedback_1 ON ai_feedback (ai_session_id);
CREATE INDEX ix_ai_feedback_2 ON ai_feedback (message_id);
CREATE INDEX ix_ai_feedback_3 ON ai_feedback (reviewed_by);
CREATE INDEX ix_ai_dataset_versions_1 ON ai_dataset_versions (approved_by);
CREATE INDEX ix_voucher_evidence_1 ON voucher_evidence (payment_id);
CREATE INDEX ix_voucher_evidence_2 ON voucher_evidence (order_id);
CREATE INDEX ix_voucher_evidence_3 ON voucher_evidence (reviewed_by);
CREATE INDEX ix_vision_events_1 ON vision_events (camera_source_id, occurred_at, id);
CREATE INDEX ix_vision_event_reviews_1 ON vision_event_reviews (vision_event_id);
CREATE INDEX ix_vision_event_reviews_2 ON vision_event_reviews (reviewer_user_id);
CREATE INDEX ix_audit_logs_1 ON audit_logs (entity_type, entity_id, created_at, id);
CREATE INDEX ix_audit_logs_2 ON audit_logs (request_id);
CREATE UNIQUE INDEX ux_system_settings_1 ON system_settings (key) WHERE retired_at IS NULL;
CREATE INDEX ix_outbox_events_1 ON outbox_events (next_attempt_at, occurred_at, id) WHERE published_at IS NULL;
CREATE INDEX ix_idempotency_keys_1 ON idempotency_keys (expires_at);
CREATE INDEX ix_production_batch_status_history_1 ON production_batch_status_history (production_batch_id);
CREATE INDEX ix_payment_receipts_1 ON payment_receipts (currency_id);
CREATE INDEX ix_payment_receipts_2 ON payment_receipts (issued_by);

-- No se incluyen usuarios PostgreSQL, grants, triggers ni procesos de aplicación.
-- Definir privilegios y guardas de inmutabilidad en futuras migraciones antes de producción.
COMMIT;
