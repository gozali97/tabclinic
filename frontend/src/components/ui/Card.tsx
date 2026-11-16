import { type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
}

// AdminMart .card: borderless, soft shadow.
export function Card({ className, padding: _padding, ...props }: CardProps) {
  return <div className={cx('relative flex min-w-0 flex-col rounded-[0.375rem] border border-line bg-white break-words shadow-card', className)} {...props} />;
}

interface CardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

// AdminMart card heading row: h4.card-title + ml-auto actions.
export function CardHeader({ title, subtitle, actions, children, className }: CardHeaderProps) {
  return (
    <div className={cx('flex flex-wrap items-start gap-3 px-[25px] pt-[25px]', className)}>
      <div className="min-w-0 flex-1 [&_h4]:mb-0 [&_h4]:text-lg [&_h4]:font-medium [&_h4]:text-heading">
        {title && <h4>{title}</h4>}
        {subtitle && <h6 className="mt-1 mb-0 font-light text-muted">{subtitle}</h6>}
        {children}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('flex-auto p-[25px]', className)} {...props} />;
}

// AdminMart .card-group: cards joined in one row, divided by right borders.
export function CardGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'flex flex-col gap-[15px] sm:flex-row sm:flex-wrap sm:gap-0',
        'sm:*:flex-1 sm:*:rounded-none sm:[&>*:not(:last-child)]:border-r sm:[&>*:not(:last-child)]:border-line',
        className,
      )}
      {...props}
    />
  );
}
