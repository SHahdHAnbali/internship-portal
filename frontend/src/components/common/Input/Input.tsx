import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

function Input({
  label,
  error,
  helperText,
  id,
  ...props
}: InputProps) {
  return (
    <div className="input-wrapper">
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
        </label>
      )}

      <input
        id={id}
        className={`input-field ${error ? 'input-error' : ''}`}
        {...props}
      />

      {error && <p className="input-error-message">{error}</p>}

      {!error && helperText && (
        <p className="input-helper-text">{helperText}</p>
      )}
    </div>
  );
}

export default Input;