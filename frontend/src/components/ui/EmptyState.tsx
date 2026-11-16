import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({ icon = 'inbox', title, children }: { icon?: IconName; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="text-muted opacity-70">
        <Icon name={icon} size={32} />
      </span>
      <h5 className="mb-0 font-medium text-dark">{title}</h5>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}
