import { type HTMLAttributes } from 'react';
import { cx } from './cx';

// AdminMart .badge bg-*: solid fill, white text (warning/light use dark text).
const tones = {
  primary: 'bg-primary text-white',
  success: 'bg-success text-white',
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-heading',
  info: 'bg-info text-white',
  cyan: 'bg-cyan text-white',
  orange: 'bg-orange text-white',
  dark: 'bg-dark text-white',
  secondary: 'bg-secondary text-white',
  light: 'bg-light text-heading',
} as const;

export type BadgeTone = keyof typeof tones;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  pill?: boolean;
}

export function Badge({ tone = 'primary', pill, className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap',
        pill ? 'rounded-[10rem] px-2' : 'rounded-[2px]',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
