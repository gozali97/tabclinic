import { type ReactNode } from 'react';
import { cx } from './cx';

interface Tab<T extends string> {
  value: T;
  label: ReactNode;
  badge?: ReactNode;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'bordered' | 'pills';
  className?: string;
}

// AdminMart .nav-tabs.nav-bordered (underline) and .nav-pills.
export function Tabs<T extends string>({ tabs, value, onChange, variant = 'bordered', className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cx('flex flex-wrap', variant === 'bordered' ? 'border-b-2 border-secondary/20' : 'gap-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx(
              'inline-flex cursor-pointer items-center gap-2 px-5 py-2.5 transition-colors duration-150',
              variant === 'bordered'
                ? cx('-mb-0.5 border-b-2', active ? 'border-primary text-primary' : 'border-transparent text-body hover:text-primary')
                : cx('rounded-[2px]', active ? 'bg-primary text-white' : 'text-body hover:text-primary'),
            )}
          >
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}
