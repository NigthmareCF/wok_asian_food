# Diccionario de datos WOK

Modelo de 128 tablas. PostgreSQL 18. Generado desde `database/design/generate.py`.

Todas las PK son UUID generados. FK con ON DELETE RESTRICT y ON UPDATE RESTRICT: se conservan identidades y documentos históricos. Los IDs polimórficos de auditoría, outbox e idempotencia son referencias lógicas deliberadamente sin FK.

Nulo: Sí permite NULL. — indica ausencia de default/restricción. PK y UNIQUE crean índices con el nombre de su constraint. Los campos created_at son fecha de registro; occurred_at y equivalentes representan el evento. `updated_at`, actores y `row_version` requieren mantenimiento transaccional; no hay triggers en este borrador.

Las reglas entre filas y las excepciones a 3FN se detallan en [decisiones](design-decisions.md).

## users

Identidad de cuenta; nunca contiene contraseñas.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| email | TEXT | No | — | — | — | uq_users_1 |
| phone | TEXT | Sí | — | — | — | — |
| display_name | TEXT | No | — | — | — | — |
| status | TEXT | No | 'PENDING_VERIFICATION' | — | — | — |
| email_verified_at | TIMESTAMPTZ | Sí | — | — | — | — |
| sessions_valid_after | TIMESTAMPTZ | No | now() | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_users_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_users_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_users`: `PRIMARY KEY (id)`.
- `uq_users_1`: `UNIQUE (email)`.
- `ck_users_1`: `CHECK (email = lower(btrim(email)) AND position('@' in email) > 1)`.
- `ck_users_2`: `CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED'))`.
- `ck_users_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `users.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `users.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Registro público: sólo CLIENTE en user_roles, perfil y estado PENDING_VERIFICATION en una transacción. Activación consume challenge. Email normalizado; cambio requiere nueva verificación. UUID nunca sustituye autorización. Usuarios se desactivan o anonimizan, no se borran.

## user_credentials

Credencial local separada de la identidad.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_user_credentials_user_id | uq_user_credentials_1 |
| password_hash | TEXT | No | — | — | — | — |
| password_changed_at | TIMESTAMPTZ | No | now() | — | — | — |
| must_change_password | BOOLEAN | No | false | — | — | — |
| credentials_updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_user_credentials`: `PRIMARY KEY (id)`.
- `uq_user_credentials_1`: `UNIQUE (user_id)`.
- `ck_user_credentials_1`: `CHECK (length(password_hash) >= 40)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `user_credentials.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.

**Notas**

Hash de contraseña auto-descriptivo con algoritmo, parámetros y salt (por ejemplo Argon2id); TEXT evita límites arbitrarios. Nunca PIN, contraseña o refresh token sin protección. No incluir hashes en auditoría.

## auth_identities

Identidad externa vinculada mediante subject estable; el correo no vincula cuentas por sí solo.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_auth_identities_user_id | — |
| provider | TEXT | No | — | — | — | uq_auth_identities_1 |
| provider_subject | TEXT | No | — | — | — | uq_auth_identities_1 |
| email_at_link | TEXT | Sí | — | — | — | — |
| linked_at | TIMESTAMPTZ | No | now() | — | — | — |
| last_login_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_auth_identities`: `PRIMARY KEY (id)`.
- `uq_auth_identities_1`: `UNIQUE (provider, provider_subject)`.
- `ck_auth_identities_1`: `CHECK (provider IN ('GOOGLE', 'APPLE'))`.
- `ck_auth_identities_2`: `CHECK (length(provider_subject) > 0)`.

**Índices adicionales**

- `ix_auth_identities_1`: `(user_id)`.

**Relaciones**

- `auth_identities.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## roles

Roles operativos y de cliente.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_roles_1 |
| name | TEXT | No | — | — | — | — |
| description | TEXT | Sí | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_roles_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_roles_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_roles`: `PRIMARY KEY (id)`.
- `uq_roles_1`: `UNIQUE (code)`.
- `ck_roles_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `roles.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `roles.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## permissions

Permisos atómicos por recurso y acción.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_permissions_1 |
| description | TEXT | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_permissions`: `PRIMARY KEY (id)`.
- `uq_permissions_1`: `UNIQUE (code)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**


**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## user_roles

Asignaciones multirrol con revocación histórica.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_user_roles_user_id | — |
| role_id | UUID | No | — | — | roles.id; fk_user_roles_role_id | — |
| granted_by | UUID | Sí | — | — | users.id; fk_user_roles_granted_by | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_by | UUID | Sí | — | — | users.id; fk_user_roles_revoked_by | — |
| reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_user_roles`: `PRIMARY KEY (id)`.

**Índices adicionales**

- `ux_user_roles_1`: UNIQUE `(user_id, role_id)` WHERE `revoked_at IS NULL`.
- `ix_user_roles_2`: `(user_id)`.
- `ix_user_roles_3`: `(role_id)`.

**Relaciones**

- `user_roles.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `user_roles.role_id` → `roles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `user_roles.granted_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `user_roles.revoked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## role_permissions

Conjunto de permisos vigente por rol.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| role_id | UUID | No | — | — | roles.id; fk_role_permissions_role_id | uq_role_permissions_1 |
| permission_id | UUID | No | — | — | permissions.id; fk_role_permissions_permission_id | uq_role_permissions_1 |
| granted_by | UUID | Sí | — | — | users.id; fk_role_permissions_granted_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_role_permissions`: `PRIMARY KEY (id)`.
- `uq_role_permissions_1`: `UNIQUE (role_id, permission_id)`.

**Índices adicionales**

- `ix_role_permissions_1`: `(permission_id)`.

**Relaciones**

- `role_permissions.role_id` → `roles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `role_permissions.permission_id` → `permissions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `role_permissions.granted_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## auth_sessions

Sesión por dispositivo; admite sesiones simultáneas.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_auth_sessions_user_id | — |
| client_type | TEXT | No | — | — | — | — |
| device_name | TEXT | Sí | — | — | — | — |
| device_identifier | TEXT | Sí | — | — | — | — |
| ip_address | INET | Sí | — | — | — | — |
| user_agent | TEXT | Sí | — | — | — | — |
| last_activity_at | TIMESTAMPTZ | No | now() | — | — | — |
| expires_at | TIMESTAMPTZ | No | — | — | — | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_by | UUID | Sí | — | — | users.id; fk_auth_sessions_revoked_by | — |
| revocation_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_auth_sessions`: `PRIMARY KEY (id)`.
- `ck_auth_sessions_1`: `CHECK (client_type IN ('WEB', 'MOBILE', 'DESKTOP'))`.
- `ck_auth_sessions_2`: `CHECK (expires_at > created_at)`.

**Índices adicionales**

- `ix_auth_sessions_1`: `(user_id, expires_at)` WHERE `revoked_at IS NULL`.
- `ix_auth_sessions_2`: `(user_id)`.

**Relaciones**

- `auth_sessions.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `auth_sessions.revoked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## refresh_tokens

Hash de token rotativo; familia definida por sesión.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| session_id | UUID | No | — | — | auth_sessions.id; fk_refresh_tokens_session_id | — |
| token_hash | TEXT | No | — | — | — | uq_refresh_tokens_1 |
| parent_token_id | UUID | Sí | — | — | refresh_tokens.id; fk_refresh_tokens_parent_token_id | uq_refresh_tokens_2 |
| expires_at | TIMESTAMPTZ | No | — | — | — | — |
| used_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_refresh_tokens`: `PRIMARY KEY (id)`.
- `uq_refresh_tokens_1`: `UNIQUE (token_hash)`.
- `uq_refresh_tokens_2`: `UNIQUE (parent_token_id)`.
- `ck_refresh_tokens_1`: `CHECK (expires_at > created_at)`.
- `ck_refresh_tokens_2`: `CHECK (length(token_hash) >= 40)`.
- `ck_refresh_tokens_3`: `CHECK (parent_token_id IS NULL OR parent_token_id <> id)`.

**Índices adicionales**

- `ix_refresh_tokens_1`: `(session_id)`.

**Relaciones**

- `refresh_tokens.session_id` → `auth_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `refresh_tokens.parent_token_id` → `refresh_tokens.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.

**Notas**

Rotación atómica: bloquear token y sesión, verificar vigencia, marcar used_at y crear sucesor. Reutilización revoca toda la sesión/familia. parent_token_id debe pertenecer a la misma sesión. token_hash usa hash de token aleatorio de alta entropía; la longitud no demuestra seguridad.

## login_attempts

Historial de intentos, incluso identificadores sin cuenta.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | Sí | — | — | users.id; fk_login_attempts_user_id | — |
| identifier_used | TEXT | No | — | — | — | — |
| success | BOOLEAN | No | — | — | — | — |
| failure_reason | TEXT | Sí | — | — | — | — |
| ip_address | INET | Sí | — | — | — | — |
| user_agent | TEXT | Sí | — | — | — | — |
| client_type | TEXT | No | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_login_attempts`: `PRIMARY KEY (id)`.
- `ck_login_attempts_1`: `CHECK (client_type IN ('WEB', 'MOBILE', 'DESKTOP'))`.
- `ck_login_attempts_2`: `CHECK ((success AND failure_reason IS NULL) OR (NOT success AND failure_reason IS NOT NULL))`.

**Índices adicionales**

- `ix_login_attempts_1`: `(identifier_used, created_at, id)`.
- `ix_login_attempts_2`: `(ip_address, created_at)`.
- `ix_login_attempts_3`: `(user_id)`.

**Relaciones**

- `login_attempts.user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## account_lockouts

Episodios de bloqueo temporal y desbloqueo administrativo.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_account_lockouts_user_id | — |
| locked_until | TIMESTAMPTZ | No | — | — | — | — |
| lock_reason | TEXT | No | — | — | — | — |
| unlocked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| unlocked_by | UUID | Sí | — | — | users.id; fk_account_lockouts_unlocked_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_account_lockouts`: `PRIMARY KEY (id)`.
- `ck_account_lockouts_1`: `CHECK (locked_until > created_at)`.

**Índices adicionales**

- `ix_account_lockouts_1`: `(user_id, locked_until)` WHERE `unlocked_at IS NULL`.
- `ix_account_lockouts_2`: `(user_id)`.

**Relaciones**

- `account_lockouts.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `account_lockouts.unlocked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

El historial es autoridad del bloqueo. locked_until vigente y unlocked_at nulo bloquean. Serializar evaluación bajo bloqueo del usuario; no usar índices parciales con now(). IP e identificador se limitan también para cuentas inexistentes.

## verification_challenges

PIN protegido con hash autenticado; expiración y uso único.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_verification_challenges_user_id | — |
| purpose | TEXT | No | — | — | — | — |
| code_hash | TEXT | No | — | — | — | — |
| destination_hash | TEXT | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | No | — | — | — | — |
| attempt_count | INTEGER | No | 0 | — | — | — |
| max_attempts | INTEGER | No | 5 | — | — | — |
| consumed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_verification_challenges`: `PRIMARY KEY (id)`.
- `ck_verification_challenges_1`: `CHECK (purpose IN ('ACCOUNT_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE', 'SENSITIVE_ACTION'))`.
- `ck_verification_challenges_2`: `CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts)`.
- `ck_verification_challenges_3`: `CHECK (expires_at > created_at)`.
- `ck_verification_challenges_4`: `CHECK (length(code_hash) >= 40)`.

**Índices adicionales**

- `ix_verification_challenges_1`: `(user_id, purpose, expires_at)` WHERE `consumed_at IS NULL AND revoked_at IS NULL`.
- `ix_verification_challenges_2`: `(user_id)`.

**Relaciones**

- `verification_challenges.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

PIN de baja entropía: code_hash debe ser HMAC con clave fuera de BD o hash robusto con secreto adicional; hash rápido sin secreto no basta. Bloquear fila para incremento/consumo; revocar challenges anteriores del mismo propósito al emitir reemplazo. destination_hash vincula el destino nuevo sin guardar el PIN.

## guest_access_tokens

Token opaco y acotado a una operación de invitado.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_guest_access_tokens_customer_id | — |
| scope | TEXT | No | — | — | — | — |
| resource_id | UUID | No | — | — | — | — |
| token_hash | TEXT | No | — | — | — | uq_guest_access_tokens_1 |
| expires_at | TIMESTAMPTZ | No | — | — | — | — |
| consumed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_guest_access_tokens`: `PRIMARY KEY (id)`.
- `uq_guest_access_tokens_1`: `UNIQUE (token_hash)`.
- `ck_guest_access_tokens_1`: `CHECK (scope IN ('RESERVATION', 'ORDER', 'TRACKING'))`.
- `ck_guest_access_tokens_2`: `CHECK (length(token_hash) >= 40)`.
- `ck_guest_access_tokens_3`: `CHECK (expires_at > created_at)`.

**Índices adicionales**

- `ix_guest_access_tokens_1`: `(customer_id)`.

**Relaciones**

- `guest_access_tokens.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## security_events

Eventos de seguridad independientes de auditoría funcional.

Dominio: 01 - Auth IAM.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_security_events_actor_user_id | — |
| event_type | TEXT | No | — | — | — | — |
| severity | TEXT | No | — | — | — | — |
| ip_address | INET | Sí | — | — | — | — |
| user_agent | TEXT | Sí | — | — | — | — |
| session_id | UUID | Sí | — | — | auth_sessions.id; fk_security_events_session_id | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| details | JSONB | No | '{}'::jsonb | — | — | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_security_events`: `PRIMARY KEY (id)`.
- `ck_security_events_1`: `CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))`.

**Índices adicionales**

- `ix_security_events_1`: `(occurred_at, id)`.
- `ix_security_events_2`: `(session_id)`.

**Relaciones**

- `security_events.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `security_events.session_id` → `auth_sessions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## customer_profiles

Perfil de cliente con o sin cuenta vinculada.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | Sí | — | — | users.id; fk_customer_profiles_user_id | uq_customer_profiles_1 |
| full_name | TEXT | No | — | — | — | — |
| guest_phone | TEXT | Sí | — | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_customer_profiles_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_customer_profiles_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_customer_profiles`: `PRIMARY KEY (id)`.
- `uq_customer_profiles_1`: `UNIQUE (user_id)`.
- `ck_customer_profiles_1`: `CHECK (row_version > 0)`.
- `ck_customer_profiles_2`: `CHECK (user_id IS NULL OR guest_phone IS NULL)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `customer_profiles.user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `customer_profiles.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_profiles.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

user_id único y opcional permite comensales o contactos externos sin cuenta. guest_phone sólo corresponde a perfiles sin cuenta; para cuentas consultar users.phone. La vinculación/reconciliación de un invitado requiere autorización y auditoría.

## employee_profiles

Perfil laboral; los permisos se resuelven mediante RBAC.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| user_id | UUID | No | — | — | users.id; fk_employee_profiles_user_id | uq_employee_profiles_1 |
| employee_code | TEXT | No | — | — | — | uq_employee_profiles_2 |
| hired_on | DATE | No | — | — | — | — |
| ended_on | DATE | Sí | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_employee_profiles_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_employee_profiles_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_employee_profiles`: `PRIMARY KEY (id)`.
- `uq_employee_profiles_1`: `UNIQUE (user_id)`.
- `uq_employee_profiles_2`: `UNIQUE (employee_code)`.
- `ck_employee_profiles_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `employee_profiles.user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `employee_profiles.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `employee_profiles.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## customer_addresses

Direcciones reutilizables; entregas guardan copia histórica.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | No | — | — | customer_profiles.id; fk_customer_addresses_customer_id | — |
| label | TEXT | No | — | — | — | — |
| address_text | TEXT | No | — | — | — | — |
| recipient_name | TEXT | No | — | — | — | — |
| recipient_phone | TEXT | No | — | — | — | — |
| latitude | NUMERIC(9,6) | Sí | — | — | — | — |
| longitude | NUMERIC(9,6) | Sí | — | — | — | — |
| instructions | TEXT | Sí | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_customer_addresses_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_customer_addresses_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_customer_addresses`: `PRIMARY KEY (id)`.
- `ck_customer_addresses_1`: `CHECK (latitude BETWEEN -90 AND 90)`.
- `ck_customer_addresses_2`: `CHECK (longitude BETWEEN -180 AND 180)`.
- `ck_customer_addresses_3`: `CHECK (row_version > 0)`.
- `ck_customer_addresses_4`: `CHECK (latitude::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_customer_addresses_5`: `CHECK (longitude::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_customer_addresses_1`: `(customer_id)`.

**Relaciones**

- `customer_addresses.customer_id` → `customer_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_addresses.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_addresses.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## customer_incidents

Incidentes documentados sin sustituir restricciones.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | No | — | — | customer_profiles.id; fk_customer_incidents_customer_id | — |
| order_id | UUID | Sí | — | — | orders.id; fk_customer_incidents_order_id | — |
| description | TEXT | No | — | — | — | — |
| occurred_at | TIMESTAMPTZ | No | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_customer_incidents_created_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_customer_incidents`: `PRIMARY KEY (id)`.

**Índices adicionales**

- `ix_customer_incidents_1`: `(customer_id)`.
- `ix_customer_incidents_2`: `(order_id)`.

**Relaciones**

- `customer_incidents.customer_id` → `customer_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_incidents.order_id` → `orders.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_incidents.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## customer_restrictions

Restricciones temporales revocables.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | No | — | — | customer_profiles.id; fk_customer_restrictions_customer_id | — |
| restriction_type | TEXT | No | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_customer_restrictions_created_by | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_by | UUID | Sí | — | — | users.id; fk_customer_restrictions_revoked_by | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_customer_restrictions`: `PRIMARY KEY (id)`.
- `ck_customer_restrictions_1`: `CHECK (restriction_type IN ('NO_DELIVERY', 'PREPAY_ONLY', 'NO_RESERVATIONS', 'NO_MESSAGING', 'FULL_BLOCK', 'REQUIRES_AUTH'))`.
- `ck_customer_restrictions_2`: `CHECK (expires_at IS NULL OR expires_at > created_at)`.

**Índices adicionales**

- `ix_customer_restrictions_1`: `(customer_id)`.

**Relaciones**

- `customer_restrictions.customer_id` → `customer_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_restrictions.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `customer_restrictions.revoked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## staff_schedules

Turnos planificados por intervalo real.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| employee_id | UUID | No | — | — | employee_profiles.id; fk_staff_schedules_employee_id | — |
| starts_at | TIMESTAMPTZ | No | — | — | — | — |
| ends_at | TIMESTAMPTZ | No | — | — | — | — |
| preparation_area_id | UUID | Sí | — | — | preparation_areas.id; fk_staff_schedules_preparation_area_id | — |
| notes | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_staff_schedules_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_staff_schedules_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_staff_schedules`: `PRIMARY KEY (id)`.
- `ck_staff_schedules_1`: `CHECK (ends_at > starts_at)`.
- `ck_staff_schedules_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_staff_schedules_1`: `(employee_id)`.
- `ix_staff_schedules_2`: `(preparation_area_id)`.

**Relaciones**

- `staff_schedules.employee_id` → `employee_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `staff_schedules.preparation_area_id` → `preparation_areas.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `staff_schedules.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `staff_schedules.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## schedule_exceptions

Ausencias y cambios; referencia opcional al turno afectado.

Dominio: 02 - Customers Staff.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| employee_id | UUID | No | — | — | employee_profiles.id; fk_schedule_exceptions_employee_id | — |
| schedule_id | UUID | Sí | — | — | staff_schedules.id; fk_schedule_exceptions_schedule_id | — |
| exception_type | TEXT | No | — | — | — | — |
| starts_at | TIMESTAMPTZ | No | — | — | — | — |
| ends_at | TIMESTAMPTZ | No | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_schedule_exceptions_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_schedule_exceptions_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_schedule_exceptions`: `PRIMARY KEY (id)`.
- `ck_schedule_exceptions_1`: `CHECK (ends_at > starts_at)`.
- `ck_schedule_exceptions_2`: `CHECK (exception_type IN ('ABSENCE', 'LEAVE', 'EXTRA_TIME', 'CHANGE'))`.
- `ck_schedule_exceptions_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_schedule_exceptions_1`: `(employee_id)`.
- `ix_schedule_exceptions_2`: `(schedule_id)`.

**Relaciones**

- `schedule_exceptions.employee_id` → `employee_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `schedule_exceptions.schedule_id` → `staff_schedules.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `schedule_exceptions.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `schedule_exceptions.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## dining_tables

Mesas físicas; estado actual como proyección operativa.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| name | TEXT | No | — | — | — | uq_dining_tables_1 |
| capacity | INTEGER | No | — | — | — | — |
| zone | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| current_status | TEXT | No | 'FREE' | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_dining_tables_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_dining_tables_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_dining_tables`: `PRIMARY KEY (id)`.
- `uq_dining_tables_1`: `UNIQUE (name)`.
- `ck_dining_tables_1`: `CHECK (capacity > 0)`.
- `ck_dining_tables_2`: `CHECK (current_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE'))`.
- `ck_dining_tables_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `dining_tables.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_tables.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## dining_table_status_history

Historial de transiciones con responsable y motivo.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| dining_table_id | UUID | No | — | — | dining_tables.id; fk_dining_table_status_history_dining_table_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_dining_table_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_dining_table_status_history`: `PRIMARY KEY (id)`.
- `ck_dining_table_status_history_1`: `CHECK (to_status IN ('FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'UNAVAILABLE'))`.

**Índices adicionales**

- `ix_dining_table_status_history_1`: `(dining_table_id)`.

**Relaciones**

- `dining_table_status_history.dining_table_id` → `dining_tables.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_table_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## reservations

Reserva sin obligación de elegir mesa física.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | No | — | — | customer_profiles.id; fk_reservations_customer_id | — |
| party_size | INTEGER | No | — | — | — | — |
| reservation_at | TIMESTAMPTZ | No | — | — | — | — |
| ends_at | TIMESTAMPTZ | No | — | — | — | — |
| requested_at | TIMESTAMPTZ | No | now() | — | — | — |
| status | TEXT | No | 'REQUESTED' | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| arrival_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cancelled_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cancellation_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_reservations_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_reservations_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_reservations`: `PRIMARY KEY (id)`.
- `ck_reservations_1`: `CHECK (party_size > 0)`.
- `ck_reservations_2`: `CHECK (ends_at > reservation_at)`.
- `ck_reservations_3`: `CHECK (status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'))`.
- `ck_reservations_4`: `CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL))`.
- `ck_reservations_5`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_reservations_1`: `(status, reservation_at, id)`.
- `ix_reservations_2`: `(customer_id)`.

**Relaciones**

- `reservations.customer_id` → `customer_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `reservations.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `reservations.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## reservation_evaluations

Resultado histórico de capacidad y condiciones evaluadas por backend.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| reservation_id | UUID | Sí | — | — | reservations.id; fk_reservation_evaluations_reservation_id | — |
| request_id | UUID | No | — | — | — | — |
| decision | TEXT | No | — | — | — | — |
| reason_codes | JSONB | No | — | — | — | — |
| alternatives | JSONB | No | '[]'::jsonb | — | — | — |
| conditions | JSONB | No | '[]'::jsonb | — | — | — |
| estimated_occupancy_minutes | INTEGER | No | — | — | — | — |
| estimated_ready_at | TIMESTAMPTZ | Sí | — | — | — | — |
| public_message | TEXT | No | — | — | — | — |
| policy_version | TEXT | No | — | — | — | — |
| evaluated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_reservation_evaluations`: `PRIMARY KEY (id)`.
- `ck_reservation_evaluations_1`: `CHECK (decision IN ('ACCEPT', 'ACCEPT_WITH_CONDITIONS', 'SUGGEST_OTHER_TIME', 'REQUIRES_HUMAN_APPROVAL', 'REJECT'))`.
- `ck_reservation_evaluations_2`: `CHECK (estimated_occupancy_minutes > 0)`.

**Índices adicionales**

- `ix_reservation_evaluations_1`: `(reservation_id)`.

**Relaciones**

- `reservation_evaluations.reservation_id` → `reservations.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## reservation_status_history

Historial de transiciones con responsable y motivo.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| reservation_id | UUID | No | — | — | reservations.id; fk_reservation_status_history_reservation_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_reservation_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_reservation_status_history`: `PRIMARY KEY (id)`.
- `ck_reservation_status_history_1`: `CHECK (to_status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'))`.

**Índices adicionales**

- `ix_reservation_status_history_1`: `(reservation_id)`.

**Relaciones**

- `reservation_status_history.reservation_id` → `reservations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `reservation_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## reservation_table_assignments

Asignación de una o varias mesas; intervalo bloqueado contra solapes.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| reservation_id | UUID | No | — | — | reservations.id; fk_reservation_table_assignments_reservation_id | — |
| table_id | UUID | No | — | — | dining_tables.id; fk_reservation_table_assignments_table_id | — |
| occupied_period | TSTZRANGE | No | — | — | — | — |
| released_at | TIMESTAMPTZ | Sí | — | — | — | — |
| assigned_by | UUID | No | — | — | users.id; fk_reservation_table_assignments_assigned_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_reservation_table_assignments`: `PRIMARY KEY (id)`.
- `ck_reservation_table_assignments_1`: `CHECK (NOT isempty(occupied_period) AND NOT lower_inf(occupied_period) AND NOT upper_inf(occupied_period) AND lower_inc(occupied_period) AND NOT upper_inc(occupied_period))`.
- `ex_reservation_tables_period`: EXCLUDE por mesa e intervalo solapado mientras no se libera.

**Índices adicionales**

- `ix_reservation_table_assignments_1`: `(reservation_id)`.
- `ix_reservation_table_assignments_2`: `(table_id)`.

**Relaciones**

- `reservation_table_assignments.reservation_id` → `reservations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `reservation_table_assignments.table_id` → `dining_tables.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `reservation_table_assignments.assigned_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## dining_sessions

Atención presencial agrupa mesas, pedidos y pool facturable sin perder historia.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| reservation_id | UUID | Sí | — | — | reservations.id; fk_dining_sessions_reservation_id | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_dining_sessions_customer_id | — |
| status | TEXT | No | 'OPEN' | — | — | — |
| party_size | INTEGER | No | — | — | — | — |
| opened_at | TIMESTAMPTZ | No | now() | — | — | — |
| closed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| estimated_end_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_dining_sessions_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_dining_sessions_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_dining_sessions`: `PRIMARY KEY (id)`.
- `ck_dining_sessions_1`: `CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED'))`.
- `ck_dining_sessions_2`: `CHECK (party_size > 0)`.
- `ck_dining_sessions_3`: `CHECK (closed_at IS NULL OR closed_at >= opened_at)`.
- `ck_dining_sessions_4`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_dining_sessions_1`: `(reservation_id)`.
- `ix_dining_sessions_2`: `(customer_id)`.

**Relaciones**

- `dining_sessions.reservation_id` → `reservations.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_sessions.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_sessions.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_sessions.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## dining_session_tables

Historia de mesas asignadas a una sesión de consumo.

Dominio: 03 - Tables Reservations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| dining_session_id | UUID | No | — | — | dining_sessions.id; fk_dining_session_tables_dining_session_id | — |
| table_id | UUID | No | — | — | dining_tables.id; fk_dining_session_tables_table_id | — |
| assigned_at | TIMESTAMPTZ | No | now() | — | — | — |
| released_at | TIMESTAMPTZ | Sí | — | — | — | — |
| assigned_by | UUID | No | — | — | users.id; fk_dining_session_tables_assigned_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_dining_session_tables`: `PRIMARY KEY (id)`.
- `ck_dining_session_tables_1`: `CHECK (released_at IS NULL OR released_at > assigned_at)`.

**Índices adicionales**

- `ix_dining_session_tables_1`: `(dining_session_id)`.
- `ix_dining_session_tables_2`: `(table_id)`.

**Relaciones**

- `dining_session_tables.dining_session_id` → `dining_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_session_tables.table_id` → `dining_tables.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `dining_session_tables.assigned_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## item_types

Clasificación estable del catálogo físico.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_item_types_1 |
| name | TEXT | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_item_types`: `PRIMARY KEY (id)`.
- `uq_item_types_1`: `UNIQUE (code)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**


**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## units

Unidades canónicas y conversión dentro de una dimensión.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_units_1 |
| name | TEXT | No | — | — | — | — |
| dimension | TEXT | No | — | — | — | — |
| factor_to_base | NUMERIC(18,6) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_units`: `PRIMARY KEY (id)`.
- `uq_units_1`: `UNIQUE (code)`.
- `ck_units_1`: `CHECK (factor_to_base > 0)`.
- `ck_units_2`: `CHECK (dimension IN ('MASS', 'VOLUME', 'COUNT'))`.
- `ck_units_3`: `CHECK (factor_to_base::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**


**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## items

Catálogo único de insumos, productos, preparaciones y consumibles.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| sku | TEXT | No | — | — | — | uq_items_1 |
| name | TEXT | No | — | — | — | — |
| description | TEXT | Sí | — | — | — | — |
| item_type_id | UUID | No | — | — | item_types.id; fk_items_item_type_id | — |
| base_unit_id | UUID | No | — | — | units.id; fk_items_base_unit_id | — |
| track_inventory | BOOLEAN | No | true | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_items`: `PRIMARY KEY (id)`.
- `uq_items_1`: `UNIQUE (sku)`.
- `ck_items_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_items_1`: `(item_type_id)`.
- `ix_items_2`: `(base_unit_id)`.

**Relaciones**

- `items.item_type_id` → `item_types.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `items.base_unit_id` → `units.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## presentations

Presentación por item expresada en su unidad base.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| item_id | UUID | No | — | — | items.id; fk_presentations_item_id | uq_presentations_1 |
| name | TEXT | No | — | — | — | uq_presentations_1 |
| base_quantity | NUMERIC(18,6) | No | — | — | — | — |
| barcode | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_presentations_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_presentations_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_presentations`: `PRIMARY KEY (id)`.
- `uq_presentations_1`: `UNIQUE (item_id, name)`.
- `ck_presentations_1`: `CHECK (base_quantity > 0)`.
- `ck_presentations_2`: `CHECK (row_version > 0)`.
- `ck_presentations_3`: `CHECK (base_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `presentations.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `presentations.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `presentations.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## recipes

Identidad de receta que produce un item.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| output_item_id | UUID | No | — | — | items.id; fk_recipes_output_item_id | — |
| name | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_recipes_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_recipes_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_recipes`: `PRIMARY KEY (id)`.
- `ck_recipes_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_recipes_1`: `(output_item_id)`.

**Relaciones**

- `recipes.output_item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `recipes.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `recipes.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Se admiten recetas alternativas del mismo item. La versión elegida se fija en menú, componentes, pedidos y producción; no existe una versión current implícita para reconstruir historia.

## recipe_versions

Versión histórica inmutable después de publicación.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| recipe_id | UUID | No | — | — | recipes.id; fk_recipe_versions_recipe_id | uq_recipe_versions_1 |
| version_number | INTEGER | No | — | — | — | uq_recipe_versions_1 |
| yield_quantity | NUMERIC(18,6) | No | — | — | — | — |
| status | TEXT | No | 'DRAFT' | — | — | — |
| instructions | TEXT | Sí | — | — | — | — |
| published_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_recipe_versions_created_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_recipe_versions`: `PRIMARY KEY (id)`.
- `uq_recipe_versions_1`: `UNIQUE (recipe_id, version_number)`.
- `ck_recipe_versions_1`: `CHECK (version_number > 0)`.
- `ck_recipe_versions_2`: `CHECK (yield_quantity > 0)`.
- `ck_recipe_versions_3`: `CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))`.
- `ck_recipe_versions_4`: `CHECK (yield_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `recipe_versions.recipe_id` → `recipes.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `recipe_versions.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Publicar congela encabezado y componentes. Subrecetas deben producir el item del componente y estar publicadas. Validar DAG transitivo y unidad base antes de publicar; ver contrato R03.

## recipe_components

BOM: componente item; subreceta fijada a versión cuando corresponda.

Dominio: 05 - Recipes Items.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| recipe_version_id | UUID | No | — | — | recipe_versions.id; fk_recipe_components_recipe_version_id | uq_recipe_components_1 |
| component_item_id | UUID | No | — | — | items.id; fk_recipe_components_component_item_id | — |
| component_recipe_version_id | UUID | Sí | — | — | recipe_versions.id; fk_recipe_components_component_recipe_version_id | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| waste_fraction | NUMERIC(7,6) | No | 0 | — | — | — |
| position | INTEGER | No | — | — | — | uq_recipe_components_1 |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_recipe_components`: `PRIMARY KEY (id)`.
- `uq_recipe_components_1`: `UNIQUE (recipe_version_id, position)`.
- `ck_recipe_components_1`: `CHECK (quantity > 0)`.
- `ck_recipe_components_2`: `CHECK (waste_fraction >= 0 AND waste_fraction < 1)`.
- `ck_recipe_components_3`: `CHECK (position > 0)`.
- `ck_recipe_components_4`: `CHECK (component_recipe_version_id IS NULL OR component_recipe_version_id <> recipe_version_id)`.
- `ck_recipe_components_5`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_recipe_components_6`: `CHECK (waste_fraction::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_recipe_components_1`: `(component_item_id)`.
- `ix_recipe_components_2`: `(component_recipe_version_id)`.

**Relaciones**

- `recipe_components.recipe_version_id` → `recipe_versions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `recipe_components.component_item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `recipe_components.component_recipe_version_id` → `recipe_versions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

quantity está expresada en unidad base del component_item_id para el rendimiento yield_quantity de la versión padre. waste_fraction es fracción de merma [0,1). Consumo bruto = quantity / (1 - waste_fraction). Los componentes elaborados pueden consumirse de stock o expandirse a subreceta, nunca ambos para la misma necesidad.

## menu_categories

Agrupación comercial de platillos.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| name | TEXT | No | — | — | — | uq_menu_categories_1 |
| display_order | INTEGER | No | 0 | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_menu_categories_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_menu_categories_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_menu_categories`: `PRIMARY KEY (id)`.
- `uq_menu_categories_1`: `UNIQUE (name)`.
- `ck_menu_categories_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `menu_categories.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_categories.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## preparation_areas

Áreas de preparación y ruteo de comandas.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_preparation_areas_1 |
| name | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_preparation_areas_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_preparation_areas_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_preparation_areas`: `PRIMARY KEY (id)`.
- `uq_preparation_areas_1`: `UNIQUE (code)`.
- `ck_preparation_areas_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `preparation_areas.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `preparation_areas.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## menu_items

Oferta comercial asociada a item físico y receta opcional.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| item_id | UUID | No | — | — | items.id; fk_menu_items_item_id | — |
| recipe_version_id | UUID | Sí | — | — | recipe_versions.id; fk_menu_items_recipe_version_id | — |
| category_id | UUID | No | — | — | menu_categories.id; fk_menu_items_category_id | — |
| preparation_area_id | UUID | No | — | — | preparation_areas.id; fk_menu_items_preparation_area_id | — |
| name | TEXT | No | — | — | — | — |
| description | TEXT | Sí | — | — | — | — |
| price | NUMERIC(14,2) | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_menu_items_currency_id | — |
| image_reference | TEXT | Sí | — | — | — | — |
| visibility | TEXT | No | 'PUBLIC' | — | — | — |
| status | TEXT | No | 'ACTIVE' | — | — | — |
| display_order | INTEGER | No | 0 | — | — | — |
| estimated_preparation_seconds | INTEGER | No | 0 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_menu_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_menu_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_menu_items`: `PRIMARY KEY (id)`.
- `ck_menu_items_1`: `CHECK (price >= 0)`.
- `ck_menu_items_2`: `CHECK (estimated_preparation_seconds >= 0)`.
- `ck_menu_items_3`: `CHECK (visibility IN ('PUBLIC', 'STAFF', 'HIDDEN'))`.
- `ck_menu_items_4`: `CHECK (status IN ('ACTIVE', 'INACTIVE'))`.
- `ck_menu_items_5`: `CHECK (row_version > 0)`.
- `ck_menu_items_6`: `CHECK (price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_menu_items_1`: `(category_id, status, display_order, id)`.
- `ix_menu_items_2`: `(item_id)`.
- `ix_menu_items_3`: `(recipe_version_id)`.
- `ix_menu_items_4`: `(preparation_area_id)`.
- `ix_menu_items_5`: `(currency_id)`.

**Relaciones**

- `menu_items.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.recipe_version_id` → `recipe_versions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.category_id` → `menu_categories.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.preparation_area_id` → `preparation_areas.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## modifier_groups

Reglas de selección independientes del menú.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| name | TEXT | No | — | — | — | — |
| min_selection | INTEGER | No | 0 | — | — | — |
| max_selection | INTEGER | No | — | — | — | — |
| required | BOOLEAN | No | false | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_modifier_groups_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_modifier_groups_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_modifier_groups`: `PRIMARY KEY (id)`.
- `ck_modifier_groups_1`: `CHECK (min_selection >= 0 AND max_selection >= min_selection)`.
- `ck_modifier_groups_2`: `CHECK (required = (min_selection > 0))`.
- `ck_modifier_groups_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `modifier_groups.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `modifier_groups.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## modifiers

Opciones con diferencia de precio; impactos separados.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | uq_modifiers_2 |
| group_id | UUID | No | — | — | modifier_groups.id; fk_modifiers_group_id | uq_modifiers_1, uq_modifiers_2 |
| name | TEXT | No | — | — | — | uq_modifiers_1 |
| price_delta | NUMERIC(14,2) | No | 0 | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_modifiers_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_modifiers_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_modifiers`: `PRIMARY KEY (id)`.
- `uq_modifiers_1`: `UNIQUE (group_id, name)`.
- `uq_modifiers_2`: `UNIQUE (id, group_id)`.
- `ck_modifiers_1`: `CHECK (row_version > 0)`.
- `ck_modifiers_2`: `CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `modifiers.group_id` → `modifier_groups.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `modifiers.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `modifiers.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## menu_item_modifier_groups

Grupos habilitados por platillo.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| menu_item_id | UUID | No | — | — | menu_items.id; fk_menu_item_modifier_groups_menu_item_id | uq_menu_item_modifier_groups_1 |
| group_id | UUID | No | — | — | modifier_groups.id; fk_menu_item_modifier_groups_group_id | uq_menu_item_modifier_groups_1 |
| display_order | INTEGER | No | 0 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_menu_item_modifier_groups`: `PRIMARY KEY (id)`.
- `uq_menu_item_modifier_groups_1`: `UNIQUE (menu_item_id, group_id)`.

**Índices adicionales**

- `ix_menu_item_modifier_groups_1`: `(group_id)`.

**Relaciones**

- `menu_item_modifier_groups.menu_item_id` → `menu_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_item_modifier_groups.group_id` → `modifier_groups.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## modifier_item_impacts

Delta firmado de consumo en unidad base por modificador.

Dominio: 04 - Menu.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| modifier_id | UUID | No | — | — | modifiers.id; fk_modifier_item_impacts_modifier_id | uq_modifier_item_impacts_1 |
| item_id | UUID | No | — | — | items.id; fk_modifier_item_impacts_item_id | uq_modifier_item_impacts_1 |
| quantity_delta | NUMERIC(18,6) | No | — | — | — | — |
| affects_availability | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_modifier_item_impacts`: `PRIMARY KEY (id)`.
- `uq_modifier_item_impacts_1`: `UNIQUE (modifier_id, item_id)`.
- `ck_modifier_item_impacts_1`: `CHECK (quantity_delta <> 0)`.
- `ck_modifier_item_impacts_2`: `CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_modifier_item_impacts_1`: `(item_id)`.

**Relaciones**

- `modifier_item_impacts.modifier_id` → `modifiers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `modifier_item_impacts.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## inventory_locations

Ubicaciones físicas de existencias.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_inventory_locations_1 |
| name | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_inventory_locations_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_inventory_locations_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_inventory_locations`: `PRIMARY KEY (id)`.
- `uq_inventory_locations_1`: `UNIQUE (code)`.
- `ck_inventory_locations_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `inventory_locations.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_locations.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## inventory_lots

Identidad del lote; cantidad y ubicación se consultan en saldos/movimientos.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| item_id | UUID | No | — | — | items.id; fk_inventory_lots_item_id | uq_inventory_lots_1 |
| lot_code | TEXT | No | — | — | — | uq_inventory_lots_1 |
| received_at | TIMESTAMPTZ | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| unit_cost | NUMERIC(18,6) | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_inventory_lots_currency_id | — |
| goods_receipt_item_id | UUID | Sí | — | — | goods_receipt_items.id; fk_inventory_lots_goods_receipt_item_id | — |
| production_output_id | UUID | Sí | — | — | production_outputs.id; fk_inventory_lots_production_output_id | — |
| source_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_inventory_lots`: `PRIMARY KEY (id)`.
- `uq_inventory_lots_1`: `UNIQUE (item_id, lot_code)`.
- `ck_inventory_lots_1`: `CHECK (unit_cost >= 0)`.
- `ck_inventory_lots_2`: `CHECK (expires_at IS NULL OR expires_at > received_at)`.
- `ck_inventory_lots_3`: `CHECK (num_nonnulls(goods_receipt_item_id, production_output_id, source_reason) = 1)`.
- `ck_inventory_lots_4`: `CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_inventory_lots_1`: `(item_id, expires_at, id)`.
- `ix_inventory_lots_2`: `(currency_id)`.
- `ix_inventory_lots_3`: `(goods_receipt_item_id)`.
- `ix_inventory_lots_4`: `(production_output_id)`.

**Relaciones**

- `inventory_lots.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_lots.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_lots.goods_receipt_item_id` → `goods_receipt_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_lots.production_output_id` → `production_outputs.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

El lote no tiene ubicación única: se mueve y divide entre ubicaciones. Cantidad por ubicación está en inventory_balances; entrada original y evolución en inventory_movements. Caducidad para productos sin vencimiento puede ser NULL. Lote producido enlaza production_output_id; saldo inicial usa source_reason.

## inventory_balances

Proyección reconstruible del libro de inventario por lote y ubicación.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| lot_id | UUID | No | — | — | inventory_lots.id; fk_inventory_balances_lot_id | uq_inventory_balances_1 |
| location_id | UUID | No | — | — | inventory_locations.id; fk_inventory_balances_location_id | uq_inventory_balances_1 |
| quantity | NUMERIC(18,6) | No | 0 | — | — | — |
| reserved_quantity | NUMERIC(18,6) | No | 0 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_inventory_balances_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_inventory_balances_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_inventory_balances`: `PRIMARY KEY (id)`.
- `uq_inventory_balances_1`: `UNIQUE (lot_id, location_id)`.
- `ck_inventory_balances_1`: `CHECK (quantity >= 0 AND reserved_quantity >= 0 AND reserved_quantity <= quantity)`.
- `ck_inventory_balances_2`: `CHECK (row_version > 0)`.
- `ck_inventory_balances_3`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_inventory_balances_4`: `CHECK (reserved_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_inventory_balances_1`: `(location_id)`.

**Relaciones**

- `inventory_balances.lot_id` → `inventory_lots.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_balances.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_balances.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_balances.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Caché transaccional reconstruible: quantity = SUM(quantity_delta). reserved_quantity = SUM(asignaciones abiertas vigentes según liberación contabilizada). Expirar una asignación requiere liberar su reserva atómicamente, no sólo esperar expires_at.

## inventory_movements

Libro inmutable con cantidad firmada; corrección mediante contramovimiento.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| lot_id | UUID | No | — | — | inventory_lots.id; fk_inventory_movements_lot_id | — |
| location_id | UUID | No | — | — | inventory_locations.id; fk_inventory_movements_location_id | — |
| movement_type | TEXT | No | — | — | — | — |
| quantity_delta | NUMERIC(18,6) | No | — | — | — | — |
| unit_cost | NUMERIC(18,6) | No | — | — | — | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_inventory_movements_created_by | — |
| goods_receipt_item_id | UUID | Sí | — | — | goods_receipt_items.id; fk_inventory_movements_goods_receipt_item_id | — |
| production_consumption_id | UUID | Sí | — | — | production_consumptions.id; fk_inventory_movements_production_consumption_id | — |
| production_output_id | UUID | Sí | — | — | production_outputs.id; fk_inventory_movements_production_output_id | — |
| order_item_id | UUID | Sí | — | — | order_items.id; fk_inventory_movements_order_item_id | — |
| transfer_id | UUID | Sí | — | — | inventory_transfers.id; fk_inventory_movements_transfer_id | — |
| reversal_of_id | UUID | Sí | — | — | inventory_movements.id; fk_inventory_movements_reversal_of_id | uq_inventory_movements_1 |
| reason | TEXT | No | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_inventory_movements`: `PRIMARY KEY (id)`.
- `uq_inventory_movements_1`: `UNIQUE (reversal_of_id)`.
- `ck_inventory_movements_1`: `CHECK (movement_type IN ('PURCHASE', 'PRODUCTION', 'CONSUMPTION', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN', 'TRANSFER', 'INTERNAL_USE'))`.
- `ck_inventory_movements_2`: `CHECK (quantity_delta <> 0)`.
- `ck_inventory_movements_3`: `CHECK (unit_cost >= 0)`.
- `ck_inventory_movements_4`: `CHECK (movement_type <> 'PURCHASE' OR (goods_receipt_item_id IS NOT NULL AND quantity_delta > 0))`.
- `ck_inventory_movements_5`: `CHECK (movement_type <> 'TRANSFER' OR transfer_id IS NOT NULL)`.
- `ck_inventory_movements_6`: `CHECK (movement_type NOT IN ('CONSUMPTION','SALE','WASTE','INTERNAL_USE') OR quantity_delta < 0)`.
- `ck_inventory_movements_7`: `CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_inventory_movements_8`: `CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_inventory_movements_1`: `(lot_id, location_id, occurred_at, id)`.
- `ix_inventory_movements_2`: `(location_id)`.
- `ix_inventory_movements_3`: `(goods_receipt_item_id)`.
- `ix_inventory_movements_4`: `(production_consumption_id)`.
- `ix_inventory_movements_5`: `(production_output_id)`.
- `ix_inventory_movements_6`: `(order_item_id)`.
- `ix_inventory_movements_7`: `(transfer_id)`.

**Relaciones**

- `inventory_movements.lot_id` → `inventory_lots.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.goods_receipt_item_id` → `goods_receipt_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.production_consumption_id` → `production_consumptions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.production_output_id` → `production_outputs.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.order_item_id` → `order_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.transfer_id` → `inventory_transfers.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_movements.reversal_of_id` → `inventory_movements.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.

**Notas**

Asientos inmutables. FK de origen y signo deben corresponder al tipo; reglas R04–R06. Una reversión compensatoria usa ADJUSTMENT o RETURN y reversal_of_id, con cantidad opuesta y mismo lote/ubicación/costo. No modificar ni borrar asientos.

## inventory_transfers

Cabecera de transferencia; dos asientos balanceados por lote.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| source_location_id | UUID | No | — | — | inventory_locations.id; fk_inventory_transfers_source_location_id | — |
| destination_location_id | UUID | No | — | — | inventory_locations.id; fk_inventory_transfers_destination_location_id | — |
| reason | TEXT | No | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_inventory_transfers_created_by | — |
| posted_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_inventory_transfers`: `PRIMARY KEY (id)`.
- `ck_inventory_transfers_1`: `CHECK (source_location_id <> destination_location_id)`.

**Índices adicionales**

- `ix_inventory_transfers_1`: `(source_location_id)`.
- `ix_inventory_transfers_2`: `(destination_location_id)`.

**Relaciones**

- `inventory_transfers.source_location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_transfers.destination_location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_transfers.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## stock_thresholds

Umbrales por item y ubicación.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| item_id | UUID | No | — | — | items.id; fk_stock_thresholds_item_id | uq_stock_thresholds_1 |
| location_id | UUID | No | — | — | inventory_locations.id; fk_stock_thresholds_location_id | uq_stock_thresholds_1 |
| minimum_quantity | NUMERIC(18,6) | No | — | — | — | — |
| target_quantity | NUMERIC(18,6) | No | — | — | — | — |
| maximum_quantity | NUMERIC(18,6) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_stock_thresholds_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_stock_thresholds_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_stock_thresholds`: `PRIMARY KEY (id)`.
- `uq_stock_thresholds_1`: `UNIQUE (item_id, location_id)`.
- `ck_stock_thresholds_1`: `CHECK (minimum_quantity >= 0 AND target_quantity >= minimum_quantity AND maximum_quantity >= target_quantity)`.
- `ck_stock_thresholds_2`: `CHECK (row_version > 0)`.
- `ck_stock_thresholds_3`: `CHECK (minimum_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_stock_thresholds_4`: `CHECK (target_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_stock_thresholds_5`: `CHECK (maximum_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_stock_thresholds_1`: `(location_id)`.

**Relaciones**

- `stock_thresholds.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `stock_thresholds.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `stock_thresholds.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `stock_thresholds.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## inventory_allocations

Reserva de existencias para evitar sobreventa antes de consumir.

Dominio: 06 - Inventory.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_item_id | UUID | Sí | — | — | order_items.id; fk_inventory_allocations_order_item_id | — |
| production_order_id | UUID | Sí | — | — | production_orders.id; fk_inventory_allocations_production_order_id | — |
| lot_id | UUID | No | — | — | inventory_lots.id; fk_inventory_allocations_lot_id | — |
| location_id | UUID | No | — | — | inventory_locations.id; fk_inventory_allocations_location_id | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| released_at | TIMESTAMPTZ | Sí | — | — | — | — |
| consumed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_inventory_allocations`: `PRIMARY KEY (id)`.
- `ck_inventory_allocations_1`: `CHECK (num_nonnulls(order_item_id, production_order_id) = 1)`.
- `ck_inventory_allocations_2`: `CHECK (quantity > 0)`.
- `ck_inventory_allocations_3`: `CHECK (NOT (released_at IS NOT NULL AND consumed_at IS NOT NULL))`.
- `ck_inventory_allocations_4`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_inventory_allocations_1`: `(lot_id, location_id)` WHERE `released_at IS NULL AND consumed_at IS NULL`.
- `ix_inventory_allocations_2`: `(order_item_id)`.
- `ix_inventory_allocations_3`: `(production_order_id)`.
- `ix_inventory_allocations_4`: `(lot_id)`.
- `ix_inventory_allocations_5`: `(location_id)`.

**Relaciones**

- `inventory_allocations.order_item_id` → `order_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_allocations.production_order_id` → `production_orders.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_allocations.lot_id` → `inventory_lots.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `inventory_allocations.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Bloquear saldos en orden estable. Una asignación consumida enlaza movimientos mediante su pedido/producción; liberación y consumo son mutuamente excluyentes. La disponibilidad comercial no permite ignorar cantidad física negativa.

## suppliers

Proveedor y contacto operativo.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| name | TEXT | No | — | — | — | — |
| contact_name | TEXT | Sí | — | — | — | — |
| email | TEXT | Sí | — | — | — | — |
| phone | TEXT | Sí | — | — | — | — |
| address_text | TEXT | Sí | — | — | — | — |
| tax_identifier | TEXT | Sí | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_suppliers_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_suppliers_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_suppliers`: `PRIMARY KEY (id)`.
- `ck_suppliers_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `suppliers.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `suppliers.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## supplier_items

Oferta de proveedor por presentación; historial de precios separado.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| supplier_id | UUID | No | — | — | suppliers.id; fk_supplier_items_supplier_id | uq_supplier_items_1 |
| presentation_id | UUID | No | — | — | presentations.id; fk_supplier_items_presentation_id | uq_supplier_items_1 |
| supplier_sku | TEXT | Sí | — | — | — | — |
| preferred | BOOLEAN | No | false | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_supplier_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_supplier_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_supplier_items`: `PRIMARY KEY (id)`.
- `uq_supplier_items_1`: `UNIQUE (supplier_id, presentation_id)`.
- `ck_supplier_items_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ux_supplier_items_1`: UNIQUE `(presentation_id)` WHERE `preferred AND active`.
- `ix_supplier_items_2`: `(presentation_id)`.

**Relaciones**

- `supplier_items.supplier_id` → `suppliers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `supplier_items.presentation_id` → `presentations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `supplier_items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `supplier_items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## supplier_item_prices

Precio histórico con intervalo de vigencia.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| supplier_item_id | UUID | No | — | — | supplier_items.id; fk_supplier_item_prices_supplier_item_id | uq_supplier_item_prices_1 |
| price | NUMERIC(14,2) | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_supplier_item_prices_currency_id | — |
| valid_from | TIMESTAMPTZ | No | — | — | — | uq_supplier_item_prices_1 |
| valid_until | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_supplier_item_prices`: `PRIMARY KEY (id)`.
- `uq_supplier_item_prices_1`: `UNIQUE (supplier_item_id, valid_from)`.
- `ck_supplier_item_prices_1`: `CHECK (price >= 0)`.
- `ck_supplier_item_prices_2`: `CHECK (valid_until IS NULL OR valid_until > valid_from)`.
- `ck_supplier_item_prices_3`: `CHECK (price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_supplier_item_prices_1`: `(currency_id)`.

**Relaciones**

- `supplier_item_prices.supplier_item_id` → `supplier_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `supplier_item_prices.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## purchase_orders

Solicitud y compromiso de compra; no genera existencias.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| supplier_id | UUID | No | — | — | suppliers.id; fk_purchase_orders_supplier_id | — |
| status | TEXT | No | 'REQUESTED' | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_purchase_orders_currency_id | — |
| requested_at | TIMESTAMPTZ | No | now() | — | — | — |
| ordered_at | TIMESTAMPTZ | Sí | — | — | — | — |
| expected_at | TIMESTAMPTZ | Sí | — | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_purchase_orders_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_purchase_orders_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_purchase_orders`: `PRIMARY KEY (id)`.
- `ck_purchase_orders_1`: `CHECK (status IN ('REQUESTED', 'PARTIALLY_PURCHASED', 'PURCHASED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))`.
- `ck_purchase_orders_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_purchase_orders_1`: `(supplier_id)`.
- `ix_purchase_orders_2`: `(currency_id)`.

**Relaciones**

- `purchase_orders.supplier_id` → `suppliers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_orders.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_orders.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_orders.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Estado resume líneas: purchased_quantity expresa compromiso, no recepción. Prioridad de CANCELLED y estados parciales definida en R05; no hay entrada de inventario al marcar PURCHASED.

## purchase_order_items

Cantidades solicitadas y comprometidas en unidad base con precio pactado.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| purchase_order_id | UUID | No | — | — | purchase_orders.id; fk_purchase_order_items_purchase_order_id | — |
| item_id | UUID | No | — | — | items.id; fk_purchase_order_items_item_id | — |
| presentation_id | UUID | Sí | — | — | presentations.id; fk_purchase_order_items_presentation_id | — |
| requested_quantity | NUMERIC(18,6) | No | — | — | — | — |
| purchased_quantity | NUMERIC(18,6) | No | 0 | — | — | — |
| unit_price | NUMERIC(18,6) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_purchase_order_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_purchase_order_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_purchase_order_items`: `PRIMARY KEY (id)`.
- `ck_purchase_order_items_1`: `CHECK (requested_quantity > 0 AND purchased_quantity >= 0 AND purchased_quantity <= requested_quantity)`.
- `ck_purchase_order_items_2`: `CHECK (unit_price >= 0)`.
- `ck_purchase_order_items_3`: `CHECK (row_version > 0)`.
- `ck_purchase_order_items_4`: `CHECK (requested_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_purchase_order_items_5`: `CHECK (purchased_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_purchase_order_items_6`: `CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_purchase_order_items_1`: `(purchase_order_id)`.
- `ix_purchase_order_items_2`: `(item_id)`.
- `ix_purchase_order_items_3`: `(presentation_id)`.

**Relaciones**

- `purchase_order_items.purchase_order_id` → `purchase_orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_order_items.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_order_items.presentation_id` → `presentations.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_order_items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_order_items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## purchase_order_status_history

Historial de transiciones con responsable y motivo.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| purchase_order_id | UUID | No | — | — | purchase_orders.id; fk_purchase_order_status_history_purchase_order_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_purchase_order_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_purchase_order_status_history`: `PRIMARY KEY (id)`.
- `ck_purchase_order_status_history_1`: `CHECK (to_status IN ('REQUESTED', 'PARTIALLY_PURCHASED', 'PURCHASED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_purchase_order_status_history_1`: `(purchase_order_id)`.

**Relaciones**

- `purchase_order_status_history.purchase_order_id` → `purchase_orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `purchase_order_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## goods_receipts

Recepción física; contabilización única genera lotes y movimientos.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| purchase_order_id | UUID | No | — | — | purchase_orders.id; fk_goods_receipts_purchase_order_id | uq_goods_receipts_1 |
| receipt_reference | TEXT | No | — | — | — | uq_goods_receipts_1 |
| received_at | TIMESTAMPTZ | No | — | — | — | — |
| received_by | UUID | No | — | — | users.id; fk_goods_receipts_received_by | — |
| status | TEXT | No | 'DRAFT' | — | — | — |
| posted_at | TIMESTAMPTZ | Sí | — | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_goods_receipts_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_goods_receipts_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_goods_receipts`: `PRIMARY KEY (id)`.
- `uq_goods_receipts_1`: `UNIQUE (purchase_order_id, receipt_reference)`.
- `ck_goods_receipts_1`: `CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED'))`.
- `ck_goods_receipts_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_goods_receipts_1`: `(received_by)`.

**Relaciones**

- `goods_receipts.purchase_order_id` → `purchase_orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `goods_receipts.received_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `goods_receipts.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `goods_receipts.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## goods_receipt_items

Recepción parcial y rechazos por línea comprada.

Dominio: 07 - Suppliers Purchases.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| goods_receipt_id | UUID | No | — | — | goods_receipts.id; fk_goods_receipt_items_goods_receipt_id | — |
| purchase_order_item_id | UUID | No | — | — | purchase_order_items.id; fk_goods_receipt_items_purchase_order_item_id | — |
| accepted_quantity | NUMERIC(18,6) | No | — | — | — | — |
| rejected_quantity | NUMERIC(18,6) | No | 0 | — | — | — |
| unit_cost | NUMERIC(18,6) | No | — | — | — | — |
| location_id | UUID | No | — | — | inventory_locations.id; fk_goods_receipt_items_location_id | — |
| rejection_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_goods_receipt_items`: `PRIMARY KEY (id)`.
- `ck_goods_receipt_items_1`: `CHECK (accepted_quantity >= 0 AND rejected_quantity >= 0 AND accepted_quantity + rejected_quantity > 0)`.
- `ck_goods_receipt_items_2`: `CHECK (unit_cost >= 0)`.
- `ck_goods_receipt_items_3`: `CHECK (rejected_quantity = 0 OR rejection_reason IS NOT NULL)`.
- `ck_goods_receipt_items_4`: `CHECK (accepted_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_goods_receipt_items_5`: `CHECK (rejected_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_goods_receipt_items_6`: `CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_goods_receipt_items_1`: `(goods_receipt_id)`.
- `ix_goods_receipt_items_2`: `(purchase_order_item_id)`.
- `ix_goods_receipt_items_3`: `(location_id)`.

**Relaciones**

- `goods_receipt_items.goods_receipt_id` → `goods_receipts.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `goods_receipt_items.purchase_order_item_id` → `purchase_order_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `goods_receipt_items.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Verificar que la línea pertenece a la orden de la cabecera; varias filas/recepciones y lotes pueden cubrir una línea. Suma aceptada contabilizada no supera comprado salvo ajuste explícito de compromiso antes de recibir.

## production_orders

Sugerencia o solicitud de producir una versión exacta.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| recipe_version_id | UUID | No | — | — | recipe_versions.id; fk_production_orders_recipe_version_id | — |
| currency_id | UUID | No | — | — | currencies.id; fk_production_orders_currency_id | — |
| planned_quantity | NUMERIC(18,6) | No | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| suggested_by_ai_session_id | UUID | Sí | — | — | ai_sessions.id; fk_production_orders_suggested_by_ai_session_id | — |
| accepted_by | UUID | Sí | — | — | users.id; fk_production_orders_accepted_by | — |
| accepted_at | TIMESTAMPTZ | Sí | — | — | — | — |
| modified_by | UUID | Sí | — | — | users.id; fk_production_orders_modified_by | — |
| rejected_by | UUID | Sí | — | — | users.id; fk_production_orders_rejected_by | — |
| rejected_at | TIMESTAMPTZ | Sí | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| planned_start_at | TIMESTAMPTZ | Sí | — | — | — | — |
| planned_end_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_production_orders_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_production_orders_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_production_orders`: `PRIMARY KEY (id)`.
- `ck_production_orders_1`: `CHECK (planned_quantity > 0)`.
- `ck_production_orders_2`: `CHECK (status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))`.
- `ck_production_orders_3`: `CHECK (row_version > 0)`.
- `ck_production_orders_4`: `CHECK (planned_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_production_orders_1`: `(status, planned_start_at, id)`.
- `ix_production_orders_2`: `(recipe_version_id)`.
- `ix_production_orders_3`: `(currency_id)`.
- `ix_production_orders_4`: `(suggested_by_ai_session_id)`.
- `ix_production_orders_5`: `(accepted_by)`.
- `ix_production_orders_6`: `(modified_by)`.
- `ix_production_orders_7`: `(rejected_by)`.

**Relaciones**

- `production_orders.recipe_version_id` → `recipe_versions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.suggested_by_ai_session_id` → `ai_sessions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.accepted_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.modified_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.rejected_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_orders.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Cantidad planificada en unidad base del item resultante. Moneda para costos de ejecución; aceptar/modificar/rechazar sugerencias requiere usuario y motivo. IA no contabiliza producción sin decisión autorizada.

## production_batches

Ejecución física de una orden; conserva costo real.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| production_order_id | UUID | No | — | — | production_orders.id; fk_production_batches_production_order_id | — |
| batch_code | TEXT | No | — | — | — | uq_production_batches_1 |
| started_at | TIMESTAMPTZ | Sí | — | — | — | — |
| completed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| responsible_user_id | UUID | No | — | — | users.id; fk_production_batches_responsible_user_id | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_production_batches_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_production_batches_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_production_batches`: `PRIMARY KEY (id)`.
- `uq_production_batches_1`: `UNIQUE (batch_code)`.
- `ck_production_batches_1`: `CHECK (status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))`.
- `ck_production_batches_2`: `CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))`.
- `ck_production_batches_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_production_batches_1`: `(production_order_id)`.
- `ix_production_batches_2`: `(responsible_user_id)`.

**Relaciones**

- `production_batches.production_order_id` → `production_orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_batches.responsible_user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_batches.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_batches.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## production_consumptions

Consumo real por lote; conserva costo unitario.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| production_batch_id | UUID | No | — | — | production_batches.id; fk_production_consumptions_production_batch_id | — |
| lot_id | UUID | No | — | — | inventory_lots.id; fk_production_consumptions_lot_id | — |
| location_id | UUID | No | — | — | inventory_locations.id; fk_production_consumptions_location_id | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| unit_cost | NUMERIC(18,6) | No | — | — | — | — |
| consumed_at | TIMESTAMPTZ | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_production_consumptions`: `PRIMARY KEY (id)`.
- `ck_production_consumptions_1`: `CHECK (quantity > 0)`.
- `ck_production_consumptions_2`: `CHECK (unit_cost >= 0)`.
- `ck_production_consumptions_3`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_production_consumptions_4`: `CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_production_consumptions_1`: `(production_batch_id)`.
- `ix_production_consumptions_2`: `(lot_id)`.
- `ix_production_consumptions_3`: `(location_id)`.

**Relaciones**

- `production_consumptions.production_batch_id` → `production_batches.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_consumptions.lot_id` → `inventory_lots.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_consumptions.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## production_outputs

Salida real, incluida merma, vinculada a lote producido.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| production_batch_id | UUID | No | — | — | production_batches.id; fk_production_outputs_production_batch_id | — |
| item_id | UUID | No | — | — | items.id; fk_production_outputs_item_id | — |
| location_id | UUID | No | — | — | inventory_locations.id; fk_production_outputs_location_id | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| unit_cost | NUMERIC(18,6) | No | — | — | — | — |
| output_type | TEXT | No | — | — | — | — |
| produced_at | TIMESTAMPTZ | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_production_outputs`: `PRIMARY KEY (id)`.
- `ck_production_outputs_1`: `CHECK (quantity > 0)`.
- `ck_production_outputs_2`: `CHECK (unit_cost >= 0)`.
- `ck_production_outputs_3`: `CHECK (output_type IN ('USABLE', 'WASTE'))`.
- `ck_production_outputs_4`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_production_outputs_5`: `CHECK (unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_production_outputs_1`: `(production_batch_id)`.
- `ix_production_outputs_2`: `(item_id)`.
- `ix_production_outputs_3`: `(location_id)`.

**Relaciones**

- `production_outputs.production_batch_id` → `production_batches.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_outputs.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_outputs.location_id` → `inventory_locations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

USABLE genera lote y movimiento positivo; WASTE documenta rendimiento perdido y no genera stock utilizable. Costeo real conserva consumo, merma y costo distribuido por salidas. Debe coincidir con el item producido por la receta.

## production_status_history

Historial de transiciones con responsable y motivo.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| production_order_id | UUID | No | — | — | production_orders.id; fk_production_status_history_production_order_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_production_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_production_status_history`: `PRIMARY KEY (id)`.
- `ck_production_status_history_1`: `CHECK (to_status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_production_status_history_1`: `(production_order_id)`.

**Relaciones**

- `production_status_history.production_order_id` → `production_orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## menu_item_availability_overrides

Decisión manual prioritaria sobre disponibilidad calculada.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| menu_item_id | UUID | No | — | — | menu_items.id; fk_menu_item_availability_overrides_menu_item_id | — |
| channel | TEXT | No | — | — | — | — |
| is_available | BOOLEAN | No | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_menu_item_availability_overrides_created_by | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| revoked_by | UUID | Sí | — | — | users.id; fk_menu_item_availability_overrides_revoked_by | — |
| revoked_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_menu_item_availability_overrides`: `PRIMARY KEY (id)`.
- `ck_menu_item_availability_overrides_1`: `CHECK (channel IN ('ALL', 'DINE_IN', 'PICKUP', 'DELIVERY'))`.
- `ck_menu_item_availability_overrides_2`: `CHECK (expires_at IS NULL OR expires_at > created_at)`.

**Índices adicionales**

- `ix_menu_item_availability_overrides_1`: `(menu_item_id, channel, created_at, id)` WHERE `revoked_at IS NULL`.
- `ix_menu_item_availability_overrides_2`: `(menu_item_id)`.

**Relaciones**

- `menu_item_availability_overrides.menu_item_id` → `menu_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_item_availability_overrides.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `menu_item_availability_overrides.revoked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Resolver primero override de canal vigente más reciente, después ALL más reciente, después cálculo. Vigente: no revocado y no expirado. AVAILABLE no salta cierres operativos ni integridad de stock. El cálculo nunca modifica overrides.

## service_status

Estado actual único del restaurante; dimensiones independientes.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| singleton_key | INTEGER | No | 1 | — | — | uq_service_status_1 |
| restaurant_open | BOOLEAN | No | false | — | — | — |
| dine_in_enabled | BOOLEAN | No | false | — | — | — |
| pickup_enabled | BOOLEAN | No | false | — | — | — |
| delivery_enabled | BOOLEAN | No | false | — | — | — |
| online_orders_enabled | BOOLEAN | No | false | — | — | — |
| high_demand | BOOLEAN | No | false | — | — | — |
| production_in_progress | BOOLEAN | No | false | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_service_status_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_service_status_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_service_status`: `PRIMARY KEY (id)`.
- `uq_service_status_1`: `UNIQUE (singleton_key)`.
- `ck_service_status_1`: `CHECK (singleton_key = 1)`.
- `ck_service_status_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `service_status.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `service_status.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Excepción intencional al plural solicitada: singleton operativo. Flags son configuraciones independientes; apertura efectiva exige restaurant_open y permiso del canal. production_in_progress es proyección derivada de lotes, no interruptor humano.

## service_capabilities

Estado independiente por capacidad con override auditable.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_service_capabilities_1 |
| status | TEXT | No | 'DISABLED' | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| effective_from | TIMESTAMPTZ | No | now() | — | — | — |
| effective_until | TIMESTAMPTZ | Sí | — | — | — | — |
| changed_by | UUID | Sí | — | — | users.id; fk_service_capabilities_changed_by | — |
| policy_version | INTEGER | No | 1 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_service_capabilities_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_service_capabilities_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_service_capabilities`: `PRIMARY KEY (id)`.
- `uq_service_capabilities_1`: `UNIQUE (code)`.
- `ck_service_capabilities_1`: `CHECK (code IN ('LOCAL', 'RESERVATIONS', 'DINE_IN_ONLINE', 'PICKUP', 'DELIVERY', 'ONLINE_ORDERS', 'MESSAGING', 'ONLINE_PAYMENTS', 'PRODUCTION'))`.
- `ck_service_capabilities_2`: `CHECK (status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED'))`.
- `ck_service_capabilities_3`: `CHECK (effective_until IS NULL OR effective_until > effective_from)`.
- `ck_service_capabilities_4`: `CHECK (policy_version > 0)`.
- `ck_service_capabilities_5`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_service_capabilities_1`: `(changed_by)`.

**Relaciones**

- `service_capabilities.changed_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `service_capabilities.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `service_capabilities.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## service_capability_events

Historial inmutable de cambios por capacidad.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| capability_id | UUID | No | — | — | service_capabilities.id; fk_service_capability_events_capability_id | — |
| previous_status | TEXT | No | — | — | — | — |
| new_status | TEXT | No | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| actor_user_id | UUID | No | — | — | users.id; fk_service_capability_events_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_service_capability_events`: `PRIMARY KEY (id)`.
- `ck_service_capability_events_1`: `CHECK (previous_status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED'))`.
- `ck_service_capability_events_2`: `CHECK (new_status IN ('ENABLED', 'MANUAL_APPROVAL', 'PAUSED', 'DISABLED'))`.

**Índices adicionales**

- `ix_service_capability_events_1`: `(capability_id)`.

**Relaciones**

- `service_capability_events.capability_id` → `service_capabilities.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `service_capability_events.actor_user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## service_status_history

Cambio operativo con estado anterior y posterior.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| service_status_id | UUID | No | — | — | service_status.id; fk_service_status_history_service_status_id | — |
| actor_user_id | UUID | No | — | — | users.id; fk_service_status_history_actor_user_id | — |
| reason | TEXT | No | — | — | — | — |
| before_data | JSONB | No | — | — | — | — |
| after_data | JSONB | No | — | — | — | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_service_status_history`: `PRIMARY KEY (id)`.

**Índices adicionales**

- `ix_service_status_history_1`: `(service_status_id)`.

**Relaciones**

- `service_status_history.service_status_id` → `service_status.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `service_status_history.actor_user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## preparation_capacity_slots

Capacidad por área e intervalo para estimación de carga.

Dominio: 09 - Availability Operations.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| preparation_area_id | UUID | No | — | — | preparation_areas.id; fk_preparation_capacity_slots_preparation_area_id | uq_preparation_capacity_slots_1 |
| starts_at | TIMESTAMPTZ | No | — | — | — | uq_preparation_capacity_slots_1 |
| ends_at | TIMESTAMPTZ | No | — | — | — | — |
| capacity_units | NUMERIC(18,6) | No | — | — | — | — |
| reserved_units | NUMERIC(18,6) | No | 0 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_preparation_capacity_slots_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_preparation_capacity_slots_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_preparation_capacity_slots`: `PRIMARY KEY (id)`.
- `uq_preparation_capacity_slots_1`: `UNIQUE (preparation_area_id, starts_at)`.
- `ck_preparation_capacity_slots_1`: `CHECK (ends_at > starts_at)`.
- `ck_preparation_capacity_slots_2`: `CHECK (capacity_units >= 0 AND reserved_units >= 0 AND reserved_units <= capacity_units)`.
- `ck_preparation_capacity_slots_3`: `CHECK (row_version > 0)`.
- `ck_preparation_capacity_slots_4`: `CHECK (capacity_units::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_preparation_capacity_slots_5`: `CHECK (reserved_units::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `preparation_capacity_slots.preparation_area_id` → `preparation_areas.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `preparation_capacity_slots.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `preparation_capacity_slots.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## orders

Pedido comercial multicanal; preventa vinculable a reserva.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_orders_customer_id | — |
| table_id | UUID | Sí | — | — | dining_tables.id; fk_orders_table_id | — |
| reservation_id | UUID | Sí | — | — | reservations.id; fk_orders_reservation_id | — |
| channel | TEXT | No | — | — | — | — |
| order_type | TEXT | No | — | — | — | — |
| status | TEXT | No | 'DRAFT' | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_orders_currency_id | — |
| comments | TEXT | Sí | — | — | — | — |
| ordered_at | TIMESTAMPTZ | No | now() | — | — | — |
| accepted_at | TIMESTAMPTZ | Sí | — | — | — | — |
| estimated_ready_at | TIMESTAMPTZ | Sí | — | — | — | — |
| completed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cancelled_at | TIMESTAMPTZ | Sí | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| client_action_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_orders_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_orders_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_orders`: `PRIMARY KEY (id)`.
- `ck_orders_1`: `CHECK (channel IN ('WEB', 'MOBILE', 'DESKTOP', 'STAFF', 'WHATSAPP', 'INSTAGRAM', 'OTHER'))`.
- `ck_orders_2`: `CHECK (order_type IN ('DINE_IN', 'PICKUP', 'DELIVERY'))`.
- `ck_orders_3`: `CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED'))`.
- `ck_orders_4`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_orders_1`: `(status, ordered_at, id)`.
- `ix_orders_2`: `(customer_id, ordered_at, id)`.
- `ix_orders_3`: `(table_id)`.
- `ix_orders_4`: `(reservation_id)`.
- `ix_orders_5`: `(currency_id)`.

**Relaciones**

- `orders.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `orders.table_id` → `dining_tables.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `orders.reservation_id` → `reservations.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `orders.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `orders.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `orders.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

reservation_id permite preventa/preorder. bill_orders permite varias cuentas por pedido. El contexto mesa no determina propiedad de una cuenta. Precio/receta y notas aceptadas quedan congelados al enviar; reemplazos/anulaciones se auditan.

## order_items

Línea histórica con precio y receta congelados al enviar.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | uq_order_items_1 |
| order_id | UUID | No | — | — | orders.id; fk_order_items_order_id | uq_order_items_1 |
| menu_item_id | UUID | No | — | — | menu_items.id; fk_order_items_menu_item_id | — |
| recipe_version_id | UUID | Sí | — | — | recipe_versions.id; fk_order_items_recipe_version_id | — |
| item_name_snapshot | TEXT | No | — | — | — | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| unit_price | NUMERIC(14,2) | No | — | — | — | — |
| status | TEXT | No | 'DRAFT' | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| sent_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cancelled_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cancellation_reason | TEXT | Sí | — | — | — | — |
| replaces_order_item_id | UUID | Sí | — | — | order_items.id; fk_order_items_replaces_order_item_id | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_order_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_order_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_order_items`: `PRIMARY KEY (id)`.
- `uq_order_items_1`: `UNIQUE (id, order_id)`.
- `ck_order_items_1`: `CHECK (quantity > 0)`.
- `ck_order_items_2`: `CHECK (unit_price >= 0)`.
- `ck_order_items_3`: `CHECK (status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED'))`.
- `ck_order_items_4`: `CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL))`.
- `ck_order_items_5`: `CHECK (row_version > 0)`.
- `ck_order_items_6`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_order_items_7`: `CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_order_items_1`: `(order_id, status)`.
- `ix_order_items_2`: `(menu_item_id)`.
- `ix_order_items_3`: `(recipe_version_id)`.
- `ix_order_items_4`: `(replaces_order_item_id)`.

**Relaciones**

- `order_items.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_items.menu_item_id` → `menu_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_items.recipe_version_id` → `recipe_versions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_items.replaces_order_item_id` → `order_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

El precio unitario base excluye deltas de modificadores; al facturar se congela precio efectivo incluyendo deltas. Cantidad fraccionaria permite división de cuenta. No editar retrospectivamente una línea SENT; crear reemplazo y cancelación con motivo.

## order_item_modifiers

Selección histórica; delta de precio congelado.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_item_id | UUID | No | — | — | order_items.id; fk_order_item_modifiers_order_item_id | — |
| modifier_id | UUID | No | — | — | modifiers.id; fk_order_item_modifiers_modifier_id | — |
| name_snapshot | TEXT | No | — | — | — | — |
| quantity | INTEGER | No | 1 | — | — | — |
| price_delta | NUMERIC(14,2) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_order_item_modifiers`: `PRIMARY KEY (id)`.
- `ck_order_item_modifiers_1`: `CHECK (quantity > 0)`.
- `ck_order_item_modifiers_2`: `CHECK (price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_order_item_modifiers_1`: `(order_item_id)`.
- `ix_order_item_modifiers_2`: `(modifier_id)`.

**Relaciones**

- `order_item_modifiers.order_item_id` → `order_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_item_modifiers.modifier_id` → `modifiers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## order_modifier_item_impacts

Impacto de inventario congelado; no cambia con el catálogo.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_item_modifier_id | UUID | No | — | — | order_item_modifiers.id; fk_order_modifier_item_impacts_order_item_modifier_id | uq_order_modifier_item_impacts_1 |
| item_id | UUID | No | — | — | items.id; fk_order_modifier_item_impacts_item_id | uq_order_modifier_item_impacts_1 |
| quantity_delta | NUMERIC(18,6) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_order_modifier_item_impacts`: `PRIMARY KEY (id)`.
- `uq_order_modifier_item_impacts_1`: `UNIQUE (order_item_modifier_id, item_id)`.
- `ck_order_modifier_item_impacts_1`: `CHECK (quantity_delta <> 0)`.
- `ck_order_modifier_item_impacts_2`: `CHECK (quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_order_modifier_item_impacts_1`: `(item_id)`.

**Relaciones**

- `order_modifier_item_impacts.order_item_modifier_id` → `order_item_modifiers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_modifier_item_impacts.item_id` → `items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## order_status_history

Historial de transiciones con responsable y motivo.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_id | UUID | No | — | — | orders.id; fk_order_status_history_order_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_order_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_order_status_history`: `PRIMARY KEY (id)`.
- `ck_order_status_history_1`: `CHECK (to_status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_order_status_history_1`: `(order_id, occurred_at, id)`.

**Relaciones**

- `order_status_history.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## order_item_status_history

Historial de transiciones con responsable y motivo.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_item_id | UUID | No | — | — | order_items.id; fk_order_item_status_history_order_item_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_order_item_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_order_item_status_history`: `PRIMARY KEY (id)`.
- `ck_order_item_status_history_1`: `CHECK (to_status IN ('DRAFT', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_order_item_status_history_1`: `(order_item_id)`.

**Relaciones**

- `order_item_status_history.order_item_id` → `order_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `order_item_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## special_requests

Solicitudes especiales evaluadas por personal.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_id | UUID | No | — | — | orders.id; fk_special_requests_order_id | — |
| order_item_id | UUID | Sí | — | — | order_items.id; fk_special_requests_order_item_id | — |
| description | TEXT | No | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| reviewed_by | UUID | Sí | — | — | users.id; fk_special_requests_reviewed_by | — |
| reviewed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| response | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_special_requests_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_special_requests_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_special_requests`: `PRIMARY KEY (id)`.
- `ck_special_requests_1`: `CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'))`.
- `ck_special_requests_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_special_requests_1`: `(order_id)`.
- `ix_special_requests_2`: `(order_item_id)`.
- `ix_special_requests_3`: `(reviewed_by)`.

**Relaciones**

- `special_requests.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `special_requests.order_item_id` → `order_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `special_requests.reviewed_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `special_requests.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `special_requests.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- FK compuesta `order_item_id, order_id` → `order_items(id, order_id)`: exige contexto coincidente; RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## kitchen_tickets

Comanda dividida por área, admite envíos incrementales.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_id | UUID | No | — | — | orders.id; fk_kitchen_tickets_order_id | uq_kitchen_tickets_1 |
| preparation_area_id | UUID | No | — | — | preparation_areas.id; fk_kitchen_tickets_preparation_area_id | uq_kitchen_tickets_1 |
| status | TEXT | No | 'QUEUED' | — | — | — |
| sent_at | TIMESTAMPTZ | No | now() | — | — | — |
| started_at | TIMESTAMPTZ | Sí | — | — | — | — |
| ready_at | TIMESTAMPTZ | Sí | — | — | — | — |
| sequence_number | INTEGER | No | — | — | — | uq_kitchen_tickets_1 |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_kitchen_tickets_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_kitchen_tickets_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_kitchen_tickets`: `PRIMARY KEY (id)`.
- `uq_kitchen_tickets_1`: `UNIQUE (order_id, preparation_area_id, sequence_number)`.
- `ck_kitchen_tickets_1`: `CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED'))`.
- `ck_kitchen_tickets_2`: `CHECK (sequence_number > 0)`.
- `ck_kitchen_tickets_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_kitchen_tickets_1`: `(preparation_area_id, sent_at, id)` WHERE `status IN ('QUEUED','IN_PROGRESS')`.
- `ix_kitchen_tickets_2`: `(preparation_area_id)`.

**Relaciones**

- `kitchen_tickets.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_tickets.preparation_area_id` → `preparation_areas.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_tickets.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_tickets.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## kitchen_ticket_items

Detalle enviado y cantidad por comanda; cancelación explícita.

Dominio: 10 - Orders Kitchen.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| kitchen_ticket_id | UUID | No | — | — | kitchen_tickets.id; fk_kitchen_ticket_items_kitchen_ticket_id | uq_kitchen_ticket_items_1 |
| order_item_id | UUID | No | — | — | order_items.id; fk_kitchen_ticket_items_order_item_id | uq_kitchen_ticket_items_1 |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| status | TEXT | No | 'QUEUED' | — | — | — |
| cancelled_at | TIMESTAMPTZ | Sí | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_kitchen_ticket_items_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_kitchen_ticket_items_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_kitchen_ticket_items`: `PRIMARY KEY (id)`.
- `uq_kitchen_ticket_items_1`: `UNIQUE (kitchen_ticket_id, order_item_id)`.
- `ck_kitchen_ticket_items_1`: `CHECK (quantity > 0)`.
- `ck_kitchen_ticket_items_2`: `CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'CANCELLED'))`.
- `ck_kitchen_ticket_items_3`: `CHECK (row_version > 0)`.
- `ck_kitchen_ticket_items_4`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_kitchen_ticket_items_1`: `(order_item_id)`.

**Relaciones**

- `kitchen_ticket_items.kitchen_ticket_id` → `kitchen_tickets.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_ticket_items.order_item_id` → `order_items.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_ticket_items.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `kitchen_ticket_items.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

La línea debe pertenecer al pedido de la comanda. Suma de cantidades activas por línea no supera cantidad enviada; retransmisiones usan idempotencia. Área se congela en kitchen_tickets aunque cambie el menú.

## delivery_partners

Repartidor interno o proveedor externo.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| partner_type | TEXT | No | — | — | — | — |
| employee_id | UUID | Sí | — | — | employee_profiles.id; fk_delivery_partners_employee_id | — |
| name | TEXT | No | — | — | — | — |
| phone | TEXT | Sí | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_delivery_partners_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_delivery_partners_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_delivery_partners`: `PRIMARY KEY (id)`.
- `ck_delivery_partners_1`: `CHECK (partner_type IN ('INTERNAL', 'EXTERNAL'))`.
- `ck_delivery_partners_2`: `CHECK ((partner_type = 'INTERNAL') = (employee_id IS NOT NULL))`.
- `ck_delivery_partners_3`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_delivery_partners_1`: `(employee_id)`.

**Relaciones**

- `delivery_partners.employee_id` → `employee_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `delivery_partners.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `delivery_partners.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## deliveries

Entrega con dirección y contacto históricos; permite reintentos.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| order_id | UUID | No | — | — | orders.id; fk_deliveries_order_id | uq_deliveries_1 |
| partner_id | UUID | Sí | — | — | delivery_partners.id; fk_deliveries_partner_id | — |
| attempt_number | INTEGER | No | 1 | — | — | uq_deliveries_1 |
| status | TEXT | No | 'PENDING' | — | — | — |
| recipient_name_snapshot | TEXT | No | — | — | — | — |
| phone_snapshot | TEXT | No | — | — | — | — |
| address_snapshot | TEXT | No | — | — | — | — |
| instructions_snapshot | TEXT | Sí | — | — | — | — |
| latitude | NUMERIC(9,6) | Sí | — | — | — | — |
| longitude | NUMERIC(9,6) | Sí | — | — | — | — |
| fee | NUMERIC(14,2) | No | 0 | — | — | — |
| assigned_at | TIMESTAMPTZ | Sí | — | — | — | — |
| picked_up_at | TIMESTAMPTZ | Sí | — | — | — | — |
| delivered_at | TIMESTAMPTZ | Sí | — | — | — | — |
| external_reference | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_deliveries_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_deliveries_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_deliveries`: `PRIMARY KEY (id)`.
- `uq_deliveries_1`: `UNIQUE (order_id, attempt_number)`.
- `ck_deliveries_1`: `CHECK (attempt_number > 0)`.
- `ck_deliveries_2`: `CHECK (fee >= 0)`.
- `ck_deliveries_3`: `CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'))`.
- `ck_deliveries_4`: `CHECK (latitude BETWEEN -90 AND 90)`.
- `ck_deliveries_5`: `CHECK (longitude BETWEEN -180 AND 180)`.
- `ck_deliveries_6`: `CHECK (row_version > 0)`.
- `ck_deliveries_7`: `CHECK (latitude::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_deliveries_8`: `CHECK (longitude::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_deliveries_9`: `CHECK (fee::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_deliveries_1`: `(status, created_at, id)`.
- `ix_deliveries_2`: `(partner_id)`.

**Relaciones**

- `deliveries.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `deliveries.partner_id` → `delivery_partners.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `deliveries.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `deliveries.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## delivery_status_history

Historial de transiciones con responsable y motivo.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| deliverie_id | UUID | No | — | — | deliveries.id; fk_delivery_status_history_deliverie_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_delivery_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_delivery_status_history`: `PRIMARY KEY (id)`.
- `ck_delivery_status_history_1`: `CHECK (to_status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_delivery_status_history_1`: `(deliverie_id)`.

**Relaciones**

- `delivery_status_history.deliverie_id` → `deliveries.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `delivery_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## conversations

Conversación multicanal con cliente y modo de atención.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_conversations_customer_id | — |
| channel | TEXT | No | — | — | — | uq_conversations_1 |
| external_thread_id | TEXT | Sí | — | — | — | uq_conversations_1 |
| status | TEXT | No | 'OPEN' | — | — | — |
| handling_mode | TEXT | No | 'HUMAN' | — | — | — |
| closed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_conversations_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_conversations_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_conversations`: `PRIMARY KEY (id)`.
- `uq_conversations_1`: `UNIQUE (channel, external_thread_id)`.
- `ck_conversations_1`: `CHECK (channel IN ('WEB', 'WHATSAPP', 'INSTAGRAM', 'OTHER'))`.
- `ck_conversations_2`: `CHECK (status IN ('OPEN', 'WAITING', 'CLOSED'))`.
- `ck_conversations_3`: `CHECK (handling_mode IN ('AI', 'HUMAN'))`.
- `ck_conversations_4`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_conversations_1`: `(customer_id)`.

**Relaciones**

- `conversations.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `conversations.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `conversations.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## messages

Mensaje con emisor humano, cliente, sistema o IA.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| conversation_id | UUID | No | — | — | conversations.id; fk_messages_conversation_id | uq_messages_1 |
| sender_type | TEXT | No | — | — | — | — |
| sender_user_id | UUID | Sí | — | — | users.id; fk_messages_sender_user_id | — |
| ai_session_id | UUID | Sí | — | — | ai_sessions.id; fk_messages_ai_session_id | — |
| direction | TEXT | No | — | — | — | — |
| body | TEXT | Sí | — | — | — | — |
| attachment_uri | TEXT | Sí | — | — | — | — |
| external_message_id | TEXT | Sí | — | — | — | uq_messages_1 |
| sent_at | TIMESTAMPTZ | Sí | — | — | — | — |
| delivered_at | TIMESTAMPTZ | Sí | — | — | — | — |
| read_at | TIMESTAMPTZ | Sí | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| reply_to_message_id | UUID | Sí | — | — | messages.id; fk_messages_reply_to_message_id | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_messages`: `PRIMARY KEY (id)`.
- `uq_messages_1`: `UNIQUE (conversation_id, external_message_id)`.
- `ck_messages_1`: `CHECK (sender_type IN ('CUSTOMER', 'HUMAN', 'AI', 'SYSTEM'))`.
- `ck_messages_2`: `CHECK (direction IN ('INBOUND', 'OUTBOUND'))`.
- `ck_messages_3`: `CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'))`.
- `ck_messages_4`: `CHECK (body IS NOT NULL OR attachment_uri IS NOT NULL)`.
- `ck_messages_5`: `CHECK (sender_type <> 'HUMAN' OR sender_user_id IS NOT NULL)`.
- `ck_messages_6`: `CHECK (sender_type <> 'AI' OR ai_session_id IS NOT NULL)`.

**Índices adicionales**

- `ix_messages_1`: `(conversation_id, created_at, id)`.
- `ix_messages_2`: `(sender_user_id)`.
- `ix_messages_3`: `(ai_session_id)`.
- `ix_messages_4`: `(reply_to_message_id)`.

**Relaciones**

- `messages.conversation_id` → `conversations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `messages.sender_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `messages.ai_session_id` → `ai_sessions.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `messages.reply_to_message_id` → `messages.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Invitados se identifican por conversation.customer_id aunque sender_user_id sea NULL. Respuesta debe pertenecer a la misma conversación. Adjuntos por URI; no secretos, tokens ni razonamiento de IA.

## external_customer_identities

Identidad por proveedor verificada antes de vincular con cliente interno.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | No | — | — | customer_profiles.id; fk_external_customer_identities_customer_id | — |
| provider | TEXT | No | — | — | — | uq_external_customer_identities_1 |
| external_subject | TEXT | No | — | — | — | uq_external_customer_identities_1 |
| verified_at | TIMESTAMPTZ | Sí | — | — | — | — |
| linked_by | UUID | Sí | — | — | users.id; fk_external_customer_identities_linked_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_external_customer_identities`: `PRIMARY KEY (id)`.
- `uq_external_customer_identities_1`: `UNIQUE (provider, external_subject)`.
- `ck_external_customer_identities_1`: `CHECK (length(external_subject) > 0)`.

**Índices adicionales**

- `ix_external_customer_identities_1`: `(customer_id)`.
- `ix_external_customer_identities_2`: `(linked_by)`.

**Relaciones**

- `external_customer_identities.customer_id` → `customer_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `external_customer_identities.linked_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## message_attachments

Metadatos y retención de adjuntos; contenido fuera de PostgreSQL.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| message_id | UUID | No | — | — | messages.id; fk_message_attachments_message_id | — |
| storage_key | TEXT | No | — | — | — | uq_message_attachments_1 |
| mime_type | TEXT | No | — | — | — | — |
| byte_size | INTEGER | No | — | — | — | — |
| checksum_sha256 | TEXT | No | — | — | — | — |
| scan_status | TEXT | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_message_attachments`: `PRIMARY KEY (id)`.
- `uq_message_attachments_1`: `UNIQUE (storage_key)`.
- `ck_message_attachments_1`: `CHECK (byte_size > 0)`.
- `ck_message_attachments_2`: `CHECK (length(checksum_sha256) = 64)`.
- `ck_message_attachments_3`: `CHECK (scan_status IN ('PENDING', 'CLEAN', 'REJECTED'))`.

**Índices adicionales**

- `ix_message_attachments_1`: `(message_id)`.

**Relaciones**

- `message_attachments.message_id` → `messages.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## message_transcriptions

Transcripción de audio con proveedor y resultado separados del original.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| attachment_id | UUID | No | — | — | message_attachments.id; fk_message_transcriptions_attachment_id | uq_message_transcriptions_1 |
| provider | TEXT | No | — | — | — | — |
| language_code | TEXT | Sí | — | — | — | — |
| text | TEXT | No | — | — | — | — |
| status | TEXT | No | — | — | — | — |
| confidence | NUMERIC(7,6) | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_message_transcriptions`: `PRIMARY KEY (id)`.
- `uq_message_transcriptions_1`: `UNIQUE (attachment_id)`.
- `ck_message_transcriptions_1`: `CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED'))`.
- `ck_message_transcriptions_2`: `CHECK (confidence BETWEEN 0 AND 1)`.
- `ck_message_transcriptions_3`: `CHECK (confidence::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `message_transcriptions.attachment_id` → `message_attachments.id`: cada fila referencia 1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## conversation_assignments

Historial de asignación y liberación humana.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| conversation_id | UUID | No | — | — | conversations.id; fk_conversation_assignments_conversation_id | — |
| assigned_to | UUID | No | — | — | users.id; fk_conversation_assignments_assigned_to | — |
| assigned_by | UUID | Sí | — | — | users.id; fk_conversation_assignments_assigned_by | — |
| released_at | TIMESTAMPTZ | Sí | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_conversation_assignments`: `PRIMARY KEY (id)`.

**Índices adicionales**

- `ux_conversation_assignments_1`: UNIQUE `(conversation_id)` WHERE `released_at IS NULL`.
- `ix_conversation_assignments_2`: `(conversation_id)`.
- `ix_conversation_assignments_3`: `(assigned_to)`.

**Relaciones**

- `conversation_assignments.conversation_id` → `conversations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `conversation_assignments.assigned_to` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `conversation_assignments.assigned_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## message_templates

Plantillas aprobadas y versionadas por canal e idioma.

Dominio: 11 - Delivery Messaging.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_message_templates_1 |
| version_number | INTEGER | No | — | — | — | uq_message_templates_1 |
| channel | TEXT | No | — | — | — | — |
| locale | TEXT | No | — | — | — | uq_message_templates_1 |
| body | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_message_templates_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_message_templates_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_message_templates`: `PRIMARY KEY (id)`.
- `uq_message_templates_1`: `UNIQUE (code, version_number, locale)`.
- `ck_message_templates_1`: `CHECK (version_number > 0)`.
- `ck_message_templates_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `message_templates.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `message_templates.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## currencies

Monedas ISO; una moneda por documento, sin conversión implícita.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_currencies_1 |
| name | TEXT | No | — | — | — | — |
| minor_units | INTEGER | No | 2 | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_currencies`: `PRIMARY KEY (id)`.
- `uq_currencies_1`: `UNIQUE (code)`.
- `ck_currencies_1`: `CHECK (code ~ '^[A-Z]{3}$')`.
- `ck_currencies_2`: `CHECK (minor_units BETWEEN 0 AND 2)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**


**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## bills

Cuenta independiente de mesa; total calculado desde líneas.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_bills_customer_id | — |
| currency_id | UUID | No | — | — | currencies.id; fk_bills_currency_id | — |
| name | TEXT | Sí | — | — | — | — |
| status | TEXT | No | 'OPEN' | — | — | — |
| issued_at | TIMESTAMPTZ | Sí | — | — | — | — |
| closed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| void_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_bills_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_bills_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_bills`: `PRIMARY KEY (id)`.
- `ck_bills_1`: `CHECK (status IN ('OPEN', 'ISSUED', 'PAID', 'VOID'))`.
- `ck_bills_2`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_bills_1`: `(customer_id)`.
- `ix_bills_2`: `(currency_id)`.

**Relaciones**

- `bills.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bills.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bills.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bills.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Total venta = SUM(round(quantity * unit_price,2) - discount_amount + tax_amount) de bill_items no anuladas. Saldo venta descuenta asignaciones SALE de pagos CAPTURED y suma reembolsos SALE exitosos. Propina se concilia aparte. Total derivado no se duplica en bills.

## bill_orders

Una cuenta reúne pedidos; un pedido se divide entre cuentas.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_bill_orders_bill_id | uq_bill_orders_1 |
| order_id | UUID | No | — | — | orders.id; fk_bill_orders_order_id | uq_bill_orders_1 |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_bill_orders`: `PRIMARY KEY (id)`.
- `uq_bill_orders_1`: `UNIQUE (bill_id, order_id)`.

**Índices adicionales**

- `ix_bill_orders_1`: `(order_id)`.

**Relaciones**

- `bill_orders.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bill_orders.order_id` → `orders.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## bill_items

Fracción facturable de una línea o cargo explícito; importes históricos.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_bill_items_bill_id | — |
| order_item_id | UUID | Sí | — | — | order_items.id; fk_bill_items_order_item_id | — |
| line_type | TEXT | No | — | — | — | — |
| description_snapshot | TEXT | No | — | — | — | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| unit_price | NUMERIC(14,2) | No | — | — | — | — |
| discount_amount | NUMERIC(14,2) | No | 0 | — | — | — |
| tax_amount | NUMERIC(14,2) | No | 0 | — | — | — |
| tax_rate_snapshot | NUMERIC(9,6) | No | 0 | — | — | — |
| voided_at | TIMESTAMPTZ | Sí | — | — | — | — |
| voided_by | UUID | Sí | — | — | users.id; fk_bill_items_voided_by | — |
| void_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_bill_items`: `PRIMARY KEY (id)`.
- `ck_bill_items_1`: `CHECK (quantity > 0)`.
- `ck_bill_items_2`: `CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0)`.
- `ck_bill_items_3`: `CHECK (discount_amount <= round(quantity * unit_price, 2))`.
- `ck_bill_items_4`: `CHECK (tax_rate_snapshot >= 0)`.
- `ck_bill_items_5`: `CHECK (line_type IN ('SALE', 'DELIVERY_FEE', 'SERVICE_FEE'))`.
- `ck_bill_items_6`: `CHECK (line_type <> 'SALE' OR order_item_id IS NOT NULL)`.
- `ck_bill_items_7`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_bill_items_8`: `CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_bill_items_9`: `CHECK (discount_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_bill_items_10`: `CHECK (tax_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_bill_items_11`: `CHECK (tax_rate_snapshot::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_bill_items_1`: `(bill_id)`.
- `ix_bill_items_2`: `(order_item_id)`.
- `ix_bill_items_3`: `(voided_by)`.

**Relaciones**

- `bill_items.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bill_items.order_item_id` → `order_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `bill_items.voided_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Una línea de pedido puede dividirse por cantidad entre cuentas. R08 impide sobrefacturación y mezcla de monedas. unit_price congela precio efectivo; tax_amount es impuesto adicional al precio neto de descuento, con política de impuestos explícita.

## payment_methods

Métodos configurables; distingue efectivo para caja.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_payment_methods_1 |
| name | TEXT | No | — | — | — | — |
| is_cash | BOOLEAN | No | false | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_payment_methods_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_payment_methods_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_payment_methods`: `PRIMARY KEY (id)`.
- `uq_payment_methods_1`: `UNIQUE (code)`.
- `ck_payment_methods_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `payment_methods.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_methods.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## payments

Intento/cobro individual parcial de una cuenta; no almacena PAN/CVV.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_payments_bill_id | — |
| payment_method_id | UUID | No | — | — | payment_methods.id; fk_payments_payment_method_id | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| status | TEXT | No | 'CREATED' | — | — | — |
| provider | TEXT | Sí | — | — | — | uq_payments_1 |
| provider_reference | TEXT | Sí | — | — | — | uq_payments_1 |
| paid_at | TIMESTAMPTZ | Sí | — | — | — | — |
| received_by | UUID | Sí | — | — | users.id; fk_payments_received_by | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| client_action_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_payments_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_payments_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_payments`: `PRIMARY KEY (id)`.
- `uq_payments_1`: `UNIQUE (provider, provider_reference)`.
- `ck_payments_1`: `CHECK (amount > 0)`.
- `ck_payments_2`: `CHECK (status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED'))`.
- `ck_payments_3`: `CHECK (status <> 'CAPTURED' OR paid_at IS NOT NULL)`.
- `ck_payments_4`: `CHECK ((provider IS NULL) = (provider_reference IS NULL))`.
- `ck_payments_5`: `CHECK (row_version > 0)`.
- `ck_payments_6`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_payments_1`: `(bill_id, status)`.
- `ix_payments_2`: `(payment_method_id)`.
- `ix_payments_3`: `(received_by)`.

**Relaciones**

- `payments.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payments.payment_method_id` → `payment_methods.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payments.received_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payments.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payments.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

amount es importe a capturar: venta más propina. Comisión se registra en payment_fees y no reduce amount. La moneda se hereda de bills. Sólo CAPTURED liquida saldo; UNKNOWN exige conciliación. Un pago sólo tiene una bill y un método; múltiples métodos producen múltiples filas.

## payment_intents

Intento de pasarela autorizado por backend; no almacena PAN/CVV.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_payment_intents_bill_id | — |
| provider | TEXT | No | — | — | — | uq_payment_intents_1, uq_payment_intents_2 |
| provider_intent_id | TEXT | Sí | — | — | — | uq_payment_intents_1 |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_payment_intents_currency_id | — |
| status | TEXT | No | 'CREATED' | — | — | — |
| idempotency_key | TEXT | No | — | — | — | uq_payment_intents_2 |
| requires_action_url | TEXT | Sí | — | — | — | — |
| expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| captured_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_payment_intents_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_payment_intents_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_payment_intents`: `PRIMARY KEY (id)`.
- `uq_payment_intents_1`: `UNIQUE (provider, provider_intent_id)`.
- `uq_payment_intents_2`: `UNIQUE (provider, idempotency_key)`.
- `ck_payment_intents_1`: `CHECK (amount > 0)`.
- `ck_payment_intents_2`: `CHECK (status IN ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED'))`.
- `ck_payment_intents_3`: `CHECK (row_version > 0)`.
- `ck_payment_intents_4`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_payment_intents_1`: `(bill_id)`.
- `ix_payment_intents_2`: `(currency_id)`.

**Relaciones**

- `payment_intents.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_intents.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_intents.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_intents.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## payment_gateway_events

Evento crudo referenciado para deduplicación y conciliación de webhook.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_intent_id | UUID | Sí | — | — | payment_intents.id; fk_payment_gateway_events_payment_intent_id | — |
| provider | TEXT | No | — | — | — | uq_payment_gateway_events_1 |
| provider_event_id | TEXT | No | — | — | — | uq_payment_gateway_events_1 |
| event_type | TEXT | No | — | — | — | — |
| payload_hash | TEXT | No | — | — | — | — |
| received_at | TIMESTAMPTZ | No | now() | — | — | — |
| processed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| processing_status | TEXT | No | 'RECEIVED' | — | — | — |
| error_code | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_payment_gateway_events`: `PRIMARY KEY (id)`.
- `uq_payment_gateway_events_1`: `UNIQUE (provider, provider_event_id)`.
- `ck_payment_gateway_events_1`: `CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'))`.
- `ck_payment_gateway_events_2`: `CHECK (length(payload_hash) = 64)`.

**Índices adicionales**

- `ix_payment_gateway_events_1`: `(payment_intent_id)`.

**Relaciones**

- `payment_gateway_events.payment_intent_id` → `payment_intents.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## payment_allocations

Distribuye el cobro entre venta y propina.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_id | UUID | No | — | — | payments.id; fk_payment_allocations_payment_id | — |
| tip_id | UUID | Sí | — | — | tips.id; fk_payment_allocations_tip_id | — |
| allocation_type | TEXT | No | — | — | — | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_payment_allocations`: `PRIMARY KEY (id)`.
- `ck_payment_allocations_1`: `CHECK (amount > 0)`.
- `ck_payment_allocations_2`: `CHECK (allocation_type IN ('SALE', 'TIP'))`.
- `ck_payment_allocations_3`: `CHECK ((allocation_type = 'TIP') = (tip_id IS NOT NULL))`.
- `ck_payment_allocations_4`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ux_payment_allocations_1`: UNIQUE `(payment_id)` WHERE `allocation_type = 'SALE'`.
- `ux_payment_allocations_2`: UNIQUE `(payment_id, tip_id)` WHERE `allocation_type = 'TIP'`.
- `ix_payment_allocations_3`: `(payment_id)`.
- `ix_payment_allocations_4`: `(tip_id)`.

**Relaciones**

- `payment_allocations.payment_id` → `payments.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_allocations.tip_id` → `tips.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

SUM(amount) debe igualar payments.amount antes de CAPTURED. Un tip debe pertenecer a la misma bill. Una fila SALE y hasta una por tip. El cambio en efectivo no es venta: amount es efectivo neto aplicado.

## payment_refunds

Reembolso explícito sin borrar el pago original.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_id | UUID | No | — | — | payments.id; fk_payment_refunds_payment_id | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| reason | TEXT | No | — | — | — | — |
| provider_reference | TEXT | Sí | — | — | — | — |
| refunded_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_payment_refunds_created_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_by | UUID | Sí | — | — | users.id; fk_payment_refunds_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_payment_refunds`: `PRIMARY KEY (id)`.
- `ck_payment_refunds_1`: `CHECK (amount > 0)`.
- `ck_payment_refunds_2`: `CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED'))`.
- `ck_payment_refunds_3`: `CHECK (row_version > 0)`.
- `ck_payment_refunds_4`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_payment_refunds_1`: `(payment_id)`.

**Relaciones**

- `payment_refunds.payment_id` → `payments.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_refunds.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_refunds.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Nunca cambiar amount del pago exitoso. SUM(reembolsos SUCCEEDED) no supera cobro y refund_allocations limita devolución por venta/propina original. Webhooks se deduplican por idempotencia y referencia externa.

## refund_allocations

Identifica la parte de venta o propina devuelta.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| refund_id | UUID | No | — | — | payment_refunds.id; fk_refund_allocations_refund_id | uq_refund_allocations_1 |
| payment_allocation_id | UUID | No | — | — | payment_allocations.id; fk_refund_allocations_payment_allocation_id | uq_refund_allocations_1 |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_refund_allocations`: `PRIMARY KEY (id)`.
- `uq_refund_allocations_1`: `UNIQUE (refund_id, payment_allocation_id)`.
- `ck_refund_allocations_1`: `CHECK (amount > 0)`.
- `ck_refund_allocations_2`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_refund_allocations_1`: `(payment_allocation_id)`.

**Relaciones**

- `refund_allocations.refund_id` → `payment_refunds.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `refund_allocations.payment_allocation_id` → `payment_allocations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## payment_fees

Comisión del procesador separada del cobro y la propina.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_id | UUID | No | — | — | payments.id; fk_payment_fees_payment_id | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| description | TEXT | No | — | — | — | — |
| assessed_at | TIMESTAMPTZ | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_payment_fees`: `PRIMARY KEY (id)`.
- `ck_payment_fees_1`: `CHECK (amount >= 0)`.
- `ck_payment_fees_2`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_payment_fees_1`: `(payment_id)`.

**Relaciones**

- `payment_fees.payment_id` → `payments.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## tips

Propina voluntaria separada del ingreso por venta.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_tips_bill_id | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| status | TEXT | No | 'PLEDGED' | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_tips_created_by | — |
| voided_at | TIMESTAMPTZ | Sí | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_by | UUID | Sí | — | — | users.id; fk_tips_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_tips`: `PRIMARY KEY (id)`.
- `ck_tips_1`: `CHECK (amount > 0)`.
- `ck_tips_2`: `CHECK (status IN ('PLEDGED', 'COLLECTED', 'DISTRIBUTED', 'VOID'))`.
- `ck_tips_3`: `CHECK (row_version > 0)`.
- `ck_tips_4`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_tips_1`: `(bill_id)`.

**Relaciones**

- `tips.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `tips.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `tips.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## tip_distributions

Distribución de propina a empleados, pendiente o entregada.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| tip_id | UUID | No | — | — | tips.id; fk_tip_distributions_tip_id | — |
| employee_id | UUID | No | — | — | employee_profiles.id; fk_tip_distributions_employee_id | — |
| amount | NUMERIC(14,2) | No | — | — | — | — |
| paid_at | TIMESTAMPTZ | Sí | — | — | — | — |
| cash_movement_id | UUID | Sí | — | — | cash_movements.id; fk_tip_distributions_cash_movement_id | — |
| created_by | UUID | No | — | — | users.id; fk_tip_distributions_created_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_tip_distributions`: `PRIMARY KEY (id)`.
- `ck_tip_distributions_1`: `CHECK (amount > 0)`.
- `ck_tip_distributions_2`: `CHECK (amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_tip_distributions_1`: `(tip_id)`.
- `ix_tip_distributions_2`: `(employee_id)`.
- `ix_tip_distributions_3`: `(cash_movement_id)`.

**Relaciones**

- `tip_distributions.tip_id` → `tips.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `tip_distributions.employee_id` → `employee_profiles.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `tip_distributions.cash_movement_id` → `cash_movements.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `tip_distributions.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## cash_registers

Cajas físicas y moneda de arqueo.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_cash_registers_1 |
| name | TEXT | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_cash_registers_currency_id | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_cash_registers_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_cash_registers_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_cash_registers`: `PRIMARY KEY (id)`.
- `uq_cash_registers_1`: `UNIQUE (code)`.
- `ck_cash_registers_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ix_cash_registers_1`: `(currency_id)`.

**Relaciones**

- `cash_registers.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_registers.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_registers.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## cash_sessions

Turno de caja; saldo inicial se asienta como movimiento OPENING.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| cash_register_id | UUID | No | — | — | cash_registers.id; fk_cash_sessions_cash_register_id | — |
| opened_by | UUID | No | — | — | users.id; fk_cash_sessions_opened_by | — |
| opened_at | TIMESTAMPTZ | No | now() | — | — | — |
| closed_by | UUID | Sí | — | — | users.id; fk_cash_sessions_closed_by | — |
| closed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| status | TEXT | No | 'OPEN' | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_cash_sessions_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_cash_sessions_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_cash_sessions`: `PRIMARY KEY (id)`.
- `ck_cash_sessions_1`: `CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED'))`.
- `ck_cash_sessions_2`: `CHECK (closed_at IS NULL OR closed_at >= opened_at)`.
- `ck_cash_sessions_3`: `CHECK (status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL))`.
- `ck_cash_sessions_4`: `CHECK (row_version > 0)`.

**Índices adicionales**

- `ux_cash_sessions_1`: UNIQUE `(cash_register_id)` WHERE `status IN ('OPEN','CLOSING')`.
- `ix_cash_sessions_2`: `(cash_register_id)`.
- `ix_cash_sessions_3`: `(opened_by)`.
- `ix_cash_sessions_4`: `(closed_by)`.

**Relaciones**

- `cash_sessions.cash_register_id` → `cash_registers.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_sessions.opened_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_sessions.closed_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_sessions.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_sessions.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## cash_movements

Libro de caja firmado; efectivo neto recibido, egresos y reversos.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| cash_session_id | UUID | No | — | — | cash_sessions.id; fk_cash_movements_cash_session_id | — |
| movement_type | TEXT | No | — | — | — | — |
| amount_delta | NUMERIC(14,2) | No | — | — | — | — |
| payment_id | UUID | Sí | — | — | payments.id; fk_cash_movements_payment_id | uq_cash_movements_1 |
| refund_id | UUID | Sí | — | — | payment_refunds.id; fk_cash_movements_refund_id | uq_cash_movements_2 |
| reversal_of_id | UUID | Sí | — | — | cash_movements.id; fk_cash_movements_reversal_of_id | uq_cash_movements_3 |
| reason | TEXT | No | — | — | — | — |
| responsible_user_id | UUID | No | — | — | users.id; fk_cash_movements_responsible_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_cash_movements`: `PRIMARY KEY (id)`.
- `uq_cash_movements_1`: `UNIQUE (payment_id)`.
- `uq_cash_movements_2`: `UNIQUE (refund_id)`.
- `uq_cash_movements_3`: `UNIQUE (reversal_of_id)`.
- `ck_cash_movements_1`: `CHECK (movement_type IN ('OPENING', 'SALE', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'REFUND', 'TIP_PAYOUT', 'REVERSAL'))`.
- `ck_cash_movements_2`: `CHECK (amount_delta <> 0 OR movement_type = 'OPENING')`.
- `ck_cash_movements_3`: `CHECK (movement_type NOT IN ('EXPENSE','WITHDRAWAL','REFUND','TIP_PAYOUT') OR amount_delta < 0)`.
- `ck_cash_movements_4`: `CHECK (movement_type NOT IN ('OPENING','SALE','INCOME') OR amount_delta >= 0)`.
- `ck_cash_movements_5`: `CHECK (movement_type <> 'SALE' OR payment_id IS NOT NULL)`.
- `ck_cash_movements_6`: `CHECK (movement_type <> 'REFUND' OR refund_id IS NOT NULL)`.
- `ck_cash_movements_7`: `CHECK (amount_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ux_cash_movements_1`: UNIQUE `(cash_session_id)` WHERE `movement_type = 'OPENING'`.
- `ix_cash_movements_2`: `(cash_session_id, occurred_at, id)`.
- `ix_cash_movements_3`: `(responsible_user_id)`.

**Relaciones**

- `cash_movements.cash_session_id` → `cash_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_movements.payment_id` → `payments.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `cash_movements.refund_id` → `payment_refunds.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `cash_movements.reversal_of_id` → `cash_movements.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `cash_movements.responsible_user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Sólo efectivo real. Un pago electrónico no produce SALE en caja. Venta en efectivo incluye propina capturada; distribución de propina es salida TIP_PAYOUT. La conciliación registra cierre, no un movimiento negativo ficticio.

## cash_reconciliations

Arqueo histórico; diferencia calculada, cierre conserva corte.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| cash_session_id | UUID | No | — | — | cash_sessions.id; fk_cash_reconciliations_cash_session_id | — |
| expected_cash | NUMERIC(14,2) | No | — | — | — | — |
| counted_cash | NUMERIC(14,2) | No | — | — | — | — |
| difference | NUMERIC(14,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED | No | — | — | — | — |
| counted_by | UUID | No | — | — | users.id; fk_cash_reconciliations_counted_by | — |
| counted_at | TIMESTAMPTZ | No | now() | — | — | — |
| is_final | BOOLEAN | No | false | — | — | — |
| notes | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_cash_reconciliations`: `PRIMARY KEY (id)`.
- `ck_cash_reconciliations_1`: `CHECK (counted_cash >= 0)`.
- `ck_cash_reconciliations_2`: `CHECK (expected_cash::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_cash_reconciliations_3`: `CHECK (counted_cash::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_cash_reconciliations_4`: `CHECK (difference::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ux_cash_reconciliations_1`: UNIQUE `(cash_session_id)` WHERE `is_final`.
- `ix_cash_reconciliations_2`: `(cash_session_id)`.
- `ix_cash_reconciliations_3`: `(counted_by)`.

**Relaciones**

- `cash_reconciliations.cash_session_id` → `cash_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `cash_reconciliations.counted_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

expected_cash = SUM(asientos) hasta corte de cierre bajo bloqueo de sesión. difference se genera en PostgreSQL. Arqueos intermedios se conservan; uno final por sesión. Un faltante no se oculta alterando el saldo esperado.

## invoices

Documento fiscal con emisor/receptor históricos; NIT opcional.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| bill_id | UUID | No | — | — | bills.id; fk_invoices_bill_id | — |
| customer_id | UUID | Sí | — | — | customer_profiles.id; fk_invoices_customer_id | — |
| document_type | TEXT | No | — | — | — | — |
| original_invoice_id | UUID | Sí | — | — | invoices.id; fk_invoices_original_invoice_id | — |
| series | TEXT | Sí | — | — | — | uq_invoices_1 |
| document_number | TEXT | Sí | — | — | — | uq_invoices_1 |
| status | TEXT | No | 'DRAFT' | — | — | — |
| issuer_snapshot | JSONB | No | — | — | — | — |
| customer_name_snapshot | TEXT | No | — | — | — | — |
| tax_identifier_snapshot | TEXT | Sí | — | — | — | — |
| address_snapshot | TEXT | Sí | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_invoices_currency_id | — |
| subtotal | NUMERIC(14,2) | No | — | — | — | — |
| tax_total | NUMERIC(14,2) | No | — | — | — | — |
| total | NUMERIC(14,2) | No | — | — | — | — |
| issued_at | TIMESTAMPTZ | Sí | — | — | — | — |
| voided_at | TIMESTAMPTZ | Sí | — | — | — | — |
| void_reason | TEXT | Sí | — | — | — | — |
| external_authorization | TEXT | Sí | — | — | — | uq_invoices_2 |
| document_uri | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_invoices`: `PRIMARY KEY (id)`.
- `uq_invoices_1`: `UNIQUE (series, document_number)`.
- `uq_invoices_2`: `UNIQUE (external_authorization)`.
- `ck_invoices_1`: `CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE'))`.
- `ck_invoices_2`: `CHECK (status IN ('DRAFT', 'PENDING_CERTIFICATION', 'CERTIFYING', 'CERTIFIED', 'REJECTED', 'UNKNOWN', 'CONTINGENCY', 'CANCELLATION_PENDING', 'CANCELLED'))`.
- `ck_invoices_3`: `CHECK (subtotal >= 0 AND tax_total >= 0 AND total = subtotal + tax_total)`.
- `ck_invoices_4`: `CHECK (document_type <> 'CREDIT_NOTE' OR original_invoice_id IS NOT NULL)`.
- `ck_invoices_5`: `CHECK ((series IS NULL) = (document_number IS NULL))`.
- `ck_invoices_6`: `CHECK (status <> 'CERTIFIED' OR (series IS NOT NULL AND document_number IS NOT NULL AND external_authorization IS NOT NULL))`.
- `ck_invoices_7`: `CHECK (subtotal::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoices_8`: `CHECK (tax_total::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoices_9`: `CHECK (total::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_invoices_1`: `(bill_id)`.
- `ix_invoices_2`: `(customer_id)`.
- `ix_invoices_3`: `(original_invoice_id)`.
- `ix_invoices_4`: `(currency_id)`.

**Relaciones**

- `invoices.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `invoices.customer_id` → `customer_profiles.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `invoices.original_invoice_id` → `invoices.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `invoices.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Datos fiscales no se releen del cliente. bill vincula orders mediante bill_orders, sin order_id redundante. Factura y nota de crédito conservan líneas e importes. Política tributaria y autorización del proveedor fiscal requieren definición local antes de producción.

## fiscal_allocations

Reserva del pool facturable por documento en una sesión o cuenta.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| invoice_id | UUID | No | — | — | invoices.id; fk_fiscal_allocations_invoice_id | uq_fiscal_allocations_1 |
| bill_id | UUID | No | — | — | bills.id; fk_fiscal_allocations_bill_id | uq_fiscal_allocations_1 |
| allocated_amount | NUMERIC(14,2) | No | — | — | — | — |
| released_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_fiscal_allocations`: `PRIMARY KEY (id)`.
- `uq_fiscal_allocations_1`: `UNIQUE (invoice_id, bill_id)`.
- `ck_fiscal_allocations_1`: `CHECK (allocated_amount > 0)`.
- `ck_fiscal_allocations_2`: `CHECK (allocated_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_fiscal_allocations_1`: `(bill_id)`.

**Relaciones**

- `fiscal_allocations.invoice_id` → `invoices.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `fiscal_allocations.bill_id` → `bills.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## fiscal_attempts

Intento de certificación externa por documento; UNKNOWN requiere conciliación.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| invoice_id | UUID | No | — | — | invoices.id; fk_fiscal_attempts_invoice_id | — |
| provider | TEXT | No | — | — | — | — |
| request_id | UUID | No | — | — | — | uq_fiscal_attempts_1 |
| status | TEXT | No | — | — | — | — |
| submitted_at | TIMESTAMPTZ | No | now() | — | — | — |
| completed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| provider_reference | TEXT | Sí | — | — | — | — |
| error_code | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_fiscal_attempts`: `PRIMARY KEY (id)`.
- `uq_fiscal_attempts_1`: `UNIQUE (request_id)`.
- `ck_fiscal_attempts_1`: `CHECK (status IN ('PENDING_CERTIFICATION', 'CERTIFYING', 'CERTIFIED', 'REJECTED', 'UNKNOWN', 'CONTINGENCY', 'CANCELLATION_PENDING', 'CANCELLED'))`.

**Índices adicionales**

- `ix_fiscal_attempts_1`: `(invoice_id)`.

**Relaciones**

- `fiscal_attempts.invoice_id` → `invoices.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## fiscal_artifacts

XML/PDF/acuses inmutables en storage con hash y referencia fiscal.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| invoice_id | UUID | No | — | — | invoices.id; fk_fiscal_artifacts_invoice_id | — |
| artifact_type | TEXT | No | — | — | — | — |
| storage_key | TEXT | No | — | — | — | uq_fiscal_artifacts_1 |
| sha256 | TEXT | No | — | — | — | — |
| provider_uuid | TEXT | Sí | — | — | — | — |
| series | TEXT | Sí | — | — | — | — |
| document_number | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_fiscal_artifacts`: `PRIMARY KEY (id)`.
- `uq_fiscal_artifacts_1`: `UNIQUE (storage_key)`.
- `ck_fiscal_artifacts_1`: `CHECK (artifact_type IN ('ORIGINAL_XML', 'CERTIFIED_XML', 'PDF', 'ACKNOWLEDGEMENT'))`.
- `ck_fiscal_artifacts_2`: `CHECK (length(sha256) = 64)`.

**Índices adicionales**

- `ix_fiscal_artifacts_1`: `(invoice_id)`.

**Relaciones**

- `fiscal_artifacts.invoice_id` → `invoices.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## invoice_items

Líneas fiscales congeladas; nunca releer precios actuales del menú.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| invoice_id | UUID | No | — | — | invoices.id; fk_invoice_items_invoice_id | — |
| bill_item_id | UUID | Sí | — | — | bill_items.id; fk_invoice_items_bill_item_id | — |
| description_snapshot | TEXT | No | — | — | — | — |
| quantity | NUMERIC(18,6) | No | — | — | — | — |
| unit_price | NUMERIC(14,2) | No | — | — | — | — |
| discount_amount | NUMERIC(14,2) | No | 0 | — | — | — |
| tax_amount | NUMERIC(14,2) | No | 0 | — | — | — |
| line_total | NUMERIC(14,2) | No | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_invoice_items`: `PRIMARY KEY (id)`.
- `ck_invoice_items_1`: `CHECK (quantity > 0)`.
- `ck_invoice_items_2`: `CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0)`.
- `ck_invoice_items_3`: `CHECK (line_total = round(quantity * unit_price, 2) - discount_amount + tax_amount)`.
- `ck_invoice_items_4`: `CHECK (line_total >= 0)`.
- `ck_invoice_items_5`: `CHECK (quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoice_items_6`: `CHECK (unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoice_items_7`: `CHECK (discount_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoice_items_8`: `CHECK (tax_amount::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.
- `ck_invoice_items_9`: `CHECK (line_total::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_invoice_items_1`: `(invoice_id)`.
- `ix_invoice_items_2`: `(bill_item_id)`.

**Relaciones**

- `invoice_items.invoice_id` → `invoices.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `invoice_items.bill_item_id` → `bill_items.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## ai_sessions

Sesión operativa de IA; sin razonamiento interno.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| conversation_id | UUID | Sí | — | — | conversations.id; fk_ai_sessions_conversation_id | — |
| initiated_by | UUID | Sí | — | — | users.id; fk_ai_sessions_initiated_by | — |
| model_reference | TEXT | No | — | — | — | — |
| status | TEXT | No | 'ACTIVE' | — | — | — |
| started_at | TIMESTAMPTZ | No | now() | — | — | — |
| ended_at | TIMESTAMPTZ | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_ai_sessions`: `PRIMARY KEY (id)`.
- `ck_ai_sessions_1`: `CHECK (status IN ('ACTIVE', 'COMPLETED', 'HANDED_OFF', 'FAILED'))`.

**Índices adicionales**

- `ix_ai_sessions_1`: `(conversation_id)`.
- `ix_ai_sessions_2`: `(initiated_by)`.

**Relaciones**

- `ai_sessions.conversation_id` → `conversations.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_sessions.initiated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## ai_tool_calls

Invocación autorizada de herramienta con datos redactados.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| ai_session_id | UUID | No | — | — | ai_sessions.id; fk_ai_tool_calls_ai_session_id | — |
| tool_name | TEXT | No | — | — | — | — |
| arguments_redacted | JSONB | No | — | — | — | — |
| result_summary | JSONB | Sí | — | — | — | — |
| status | TEXT | No | — | — | — | — |
| authorized_user_id | UUID | Sí | — | — | users.id; fk_ai_tool_calls_authorized_user_id | — |
| started_at | TIMESTAMPTZ | No | — | — | — | — |
| finished_at | TIMESTAMPTZ | Sí | — | — | — | — |
| request_id | UUID | No | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_ai_tool_calls`: `PRIMARY KEY (id)`.
- `ck_ai_tool_calls_1`: `CHECK (status IN ('REQUESTED', 'ALLOWED', 'DENIED', 'SUCCEEDED', 'FAILED'))`.
- `ck_ai_tool_calls_2`: `CHECK (finished_at IS NULL OR finished_at >= started_at)`.

**Índices adicionales**

- `ix_ai_tool_calls_1`: `(ai_session_id)`.
- `ix_ai_tool_calls_2`: `(authorized_user_id)`.

**Relaciones**

- `ai_tool_calls.ai_session_id` → `ai_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_tool_calls.authorized_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## ai_handoffs

Escalamiento a humano y resultado de aceptación.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| ai_session_id | UUID | No | — | — | ai_sessions.id; fk_ai_handoffs_ai_session_id | — |
| conversation_id | UUID | No | — | — | conversations.id; fk_ai_handoffs_conversation_id | — |
| reason | TEXT | No | — | — | — | — |
| requested_at | TIMESTAMPTZ | No | now() | — | — | — |
| accepted_by | UUID | Sí | — | — | users.id; fk_ai_handoffs_accepted_by | — |
| accepted_at | TIMESTAMPTZ | Sí | — | — | — | — |
| resolved_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_ai_handoffs`: `PRIMARY KEY (id)`.

**Índices adicionales**

- `ix_ai_handoffs_1`: `(ai_session_id)`.
- `ix_ai_handoffs_2`: `(conversation_id)`.
- `ix_ai_handoffs_3`: `(accepted_by)`.

**Relaciones**

- `ai_handoffs.ai_session_id` → `ai_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_handoffs.conversation_id` → `conversations.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_handoffs.accepted_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## ai_feedback

Corrección revisable; jamás dispara aprendizaje automático.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| ai_session_id | UUID | No | — | — | ai_sessions.id; fk_ai_feedback_ai_session_id | — |
| message_id | UUID | Sí | — | — | messages.id; fk_ai_feedback_message_id | — |
| rating | INTEGER | Sí | — | — | — | — |
| outcome | TEXT | No | — | — | — | — |
| human_answer | TEXT | Sí | — | — | — | — |
| correction | TEXT | Sí | — | — | — | — |
| category | TEXT | Sí | — | — | — | — |
| status | TEXT | No | 'RECORDED' | — | — | — |
| reviewed_by | UUID | Sí | — | — | users.id; fk_ai_feedback_reviewed_by | — |
| reviewed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_ai_feedback`: `PRIMARY KEY (id)`.
- `ck_ai_feedback_1`: `CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)`.
- `ck_ai_feedback_2`: `CHECK (status IN ('RECORDED', 'TRAINING_CANDIDATE', 'APPROVED', 'REJECTED'))`.

**Índices adicionales**

- `ix_ai_feedback_1`: `(ai_session_id)`.
- `ix_ai_feedback_2`: `(message_id)`.
- `ix_ai_feedback_3`: `(reviewed_by)`.

**Relaciones**

- `ai_feedback.ai_session_id` → `ai_sessions.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_feedback.message_id` → `messages.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `ai_feedback.reviewed_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## ai_dataset_versions

Dataset versionado aprobado por humano para entrenamiento separado.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| version_tag | TEXT | No | — | — | — | uq_ai_dataset_versions_1 |
| storage_key | TEXT | No | — | — | — | — |
| sha256 | TEXT | No | — | — | — | — |
| record_count | INTEGER | No | — | — | — | — |
| status | TEXT | No | 'DRAFT' | — | — | — |
| approved_by | UUID | Sí | — | — | users.id; fk_ai_dataset_versions_approved_by | — |
| approved_at | TIMESTAMPTZ | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_ai_dataset_versions`: `PRIMARY KEY (id)`.
- `uq_ai_dataset_versions_1`: `UNIQUE (version_tag)`.
- `ck_ai_dataset_versions_1`: `CHECK (record_count >= 0)`.
- `ck_ai_dataset_versions_2`: `CHECK (length(sha256) = 64)`.
- `ck_ai_dataset_versions_3`: `CHECK (status IN ('DRAFT', 'REVIEWED', 'APPROVED', 'RETIRED'))`.

**Índices adicionales**

- `ix_ai_dataset_versions_1`: `(approved_by)`.

**Relaciones**

- `ai_dataset_versions.approved_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## voucher_evidence

Extracción visual no equivale a pago confirmado.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_id | UUID | Sí | — | — | payments.id; fk_voucher_evidence_payment_id | — |
| order_id | UUID | Sí | — | — | orders.id; fk_voucher_evidence_order_id | — |
| storage_key | TEXT | No | — | — | — | — |
| sha256 | TEXT | No | — | — | — | uq_voucher_evidence_1 |
| status | TEXT | No | 'RECEIVED' | — | — | — |
| extracted_fields | JSONB | No | '{}'::jsonb | — | — | — |
| reviewed_by | UUID | Sí | — | — | users.id; fk_voucher_evidence_reviewed_by | — |
| reviewed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| review_reason | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_voucher_evidence`: `PRIMARY KEY (id)`.
- `uq_voucher_evidence_1`: `UNIQUE (sha256)`.
- `ck_voucher_evidence_1`: `CHECK (status IN ('RECEIVED', 'EXTRACTED', 'MATCHED', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED'))`.
- `ck_voucher_evidence_2`: `CHECK (length(sha256) = 64)`.

**Índices adicionales**

- `ix_voucher_evidence_1`: `(payment_id)`.
- `ix_voucher_evidence_2`: `(order_id)`.
- `ix_voucher_evidence_3`: `(reviewed_by)`.

**Relaciones**

- `voucher_evidence.payment_id` → `payments.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `voucher_evidence.order_id` → `orders.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `voucher_evidence.reviewed_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## camera_sources

Fuentes de cámara; credenciales en gestor de secretos externo.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| code | TEXT | No | — | — | — | uq_camera_sources_1 |
| name | TEXT | No | — | — | — | — |
| location_description | TEXT | No | — | — | — | — |
| stream_reference | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_camera_sources_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_camera_sources_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_camera_sources`: `PRIMARY KEY (id)`.
- `uq_camera_sources_1`: `UNIQUE (code)`.
- `ck_camera_sources_1`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `camera_sources.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `camera_sources.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## vision_events

Detección sin video pesado; evidencia externa opcional.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| camera_source_id | UUID | No | — | — | camera_sources.id; fk_vision_events_camera_source_id | — |
| event_type | TEXT | No | — | — | — | — |
| confidence | NUMERIC(7,6) | No | — | — | — | — |
| occurred_at | TIMESTAMPTZ | No | — | — | — | — |
| model_reference | TEXT | No | — | — | — | — |
| evidence_uri | TEXT | Sí | — | — | — | — |
| evidence_expires_at | TIMESTAMPTZ | Sí | — | — | — | — |
| metadata | JSONB | No | '{}'::jsonb | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_vision_events`: `PRIMARY KEY (id)`.
- `ck_vision_events_1`: `CHECK (confidence BETWEEN 0 AND 1)`.
- `ck_vision_events_2`: `CHECK (confidence::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_vision_events_1`: `(camera_source_id, occurred_at, id)`.

**Relaciones**

- `vision_events.camera_source_id` → `camera_sources.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## vision_event_reviews

Evaluación humana; decisiones previas se conservan.

Dominio: 13 - AI Vision.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| vision_event_id | UUID | No | — | — | vision_events.id; fk_vision_event_reviews_vision_event_id | — |
| reviewer_user_id | UUID | No | — | — | users.id; fk_vision_event_reviews_reviewer_user_id | — |
| decision | TEXT | No | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| reviewed_at | TIMESTAMPTZ | No | now() | — | — | — |
| supersedes_review_id | UUID | Sí | — | — | vision_event_reviews.id; fk_vision_event_reviews_supersedes_review_id | uq_vision_event_reviews_1 |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_vision_event_reviews`: `PRIMARY KEY (id)`.
- `uq_vision_event_reviews_1`: `UNIQUE (supersedes_review_id)`.
- `ck_vision_event_reviews_1`: `CHECK (decision IN ('CONFIRM', 'REJECT'))`.

**Índices adicionales**

- `ix_vision_event_reviews_1`: `(vision_event_id)`.
- `ix_vision_event_reviews_2`: `(reviewer_user_id)`.

**Relaciones**

- `vision_event_reviews.vision_event_id` → `vision_events.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `vision_event_reviews.reviewer_user_id` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `vision_event_reviews.supersedes_review_id` → `vision_event_reviews.id`: cada fila referencia 0..1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.

**Notas**

Nueva revisión conserva la anterior y puede supersederla una sola vez; ambas deben referir al mismo evento. La decisión humana no modifica confidence de detección.

## audit_logs

Auditoría independiente de la vida de la entidad; snapshots redactados.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_audit_logs_actor_user_id | — |
| action | TEXT | No | — | — | — | — |
| entity_type | TEXT | No | — | — | — | — |
| entity_id | UUID | No | — | — | — | — |
| before_data | JSONB | Sí | — | — | — | — |
| after_data | JSONB | Sí | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| result | TEXT | No | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| actor_label_snapshot | TEXT | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_audit_logs`: `PRIMARY KEY (id)`.
- `ck_audit_logs_1`: `CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED'))`.

**Índices adicionales**

- `ix_audit_logs_1`: `(entity_type, entity_id, created_at, id)`.
- `ix_audit_logs_2`: `(request_id)`.

**Relaciones**

- `audit_logs.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

entity_id no tiene FK: sobrevive a cualquier entidad. actor_user_id RESTRICT mantiene identidad desactivada; actor_label_snapshot conserva presentación cuando sea necesario. Redactar secretos y limitar datos personales en before/after.

## system_settings

Configuración versionada por clave; valor JSON validado por contrato.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| key | TEXT | No | — | — | — | uq_system_settings_1 |
| version_number | INTEGER | No | — | — | — | uq_system_settings_1 |
| value | JSONB | No | — | — | — | — |
| value_schema_version | INTEGER | No | — | — | — | — |
| effective_from | TIMESTAMPTZ | No | — | — | — | — |
| retired_at | TIMESTAMPTZ | Sí | — | — | — | — |
| reason | TEXT | No | — | — | — | — |
| created_by | UUID | No | — | — | users.id; fk_system_settings_created_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_system_settings`: `PRIMARY KEY (id)`.
- `uq_system_settings_1`: `UNIQUE (key, version_number)`.
- `ck_system_settings_1`: `CHECK (version_number > 0 AND value_schema_version > 0)`.
- `ck_system_settings_2`: `CHECK (retired_at IS NULL OR retired_at > effective_from)`.

**Índices adicionales**

- `ux_system_settings_1`: UNIQUE `(key)` WHERE `retired_at IS NULL`.

**Relaciones**

- `system_settings.created_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Configuración no contiene credenciales. Tipos y rangos por key/value_schema_version en contrato versionado. No usar JSON para relaciones comerciales. Una configuración vigente por clave; programación futura requiere retirar/activar atómicamente en effective_from.

## business_hours

Ventanas semanales locales; cruces de medianoche se dividen en dos filas.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| service_type | TEXT | No | — | — | — | — |
| weekday | INTEGER | No | — | — | — | — |
| opens_at | TIME | No | — | — | — | — |
| closes_at | TIME | No | — | — | — | — |
| timezone_name | TEXT | No | — | — | — | — |
| active | BOOLEAN | No | true | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |
| updated_at | TIMESTAMPTZ | No | now() | — | — | — |
| created_by | UUID | Sí | — | — | users.id; fk_business_hours_created_by | — |
| updated_by | UUID | Sí | — | — | users.id; fk_business_hours_updated_by | — |
| row_version | INTEGER | No | 1 | — | — | — |

**Constraints y CHECK**

- `pk_business_hours`: `PRIMARY KEY (id)`.
- `ck_business_hours_1`: `CHECK (weekday BETWEEN 1 AND 7)`.
- `ck_business_hours_2`: `CHECK (closes_at > opens_at)`.
- `ck_business_hours_3`: `CHECK (service_type IN ('RESTAURANT', 'DINE_IN', 'PICKUP', 'DELIVERY', 'ONLINE'))`.
- `ck_business_hours_4`: `CHECK (row_version > 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**

- `business_hours.created_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `business_hours.updated_by` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.

## outbox_events

Evento transaccional para publicación al menos una vez; distinto de auditoría.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| aggregate_type | TEXT | No | — | — | — | — |
| aggregate_id | UUID | No | — | — | — | — |
| aggregate_version | INTEGER | No | — | — | — | — |
| event_type | TEXT | No | — | — | — | — |
| payload | JSONB | No | — | — | — | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| published_at | TIMESTAMPTZ | Sí | — | — | — | — |
| attempt_count | INTEGER | No | 0 | — | — | — |
| next_attempt_at | TIMESTAMPTZ | No | now() | — | — | — |
| claimed_until | TIMESTAMPTZ | Sí | — | — | — | — |
| claimed_by | TEXT | Sí | — | — | — | — |
| last_error | TEXT | Sí | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_outbox_events`: `PRIMARY KEY (id)`.
- `ck_outbox_events_1`: `CHECK (aggregate_version > 0 AND attempt_count >= 0)`.

**Índices adicionales**

- `ix_outbox_events_1`: `(next_attempt_at, occurred_at, id)` WHERE `published_at IS NULL`.

**Relaciones**


**Notas**

Evento y cambio de negocio se insertan en el mismo commit. Publicación con lease, backoff y reintentos; no promete exactly-once. Consumidores deduplican por event id y ordenan por aggregate_version cuando corresponda.

## email_outbox

Correo transaccional en cola; no bloquea el commit de negocio.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| recipient | TEXT | No | — | — | — | — |
| template_code | TEXT | No | — | — | — | — |
| payload | JSONB | No | — | — | — | — |
| status | TEXT | No | 'PENDING' | — | — | — |
| attempt_count | INTEGER | No | 0 | — | — | — |
| next_attempt_at | TIMESTAMPTZ | No | now() | — | — | — |
| sent_at | TIMESTAMPTZ | Sí | — | — | — | — |
| provider_message_id | TEXT | Sí | — | — | — | — |
| last_error | TEXT | Sí | — | — | — | — |
| correlation_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_email_outbox`: `PRIMARY KEY (id)`.
- `ck_email_outbox_1`: `CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD'))`.
- `ck_email_outbox_2`: `CHECK (attempt_count >= 0)`.

**Índices adicionales**

Ninguno; PK/UNIQUE cubren el acceso previsto.

**Relaciones**


**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## idempotency_keys

Reserva durable por principal, operación y clave para mutaciones críticas.

Dominio: 14 - Audit Settings Events.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| principal_scope | TEXT | No | — | — | — | uq_idempotency_keys_1 |
| operation | TEXT | No | — | — | — | uq_idempotency_keys_1 |
| key | TEXT | No | — | — | — | uq_idempotency_keys_1 |
| request_hash | TEXT | No | — | — | — | — |
| status | TEXT | No | 'IN_PROGRESS' | — | — | — |
| resource_type | TEXT | Sí | — | — | — | — |
| resource_id | UUID | Sí | — | — | — | — |
| response_code | INTEGER | Sí | — | — | — | — |
| response_snapshot | JSONB | Sí | — | — | — | — |
| locked_until | TIMESTAMPTZ | No | — | — | — | — |
| expires_at | TIMESTAMPTZ | No | — | — | — | — |
| completed_at | TIMESTAMPTZ | Sí | — | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_idempotency_keys`: `PRIMARY KEY (id)`.
- `uq_idempotency_keys_1`: `UNIQUE (principal_scope, operation, key)`.
- `ck_idempotency_keys_1`: `CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED'))`.
- `ck_idempotency_keys_2`: `CHECK (expires_at > created_at)`.
- `ck_idempotency_keys_3`: `CHECK (response_code IS NULL OR response_code BETWEEN 100 AND 599)`.

**Índices adicionales**

- `ix_idempotency_keys_1`: `(expires_at)`.

**Relaciones**


**Notas**

Tabla justificada por clientes múltiples, reintentos y webhooks. principal_scope se deriva en servidor (usuario/sesión invitada/proveedor), nunca se acepta sin autenticar. Misma clave con request_hash distinto se rechaza; respuesta guardada no contiene secretos. Retención mayor al horizonte de reintento.

## production_batch_status_history

Historial de transiciones con responsable y motivo.

Dominio: 08 - Production.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| production_batch_id | UUID | No | — | — | production_batches.id; fk_production_batch_status_history_production_batch_id | — |
| from_status | TEXT | Sí | — | — | — | — |
| to_status | TEXT | No | — | — | — | — |
| reason | TEXT | Sí | — | — | — | — |
| actor_user_id | UUID | Sí | — | — | users.id; fk_production_batch_status_history_actor_user_id | — |
| occurred_at | TIMESTAMPTZ | No | now() | — | — | — |
| request_id | UUID | Sí | — | — | — | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_production_batch_status_history`: `PRIMARY KEY (id)`.
- `ck_production_batch_status_history_1`: `CHECK (to_status IN ('SUGGESTED', 'PENDING', 'IN_PROGRESS', 'AVAILABLE', 'DISCARDED', 'CANCELLED'))`.

**Índices adicionales**

- `ix_production_batch_status_history_1`: `(production_batch_id)`.

**Relaciones**

- `production_batch_status_history.production_batch_id` → `production_batches.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `production_batch_status_history.actor_user_id` → `users.id`: cada fila referencia 0..1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.

## payment_receipts

Comprobante no fiscal inmutable de cobro; distinto de factura y recepción de mercadería.

Dominio: 12 - Billing Payments Cash.

| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |
|---|---|---|---|---|---|---|
| id | UUID | No | gen_random_uuid() | Sí | — | — |
| payment_id | UUID | No | — | — | payments.id; fk_payment_receipts_payment_id | uq_payment_receipts_1 |
| receipt_number | TEXT | No | — | — | — | uq_payment_receipts_2 |
| issued_at | TIMESTAMPTZ | No | — | — | — | — |
| amount_snapshot | NUMERIC(14,2) | No | — | — | — | — |
| currency_id | UUID | No | — | — | currencies.id; fk_payment_receipts_currency_id | — |
| payer_name_snapshot | TEXT | Sí | — | — | — | — |
| document_uri | TEXT | Sí | — | — | — | — |
| issued_by | UUID | No | — | — | users.id; fk_payment_receipts_issued_by | — |
| created_at | TIMESTAMPTZ | No | now() | — | — | — |

**Constraints y CHECK**

- `pk_payment_receipts`: `PRIMARY KEY (id)`.
- `uq_payment_receipts_1`: `UNIQUE (payment_id)`.
- `uq_payment_receipts_2`: `UNIQUE (receipt_number)`.
- `ck_payment_receipts_1`: `CHECK (amount_snapshot > 0)`.
- `ck_payment_receipts_2`: `CHECK (amount_snapshot::text NOT IN ('NaN', 'Infinity', '-Infinity'))`.

**Índices adicionales**

- `ix_payment_receipts_1`: `(currency_id)`.
- `ix_payment_receipts_2`: `(issued_by)`.

**Relaciones**

- `payment_receipts.payment_id` → `payments.id`: cada fila referencia 1 padre; cada padre tiene 0..1 filas. Borrado/actualización: RESTRICT.
- `payment_receipts.currency_id` → `currencies.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.
- `payment_receipts.issued_by` → `users.id`: cada fila referencia 1 padre; cada padre tiene 0..N filas. Borrado/actualización: RESTRICT.

**Notas**

Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.
