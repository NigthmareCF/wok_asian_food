import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  label: string;
  help?: string;
};

export function FormField({
  error,
  help,
  id,
  label,
  ...props
}: FormFieldProps) {
  const helpId = id && (help || error) ? `${id}-help` : undefined;
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        id={id}
        {...props}
      />
      {error ? (
        <span className="field__error" id={helpId} role="alert">
          {error}
        </span>
      ) : help ? (
        <span className="field__help" id={helpId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
