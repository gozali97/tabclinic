import { type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

// AdminMart .alert-* (tinted bg, darker text).
const tones = {
  primary: 'bg-[#e7eef8] border-[#b9cde9] text-[#173c6e]',
  success: 'bg-[#e6f4ea] border-[#b7dfc3] text-[#14532d]',
  danger: 'bg-[#fbeaea] border-[#f0c2c2] text-[#7f1d1d]',
  warning: 'bg-[#fef5e2] border-[#f6dca6] text-[#78470a]',
  info: 'bg-[#e4f1f8] border-[#b3d6ea] text-[#0c4a6e]',
} as const;

interface AlertProps {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ tone = 'primary', title, children, onClose, className }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('relative rounded-[2px] border px-5 py-3', onClose && 'pr-12', tones[tone], className)}
    >
      {title && <h4 className="mb-1 text-lg font-medium text-inherit">{title}</h4>}
      {children}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Tutup" className="absolute top-0 right-0 cursor-pointer px-4 py-3 opacity-50 hover:opacity-75">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
