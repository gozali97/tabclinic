import feather, { type FeatherIconNames } from 'feather-icons';
import { cx } from './cx';

interface IconProps {
  name: FeatherIconNames;
  size?: number;
  className?: string;
  label?: string;
}

// Feather icon set, same as AdminMart's data-feather icons.
export function Icon({ name, size = 18, className, label }: IconProps) {
  const icon = feather.icons[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('inline-block shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: icon?.contents ?? '' }}
    />
  );
}

export type { FeatherIconNames as IconName };
