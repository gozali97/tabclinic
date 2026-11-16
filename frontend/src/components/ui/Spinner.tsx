import { cx } from './cx';

export function Spinner({ className, label = 'Memuat' }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]', className)}
    />
  );
}
