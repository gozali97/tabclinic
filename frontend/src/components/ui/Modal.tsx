import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const widths = { sm: 'max-w-[300px]', md: 'max-w-[500px]', lg: 'max-w-[800px]' };

// AdminMart .modal: native <dialog> gives focus trap, Esc and backdrop for free.
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-auto w-[calc(100%-1rem)] rounded-[2px] border border-black/20 bg-white p-0 text-body backdrop:bg-black/50', widths[size])}
    >
      <div className="flex items-start justify-between border-b border-line p-4">
        <h4 id={titleId} className="mb-0 text-lg font-medium text-heading">
          {title}
        </h4>
        <button type="button" onClick={onClose} aria-label="Tutup" className="-m-4 cursor-pointer p-4 text-black opacity-50 hover:opacity-75">
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="p-4">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-line p-4">{footer}</div>}
    </dialog>
  );
}
