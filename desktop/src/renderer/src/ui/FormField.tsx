import { useId, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import styles from './ui.module.css';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
};

export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  autoComplete,
}: Props<T>) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const errorId = `${id}-error`;
  const toggleId = `${id}-toggle`;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);
  const effectiveType = isPassword ? (visible ? 'text' : 'password') : type;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={isPassword ? styles.inputWrap : undefined}>
        <input
          id={id}
          className={styles.input}
          type={effectiveType}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-invalid={fieldState.error ? true : undefined}
          aria-describedby={fieldState.error ? errorId : undefined}
          {...field}
          value={field.value ?? ''}
        />
        {isPassword ? (
          <button
            id={toggleId}
            type="button"
            className={styles.eyeBtn}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
            tabIndex={0}
          >
            {visible ? (
              // Ojo tachado — contraseña visible
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              // Ojo abierto — contraseña oculta
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {fieldState.error ? (
        <span id={errorId} className={styles.fieldError}>
          {fieldState.error.message}
        </span>
      ) : null}
    </div>
  );
}
