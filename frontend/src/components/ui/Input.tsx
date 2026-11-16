import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';

// AdminMart .form-control: 1px #e9ecef border, 2px radius, #4F5467 text.
export const controlClass =
  'block w-full rounded-[2px] border border-line-input bg-white px-3 py-1.5 text-base leading-normal text-input ' +
  'placeholder:text-muted transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none ' +
  'disabled:bg-light aria-[invalid=true]:border-danger';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  id: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, id, className, children }: FieldProps) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="mb-2 inline-block text-dark">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <small className="mt-1 block text-sm text-muted">{hint}</small>}
      {error && (
        <small id={`${id}-error`} role="alert" className="mt-1 block text-sm text-danger">
          {error}
        </small>
      )}
    </div>
  );
}

type Common = { label?: ReactNode; hint?: ReactNode; error?: string; containerClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(
  ({ label, hint, error, id, className, containerClassName, ...props }, ref) => {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} id={fid} className={containerClassName}>
        <input
          ref={ref}
          id={fid}
          className={cx(controlClass, 'h-[calc(1.5em+0.75rem+2px)]', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-error` : undefined}
          {...props}
        />
      </Field>
    );
  },
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Common>(
  ({ label, hint, error, id, className, containerClassName, children, ...props }, ref) => {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} id={fid} className={containerClassName}>
        <select
          ref={ref}
          id={fid}
          className={cx(
            controlClass,
            'h-[calc(1.5em+0.75rem+2px)] appearance-none bg-[url(/img/custom-select.png)] bg-[length:8px_10px] bg-[right_0.75rem_center] bg-no-repeat pr-7',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {children}
        </select>
      </Field>
    );
  },
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(
  ({ label, hint, error, id, className, containerClassName, rows = 3, ...props }, ref) => {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <Field label={label} hint={hint} error={error} id={fid} className={containerClassName}>
        <textarea ref={ref} id={fid} rows={rows} className={cx(controlClass, className)} aria-invalid={error ? true : undefined} {...props} />
      </Field>
    );
  },
);
Textarea.displayName = 'Textarea';

// AdminMart header pill input (.customize-input .custom-shadow .custom-radius).
export const PillInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  ({ className, icon, ...props }, ref) => (
    <div className="relative">
      <input
        ref={ref}
        className={cx('w-full rounded-[60px] border border-line-input bg-white py-[11px] pr-[43px] pl-5 leading-[13px] text-input placeholder:text-muted focus:border-primary focus:outline-none', className)}
        {...props}
      />
      {icon && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted">{icon}</span>}
    </div>
  ),
);
PillInput.displayName = 'PillInput';
