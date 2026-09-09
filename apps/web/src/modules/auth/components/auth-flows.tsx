"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { FormField } from "@/shared/components/ui/form-field";

function AuthCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="auth-card">
      <header className="auth-card__header">
        <Link className="brand" href="/">
          <span>WOK</span> ASIAN FOOD
        </Link>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function MockForm({
  children,
  submitLabel,
}: {
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [done, setDone] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    setDone(true);
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {children}
      {done ? (
        <p className="form-feedback" role="status">
          Flujo simulado completado. No se enviaron datos.
        </p>
      ) : null}
      <Button fullWidth type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

export function LoginForm() {
  return (
    <AuthCard
      title="Iniciar sesion"
      description="Accede a tu cuenta para continuar."
    >
      <MockForm submitLabel="INICIAR SESION">
        <FormField
          autoComplete="username"
          id="login-identity"
          label="Correo electronico o telefono"
          required
        />
        <FormField
          autoComplete="current-password"
          id="login-password"
          label="Contrasena"
          required
          type="password"
        />
      </MockForm>
      <div className="auth-links">
        <Link href="/forgot-password">Olvide mi contrasena</Link>
        <Link href="/register">Crear cuenta</Link>
      </div>
    </AuthCard>
  );
}
export function RegisterForm() {
  return (
    <AuthCard
      title="Crear cuenta"
      description="El registro publico crea un perfil de cliente."
    >
      <MockForm submitLabel="CREAR CUENTA">
        <FormField
          autoComplete="name"
          id="register-name"
          label="Nombre"
          required
        />
        <FormField
          autoComplete="email"
          id="register-email"
          label="Correo electronico"
          required
          type="email"
        />
        <FormField
          autoComplete="new-password"
          help="La politica definitiva sera configurada por el backend."
          id="register-password"
          label="Contrasena"
          required
          type="password"
        />
      </MockForm>
      <div className="auth-links">
        <Link href="/login">
          <ArrowLeft size={15} aria-hidden="true" /> Volver al acceso
        </Link>
      </div>
    </AuthCard>
  );
}
export function VerificationPinForm() {
  return (
    <AuthCard
      title="Verificar correo"
      description="Ingresa el PIN recibido para continuar."
    >
      <MockForm submitLabel="VERIFICAR">
        <FormField
          autoComplete="one-time-code"
          id="verification-pin"
          inputMode="numeric"
          label="PIN de verificacion"
          maxLength={6}
          pattern="[0-9]*"
          required
        />
      </MockForm>
    </AuthCard>
  );
}
export function ForgotPasswordForm() {
  return (
    <AuthCard
      title="Recuperar acceso"
      description="Te mostraremos el mismo resultado aunque la cuenta no exista."
    >
      <MockForm submitLabel="CONTINUAR">
        <FormField
          autoComplete="email"
          id="recovery-email"
          label="Correo electronico"
          required
          type="email"
        />
      </MockForm>
      <div className="auth-links">
        <Link href="/login">Volver al acceso</Link>
      </div>
    </AuthCard>
  );
}
export function ResetPasswordForm() {
  return (
    <AuthCard
      title="Nueva contrasena"
      description="Completa el desafio de recuperacion."
    >
      <MockForm submitLabel="RESTABLECER">
        <FormField
          autoComplete="one-time-code"
          id="reset-code"
          label="Codigo de recuperacion"
          required
        />
        <FormField
          autoComplete="new-password"
          id="reset-password"
          label="Nueva contrasena"
          required
          type="password"
        />
      </MockForm>
    </AuthCard>
  );
}
export function ChangePasswordForm() {
  return (
    <AuthCard
      title="Cambiar contrasena"
      description="Actualiza el acceso de tu perfil."
    >
      <MockForm submitLabel="GUARDAR CAMBIO">
        <FormField
          autoComplete="current-password"
          id="current-password"
          label="Contrasena actual"
          required
          type="password"
        />
        <FormField
          autoComplete="new-password"
          id="new-password"
          label="Nueva contrasena"
          required
          type="password"
        />
      </MockForm>
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
      description="El estado se simula solo para validar la interfaz."
    >
      <CheckCircle2 aria-hidden="true" size={30} />
      <Link className="button button--primary" href="/login">
        CONTINUAR
      </Link>
    </AuthCard>
  );
}
