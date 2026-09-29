import { useId } from 'react';
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
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type={type}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? errorId : undefined}
        {...field}
        value={field.value ?? ''}
      />
      {fieldState.error ? (
        <span id={errorId} className={styles.fieldError}>
          {fieldState.error.message}
        </span>
      ) : null}
    </div>
  );
}
