import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';

interface DropdownProps {
  trigger: ReactNode;
  label: string;
  align?: 'left' | 'right';
  children: ReactNode;
  className?: string;
  /** AdminMart topbar dropdowns have a small arrow notch. */
  arrow?: boolean;
}

// AdminMart .dropdown-menu: no border, 1px 1px 15px shadow.
export function Dropdown({ trigger, label, align = 'right', children, className, arrow }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center">
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cx('absolute top-full z-50 mt-0.5 min-w-40 rounded-[2px] bg-white py-2 text-body shadow-dropdown', align === 'right' ? 'right-0' : 'left-0', className)}
        >
          {arrow && (
            <span className={cx('absolute -top-2.5 h-2.5 w-10 overflow-hidden', align === 'right' ? 'right-0' : 'left-0')}>
              <span className={cx('absolute top-[3px] size-[15px] rotate-45 rounded-tl-md bg-white', align === 'right' ? 'right-5' : 'left-[15px]')} />
            </span>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cx('flex w-full cursor-pointer items-center gap-2 px-4 py-[0.65rem] text-left whitespace-nowrap text-secondary hover:bg-page hover:text-heading', className)}>
      {children}
    </button>
  );
}

export const DropdownDivider = () => <div className="my-2 h-px bg-light" />;
