"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import type { LoginResult } from "@/modules/auth/auth-types";
import { replacePage } from "@/modules/auth/auth-navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  KeyRound,
  UserRound,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";

function AuthCard({
  children,
  description,
  isLogin = false,
  isDemo = false,
  title,
}: {
  children: React.ReactNode;
  description: string;
  isLogin?: boolean;
  isDemo?: boolean;
  title: string;
}) {
  return (
    <section className={`auth-card${isLogin ? " auth-card--login" : ""}`}>
      <header className="auth-card__header">
        {isLogin ? (
          <Link
            aria-label="WOK Asian Food, inicio"
            className="auth-logo"
            href="/"
          >
            <Image
              alt="WOK Asian Food"
              fill
              priority
              sizes="(max-width: 480px) 280px, 344px"
              src="/logo-wok-asian-food.jpg"
            />
          </Link>
        ) : (
          <Link className="brand" href="/">
            <span>WOK</span> ASIAN FOOD
          </Link>
        )}
        <h1>{title}</h1>
        <p>{description}</p>
        {isDemo ? (
          <p>
            Demostración local: este flujo todavía no modifica cuentas reales.
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type AccessMethod = "email" | "phone";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 4
    ? `${digits.slice(0, 4)}-${digits.slice(4)}`
    : digits;
}

function isContactValid(method: AccessMethod, value: string) {
  return method === "email"
    ? /^\S+@\S+\.\S+$/.test(value)
    : value.replace(/\D/g, "").length === 8;
}

const passwordHelp =
  "Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.";

function getPasswordError(value: string) {
  if (value.length < 12) {
    return "La contraseña debe tener al menos 12 caracteres.";
  }
  if (value.length > 128) {
    return "La contraseña no puede superar 128 caracteres.";
  }
  if (!/[A-Z]/.test(value)) {
    return "Incluye al menos una letra mayúscula.";
  }
  if (!/[a-z]/.test(value)) {
    return "Incluye al menos una letra minúscula.";
  }
  if (!/\d/.test(value)) {
    return "Incluye al menos un número.";
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return "Incluye al menos un símbolo.";
  }
  return undefined;
}

function getPasswordConfirmationError(password: string, confirmation: string) {
  return password !== confirmation
    ? "Las contraseñas no coinciden."
    : undefined;
}

function ContactMethodField({
  allowPhone = true,
  error,
  method,
  onMethodChange,
  onValueChange,
  value,
}: {
  allowPhone?: boolean;
  error?: string;
  method: AccessMethod;
  onMethodChange: (method: AccessMethod) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className={`contact-field contact-field--${method}`}>
      {method === "phone" ? (
        <FormField
          autoComplete="tel-national"
          error={error}
          id="auth-phone"
          inputMode="numeric"
          label="Teléfono"
          onChange={(event) => onValueChange(formatPhone(event.target.value))}
          placeholder="0000-0000"
          required
          type="tel"
          value={value}
        />
      ) : (
        <FormField
          autoComplete="email"
          error={error}
          id="auth-email"
          label="Correo electrónico"
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="ejemplo@gmail.com"
          required
          type="email"
          value={value}
        />
      )}
      {allowPhone ? (
        <div
          className="contact-field__controls"
          role="group"
          aria-label="Método de acceso"
        >
          <button
            aria-label="Usar correo electrónico"
            aria-pressed={method === "email"}
            onClick={() => onMethodChange("email")}
            title="Correo electrónico"
            type="button"
          >
            <Mail aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="Usar teléfono"
            aria-pressed={method === "phone"}
            onClick={() => onMethodChange("phone")}
            title="Teléfono"
            type="button"
          >
            <Phone aria-hidden="true" size={18} />
          </button>
        </div>
      ) : null}
      {method === "phone" ? (
        <span className="contact-field__prefix">+502</span>
      ) : null}
    </div>
  );
}

async function submitAuthFlow(action: string, fields: Record<string, string>) {
  const response = await fetch("/bff/auth/flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...fields }),
  });
  const result = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!response.ok)
    throw new Error(
      result?.message ?? "No fue posible completar la solicitud.",
    );
  return result?.message ?? "Solicitud recibida.";
}

export function LoginForm() {
  const [accessMethod, setAccessMethod] = useState<AccessMethod>("email");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const isIdentityValid = isContactValid(accessMethod, identity);
  const identityError =
    submitted && !isIdentityValid
      ? accessMethod === "email"
        ? "Ingresa un correo electrónico válido."
        : "Ingresa los 8 dígitos de tu teléfono."
      : undefined;
  const passwordError =
    submitted && !password ? "Ingresa tu contraseña." : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (!isIdentityValid || !password) return;

    if (accessMethod === "phone") {
      setServerError(
        "El acceso por teléfono aún no está disponible. Usa tu correo electrónico.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/bff/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: identity,
          password,
          rememberSession,
          next: new URLSearchParams(window.location.search).get("next"),
        }),
      });
      const result = (await response.json()) as LoginResult & {
        message?: string;
      };
      if (!response.ok) {
        setServerError(result.message ?? "No fue posible iniciar sesión.");
        return;
      }
      replacePage(result.redirectTo);
    } catch {
      setServerError("No se pudo conectar con el servicio de acceso.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectAccessMethod(method: AccessMethod) {
    setAccessMethod(method);
    setIdentity("");
    setSubmitted(false);
  }

  return (
    <div className="login-page">
      <AuthCard
        description="Accede para consultar el menú y gestionar tu experiencia."
        isLogin
        title="Iniciar sesión"
      >
        <form className="form-stack" noValidate onSubmit={submit}>
          <ContactMethodField
            error={identityError}
            method={accessMethod}
            onMethodChange={selectAccessMethod}
            onValueChange={setIdentity}
            value={identity}
          />
          <div className="password-field login-field">
            <LockKeyhole aria-hidden="true" size={18} />
            <FormField
              autoComplete="current-password"
              error={passwordError}
              id="login-password"
              label="Contraseña"
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              className="password-field__toggle"
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" size={18} />
              ) : (
                <Eye aria-hidden="true" size={18} />
              )}
            </button>
          </div>
          <div className="auth-options">
            <label className="auth-checkbox">
              <input
                checked={rememberSession}
                onChange={(event) => setRememberSession(event.target.checked)}
                type="checkbox"
              />
              <span>Recordar sesión</span>
            </label>
            <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </div>
          {serverError ? (
            <p className="form-feedback form-feedback--error" role="alert">
              {serverError}
            </p>
          ) : null}
          <Button disabled={isSubmitting} fullWidth type="submit">
            {isSubmitting ? "INGRESANDO..." : "INICIAR SESIÓN"}
          </Button>
          <Link
            className="button button--secondary button--full"
            href="/register"
          >
            CREAR CUENTA
          </Link>
        </form>
        <p className="auth-legal">
          Términos de Servicio y Política de Privacidad pendientes de
          publicación.
        </p>
      </AuthCard>
    </div>
  );
}

export function RegisterForm() {
  const [name, setName] = useState("");
  const [accessMethod, setAccessMethod] = useState<AccessMethod>("email");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const nameError =
    submitted && name.trim().length < 2
      ? "Ingresa un nombre de al menos 2 caracteres."
      : undefined;
  const contactError =
    submitted && !isContactValid(accessMethod, contact)
      ? accessMethod === "email"
        ? "Ingresa un correo electrónico válido."
        : "Ingresa los 8 dígitos de tu teléfono."
      : undefined;
  const passwordError = submitted ? getPasswordError(password) : undefined;
  const passwordConfirmationError = submitted
    ? getPasswordConfirmationError(password, passwordConfirmation)
    : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (
      name.trim().length < 2 ||
      !isContactValid(accessMethod, contact) ||
      getPasswordError(password) ||
      getPasswordConfirmationError(password, passwordConfirmation)
    )
      return;
    setIsSubmitting(true);
    try {
      await submitAuthFlow("register", {
        email: contact.trim(),
        displayName: name.trim(),
        password,
      });
      setPassword("");
      setPasswordConfirmation("");
      setDone(true);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el servicio de acceso.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectAccessMethod(method: AccessMethod) {
    setAccessMethod(method);
    setContact("");
    setSubmitted(false);
  }

  return (
    <AuthCard
      title="Crear cuenta"
      description="Crea tu cuenta para continuar."
      isLogin
    >
      {done ? (
        <div className="form-stack">
          <p className="form-feedback" role="status">
            Si la cuenta puede registrarse, recibirás un código de verificación
            por correo.
          </p>
          <Link
            className="button button--primary button--full"
            href="/verify-email"
          >
            VERIFICAR CORREO
          </Link>
        </div>
      ) : (
        <form className="form-stack" noValidate onSubmit={submit}>
          <div className="login-field auth-input-with-icon">
            <UserRound aria-hidden="true" size={18} />
            <FormField
              autoComplete="name"
              error={nameError}
              id="register-name"
              label="Nombre"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <ContactMethodField
            allowPhone={false}
            error={contactError}
            method={accessMethod}
            onMethodChange={selectAccessMethod}
            onValueChange={setContact}
            value={contact}
          />
          <div className="login-field auth-input-with-icon">
            <LockKeyhole aria-hidden="true" size={18} />
            <FormField
              autoComplete="new-password"
              error={passwordError}
              help={passwordHelp}
              id="register-password"
              label="Contraseña"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          <div className="login-field auth-input-with-icon">
            <LockKeyhole aria-hidden="true" size={18} />
            <FormField
              autoComplete="new-password"
              error={passwordConfirmationError}
              id="register-password-confirmation"
              label="Confirmar contraseña"
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              type="password"
              value={passwordConfirmation}
            />
          </div>
          {serverError ? (
            <p className="form-feedback form-feedback--error" role="alert">
              {serverError}
            </p>
          ) : null}
          <Button disabled={isSubmitting} fullWidth type="submit">
            {isSubmitting ? "CREANDO..." : "CREAR CUENTA"}
          </Button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/login">¿Ya tienes una cuenta? Iniciar sesión</Link>
      </div>
    </AuthCard>
  );
}
export function VerificationPinForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFeedback(undefined);
    if (!isContactValid("email", email) || !/^\d{6}$/.test(code)) return;
    setIsSubmitting(true);
    try {
      await submitAuthFlow("verify", { email: email.trim(), code });
      setDone(true);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo verificar el correo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resend() {
    setFeedback(undefined);
    setSubmitted(true);
    if (!isContactValid("email", email)) return;
    setIsSubmitting(true);
    try {
      setFeedback(await submitAuthFlow("resend", { email: email.trim() }));
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo reenviar el código.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Verificar correo"
      description="Ingresa el correo y el código que recibiste."
      isLogin
    >
      {done ? (
        <div className="form-stack">
          <p className="form-feedback" role="status">
            Cuenta verificada. Ya puedes iniciar sesión.
          </p>
          <Link className="button button--primary button--full" href="/login">
            INICIAR SESIÓN
          </Link>
        </div>
      ) : (
        <form className="form-stack" noValidate onSubmit={submit}>
          <FormField
            autoComplete="email"
            error={
              submitted && !isContactValid("email", email)
                ? "Ingresa un correo electrónico válido."
                : undefined
            }
            id="verification-email"
            label="Correo electrónico"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <div className="login-field auth-input-with-icon">
            <KeyRound aria-hidden="true" size={18} />
            <FormField
              autoComplete="one-time-code"
              id="verification-pin"
              inputMode="numeric"
              label="PIN de verificación"
              maxLength={6}
              error={
                submitted && !/^\d{6}$/.test(code)
                  ? "Ingresa los 6 dígitos del código."
                  : undefined
              }
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              pattern="[0-9]*"
              required
              value={code}
            />
          </div>
          {feedback ? (
            <p className="form-feedback" role="status">
              {feedback}
            </p>
          ) : null}
          <Button disabled={isSubmitting} fullWidth type="submit">
            {isSubmitting ? "VERIFICANDO..." : "VERIFICAR"}
          </Button>
          <button
            className="button button--secondary button--full"
            disabled={isSubmitting}
            onClick={resend}
            type="button"
          >
            Reenviar código
          </button>
        </form>
      )}
    </AuthCard>
  );
}
export function ForgotPasswordForm() {
  const [accessMethod, setAccessMethod] = useState<AccessMethod>("email");
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const contactError =
    submitted && !isContactValid(accessMethod, contact)
      ? accessMethod === "email"
        ? "Ingresa un correo electrónico válido."
        : "Ingresa los 8 dígitos de tu teléfono."
      : undefined;

  function selectAccessMethod(method: AccessMethod) {
    setAccessMethod(method);
    setContact("");
    setSubmitted(false);
    setDone(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (!isContactValid(accessMethod, contact)) return;
    setIsSubmitting(true);
    try {
      await submitAuthFlow("requestReset", { email: contact.trim() });
      setDone(true);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "No se pudo solicitar la recuperación.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Recuperar contraseña"
      description="Solicita un código de recuperación por correo."
      isLogin
    >
      <form className="form-stack" noValidate onSubmit={submit}>
        <ContactMethodField
          allowPhone={false}
          error={contactError}
          method={accessMethod}
          onMethodChange={selectAccessMethod}
          onValueChange={setContact}
          value={contact}
        />
        {done ? (
          <p className="form-feedback" role="status">
            Si la cuenta existe, recibirás un código de recuperación por correo.
          </p>
        ) : null}
        {serverError ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {serverError}
          </p>
        ) : null}
        <Button disabled={isSubmitting || done} fullWidth type="submit">
          {isSubmitting ? "ENVIANDO..." : "CONTINUAR"}
        </Button>
      </form>
      <div className="auth-links">
        {done ? <Link href="/reset-password">Ingresar código</Link> : null}
        <Link href="/login">Volver al acceso</Link>
      </div>
    </AuthCard>
  );
}
export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const emailError =
    submitted && !isContactValid("email", email)
      ? "Ingresa un correo electrónico válido."
      : undefined;
  const recoveryCodeError =
    submitted && !/^\d{6}$/.test(recoveryCode)
      ? "Ingresa el código de recuperación de 6 dígitos."
      : undefined;
  const passwordError = submitted ? getPasswordError(password) : undefined;
  const passwordConfirmationError = submitted
    ? getPasswordConfirmationError(password, passwordConfirmation)
    : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(undefined);
    if (
      !isContactValid("email", email) ||
      !/^\d{6}$/.test(recoveryCode) ||
      getPasswordError(password) ||
      getPasswordConfirmationError(password, passwordConfirmation)
    )
      return;
    setIsSubmitting(true);
    try {
      await submitAuthFlow("completeReset", {
        email: email.trim(),
        code: recoveryCode,
        newPassword: password,
      });
      setDone(true);
      setPassword("");
      setPasswordConfirmation("");
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Nueva contraseña"
      description="Ingresa tu correo, el código recibido y una nueva contraseña."
    >
      <form className="form-stack" noValidate onSubmit={submit}>
        <FormField
          autoComplete="email"
          error={emailError}
          id="reset-email"
          label="Correo electrónico"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <FormField
          autoComplete="one-time-code"
          error={recoveryCodeError}
          id="reset-code"
          inputMode="numeric"
          label="Código de recuperación"
          maxLength={6}
          onChange={(event) =>
            setRecoveryCode(event.target.value.replace(/\D/g, ""))
          }
          pattern="[0-9]*"
          required
          value={recoveryCode}
        />
        <FormField
          autoComplete="new-password"
          error={passwordError}
          help={passwordHelp}
          id="reset-password"
          label="Nueva contraseña"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <FormField
          autoComplete="new-password"
          error={passwordConfirmationError}
          id="reset-password-confirmation"
          label="Confirmar contraseña"
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          required
          type="password"
          value={passwordConfirmation}
        />
        {done ? (
          <p className="form-feedback" role="status">
            Contraseña actualizada. Inicia sesión con tu nueva contraseña.
          </p>
        ) : null}
        {serverError ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {serverError}
          </p>
        ) : null}
        <Button disabled={isSubmitting || done} fullWidth type="submit">
          {isSubmitting ? "RESTABLECIENDO..." : "RESTABLECER"}
        </Button>
      </form>
      {done ? (
        <div className="auth-links">
          <Link href="/login">Ir a iniciar sesión</Link>
        </div>
      ) : null}
    </AuthCard>
  );
}
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);
  const currentPasswordError =
    submitted && !currentPassword ? "Ingresa tu contraseña actual." : undefined;
  const newPasswordError = submitted
    ? getPasswordError(newPassword)
    : undefined;
  const passwordConfirmationError = submitted
    ? getPasswordConfirmationError(newPassword, passwordConfirmation)
    : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (
      !currentPassword ||
      getPasswordError(newPassword) ||
      getPasswordConfirmationError(newPassword, passwordConfirmation)
    )
      return;
    setDone(true);
  }

  return (
    <AuthCard
      title="Cambiar contraseña"
      description="Actualiza el acceso de tu perfil."
      isDemo
    >
      <form className="form-stack" noValidate onSubmit={submit}>
        <FormField
          autoComplete="current-password"
          error={currentPasswordError}
          id="current-password"
          label="Contraseña actual"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
        <FormField
          autoComplete="new-password"
          error={newPasswordError}
          help={passwordHelp}
          id="new-password"
          label="Nueva contraseña"
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
        <FormField
          autoComplete="new-password"
          error={passwordConfirmationError}
          id="new-password-confirmation"
          label="Confirmar contraseña"
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          required
          type="password"
          value={passwordConfirmation}
        />
        {done ? (
          <p className="form-feedback" role="status">
            Demostración completada. La contraseña no se modificó porque aún no
            existe conexión con el backend.
          </p>
        ) : null}
        <Button fullWidth type="submit">
          GUARDAR CAMBIO
        </Button>
      </form>
    </AuthCard>
  );
}
export function AccountLockedCard() {
  return (
    <AuthCard
      title="Cuenta temporalmente bloqueada"
      description="Los intentos y la duracion dependen de la politica de seguridad."
    >
      <LockKeyhole aria-hidden="true" size={30} />
      <p className="form-feedback">
        Usa la recuperacion permitida para volver a ingresar.
      </p>
      <Link className="button button--primary" href="/forgot-password">
        RECUPERAR ACCESO
      </Link>
    </AuthCard>
  );
}
export function VerifiedCard() {
  return (
    <AuthCard
      title="Correo verificado"
      description="Ya puedes ingresar a tu cuenta."
    >
      <CheckCircle2 aria-hidden="true" size={30} />
      <Link className="button button--primary" href="/login">
        CONTINUAR
      </Link>
    </AuthCard>
  );
}
