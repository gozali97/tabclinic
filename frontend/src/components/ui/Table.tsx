import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cx } from './cx';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  hover?: boolean;
  striped?: boolean;
  /** Dashboard "Top Leaders" style: borderless header, roomy rows. */
  plain?: boolean;
  wrapperClassName?: string;
}

// AdminMart .table.no-wrap.v-middle inside .table-responsive.
export function Table({ hover = true, striped, plain, className, wrapperClassName, ...props }: TableProps) {
  return (
    <div className={cx('w-full overflow-x-auto', wrapperClassName)}>
      <table
        className={cx(
          'w-full border-collapse text-left align-middle text-body',
          '[&_th]:font-medium [&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-4 [&_th]:align-middle [&_td]:align-middle',
          plain
            ? '[&_thead_th]:border-0 [&_thead_th]:text-sm [&_thead_th]:text-muted [&_td]:border-t [&_td]:border-line-table'
            : '[&_thead_th]:border-b-2 [&_thead_th]:border-line-table [&_thead_th]:text-heading [&_td]:border-t [&_td]:border-line-table',
          '[&_tbody_tr:first-child_td]:border-t-0',
          hover && '[&_tbody_tr:hover]:bg-light/60',
          striped && '[&_tbody_tr:nth-of-type(odd)]:bg-stripe',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cx('whitespace-nowrap', className)} {...p} />;
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={className} {...p} />;

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10! text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
