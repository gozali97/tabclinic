import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  Modal,
  PillInput,
  Spinner,
} from "./ui";

export interface Company {
  id: string;
  name: string;
  slug?: string;
  mode: string;
  status: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function CompanyPicker({
  open,
  onClose,
  dismissible = true,
}: {
  open: boolean;
  onClose?: () => void;
  dismissible?: boolean;
}) {
  const { me, selectCompany, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.get<Company[]>("/companies"),
    enabled: open,
  });

  const term = q.trim().toLowerCase();
  const list = (companies.data ?? []).filter(
    (c) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      c.slug?.toLowerCase().includes(term),
  );

  const choose = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      // selectCompany clears the whole query cache.
      await selectCompany(id);
      onClose?.();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memilih company");
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (dismissible) onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Pilih company"
      footer={
        dismissible ? (
          <Button variant="light" onClick={close}>
            Batal
          </Button>
        ) : (
          <Button
            variant="light"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Keluar
          </Button>
        )
      }
    >
      <PillInput
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari company"
        aria-label="Cari company"
        icon={<Icon name="search" size={18} />}
      />
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {companies.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : companies.isError ? (
          <Alert tone="danger">
            {companies.error instanceof Error
              ? companies.error.message
              : "Gagal memuat company"}
          </Alert>
        ) : list.length === 0 ? (
          <EmptyState icon="briefcase" title="Belum ada company aktif" />
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => choose(c.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[2px] p-2.5 text-left hover:bg-light disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-white">
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-dark">
                      {c.name}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {[c.slug, c.mode].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {busy === c.id ? (
                    <Spinner />
                  ) : (
                    me?.company_id === c.id && (
                      <Badge tone="primary">Aktif</Badge>
                    )
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
