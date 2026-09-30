-- Run only against a disposable database after V1 and V2.
BEGIN;
SET search_path = wok, public;

DO $test$
DECLARE
  test_user UUID;
  test_session UUID;
  first_token UUID;
BEGIN
  INSERT INTO users (email, display_name, status)
  VALUES ('db-review@example.invalid', 'DB Review', 'ACTIVE')
  RETURNING id INTO test_user;

  INSERT INTO auth_identities (user_id, provider, provider_subject)
  VALUES (test_user, 'GOOGLE', 'subject-one');
  BEGIN
    INSERT INTO auth_identities (user_id, provider, provider_subject)
    VALUES (test_user, 'GOOGLE', 'subject-one');
    RAISE EXCEPTION 'duplicate provider subject was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO auth_sessions (user_id, client_type, expires_at)
  VALUES (test_user, 'WEB', now() + interval '1 day')
  RETURNING id INTO test_session;
  INSERT INTO refresh_tokens (session_id, token_hash, expires_at)
  VALUES (test_session, repeat('a', 64), now() + interval '1 day')
  RETURNING id INTO first_token;
  INSERT INTO refresh_tokens (session_id, token_hash, parent_token_id, expires_at)
  VALUES (test_session, repeat('b', 64), first_token, now() + interval '1 day');
  BEGIN
    INSERT INTO refresh_tokens (session_id, token_hash, parent_token_id, expires_at)
    VALUES (test_session, repeat('c', 64), first_token, now() + interval '1 day');
    RAISE EXCEPTION 'refresh token fork was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO service_capabilities (code, status)
    VALUES ('PICKUP', 'AUTO_ACCEPT');
    RAISE EXCEPTION 'invalid capability state was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO email_outbox (recipient, template_code, payload)
  VALUES ('db-review@example.invalid', 'VERIFY_ACCOUNT', '{}'::jsonb);

  IF (SELECT count(*) FROM roles) <> 3 OR (SELECT count(*) FROM service_capabilities) <> 9 THEN
    RAISE EXCEPTION 'reference seeds are incomplete';
  END IF;
END
$test$;
ROLLBACK;
