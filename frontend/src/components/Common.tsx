import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Icon, Modal, PillInput } from "./ui";
import { STATUS } from "../lib/klinik";

export function RekamStatus({ status }: { status: number }) {
  const s = STATUS[status] ?? { label: String(status), tone: "secondary" as const };
  return (
    <Badge tone={s.tone} pill>
      {s.label}
    </Badge>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-muted">
      <span>
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="light" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
          <Icon name="chevron-left" size={16} />
        </Button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <Button size="sm" variant="light" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
          <Icon name="chevron-right" size={16} />
        </Button>
      </div>
    </div>
  );
}

/** Debounced search box; calls onSearch 300 ms after typing stops. */
export function SearchBox({ value, onSearch, placeholder = "Cari…" }: { value: string; onSearch: (q: string) => void; placeholder?: string }) {
  const [q, setQ] = useState(value);
  useEffect(() => setQ(value), [value]);
  useEffect(() => {
    if (q === value) return;
    const t = setTimeout(() => onSearch(q), 300);
    return () => clearTimeout(t);
  }, [q, value, onSearch]);
  return (
    <div className="w-full sm:w-72">
      <PillInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} icon={<Icon name="search" size={18} />} />
    </div>
  );
}

export function Confirm({
  open,
  title,
  children,
  onCancel,
  onConfirm,
  loading,
  confirmLabel = "Hapus",
  tone = "danger",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="light" onClick={onCancel}>
            Batal
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-dark">{children ?? "-"}</span>
    </div>
  );
}
