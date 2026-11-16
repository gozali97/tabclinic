import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  breadcrumb?: Crumb[];
  description?: ReactNode;
  actions?: ReactNode;
}

// AdminMart .page-breadcrumb: h3.page-title + breadcrumb, actions on the right (col-7 / col-5).
export function PageHeader({ title, breadcrumb = [], description, actions }: PageHeaderProps) {
  return (
    <div className="mb-[30px] flex flex-wrap items-center gap-4">
      {/* min width keeps the title readable; actions wrap below it on narrow screens. */}
      <div className="min-w-[min(100%,18rem)] flex-1">
        <h3 className="mb-1 truncate text-[21px] font-medium text-dark">{title}</h3>
        {breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb">
            <ol className="m-0 flex flex-wrap p-0 text-sm">
              {breadcrumb.map((c, i) => (
                <li key={c.label} className="flex items-center">
                  {i > 0 && <span className="px-2 text-[11px] text-line-input">/</span>}
                  {c.to ? (
                    <Link to={c.to} className="text-breadcrumb hover:text-primary">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-secondary" aria-current="page">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {description && <p className="mt-1 mb-0 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
