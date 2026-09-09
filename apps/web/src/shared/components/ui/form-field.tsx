import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  help?: string;
};

export function FormField({ help, id, label, ...props }: FormFieldProps) {
  const helpId = help && id ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={helpId} {...props} />
      {help ? (
        <span className="field__help" id={helpId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
