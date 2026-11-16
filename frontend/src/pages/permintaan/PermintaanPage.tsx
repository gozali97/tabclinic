import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import {
  errorMessage,
  formatDateTime,
  qs,
  type Page,
  type Pasien,
} from "../../lib/klinik";
import { Pager, SearchBox } from "../../components/Common";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Icon,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
  TableEmpty,
  Tabs,
  Td,
  Textarea,
  Th,
  type BadgeTone,
} from "../../components/ui";

export type PermintaanStatus = "baru" | "dihubungi" | "terdaftar" | "batal";

export interface Permintaan {
  id: string;
  full_name: string;
  phone: string;
  service: string;
  preferred_day: string;
  status: PermintaanStatus;
  catatan: string | null;
  pasien_id: string | null;
  pasien_nama: string | null;
  pasien_no_rm: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  unassigned: boolean;
}

interface PermintaanPage extends Page<Permintaan> {
  counts: Record<PermintaanStatus, number>;
}

const STATUS: Record<PermintaanStatus, { label: string; tone: BadgeTone }> = {
  baru: { label: "Baru", tone: "warning" },
  dihubungi: { label: "Dihubungi", tone: "info" },
  terdaftar: { label: "Terdaftar", tone: "success" },
  batal: { label: "Batal", tone: "secondary" },
};
const TABS: PermintaanStatus[] = ["baru", "dihubungi", "terdaftar", "batal"];

// wa.me needs the international number without "+": 0812… -> 62812…
function waLink(phone: string) {
  const digits = phone.replace(/^\+/, "");
  return `https://wa.me/${digits.startsWith("0") ? "62" + digits.slice(1) : digits}`;
}

// Form "Buat Janji" di landing page. Bukan jadwal: petugas menghubungi pasien lalu mendaftarkannya.
export function PermintaanPage() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get("status") as PermintaanStatus) || "baru";
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") || 1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["permintaan", status, q, page],
    queryFn: () =>
      api.get<PermintaanPage>(`/permintaan-janji${qs({ status, q, page })}`),
    placeholderData: keepPreviousData,
  });
  const [edit, setEdit] = useState<{
    row: Permintaan;
    to: PermintaanStatus;
  } | null>(null);
  const [daftar, setDaftar] = useState<Permintaan | null>(null);
  const setParam = useCallback(
    (next: Record<string, string>) =>
      setSp((p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(next))
          if (v) n.set(k, v);
          else n.delete(k);
        if (!("page" in next)) n.delete("page");
        return n;
      }),
    [setSp],
  );

  return (
    <>
      <PageHeader
        title="Permintaan Janji"
        breadcrumb={[
          { label: "Dashboard", to: "/app" },
          { label: "Permintaan Janji" },
        ]}
        actions={
          <SearchBox
            value={q}
            onSearch={(v) => setParam({ q: v })}
            placeholder="Cari nama atau nomor"
          />
        }
      />
      <Alert tone="info" className="mb-4">
        Masuk dari form “Buat Janji” di website. Hubungi calon pasien, lalu
        daftarkan seperti pasien yang datang langsung. Jadwal belum terkunci
        sampai Anda mengonfirmasinya.
      </Alert>
      <Card>
        <CardBody className="p-0!">
          <Tabs
            className="px-4 pt-2"
            value={status}
            onChange={(v) => setParam({ status: v })}
            tabs={TABS.map((t) => ({
              value: t,
              label: STATUS[t].label,
              badge: data ? data.counts[t] : undefined,
            }))}
          />
          {error && (
            <Alert tone="danger" className="m-4">
              {errorMessage(error)}
            </Alert>
          )}
          {isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Masuk</Th>
                  <Th>Nama / WhatsApp</Th>
                  <Th>Poli · hari</Th>
                  <Th>Tindak lanjut</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </Td>
                    <Td>
                      <div className="font-medium text-dark">{r.full_name}</div>
                      <a
                        href={waLink(r.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm"
                      >
                        <Icon name="message-circle" size={13} /> {r.phone}
                      </a>
                      {r.unassigned && (
                        <Badge tone="secondary" className="ml-2">
                          belum ada klinik
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {r.service}
                      <div className="text-sm text-muted">
                        {r.preferred_day}
                      </div>
                    </Td>
                    <Td className="max-w-xs">
                      <Badge tone={STATUS[r.status].tone} pill>
                        {STATUS[r.status].label}
                      </Badge>
                      {r.pasien_id && (
                        <div className="text-sm">
                          <Link to={`/app/pasien/${r.pasien_id}`}>
                            {r.pasien_nama} ({r.pasien_no_rm})
                          </Link>
                        </div>
                      )}
                      {r.catatan && (
                        <div
                          className="truncate text-sm text-muted"
                          title={r.catatan}
                        >
                          {r.catatan}
                        </div>
                      )}
                      {r.handled_by && r.handled_at && (
                        <div className="text-xs text-muted">
                          {r.handled_by} · {formatDateTime(r.handled_at)}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {r.status !== "terdaftar" && (
                        <Button size="sm" onClick={() => setDaftar(r)}>
                          <Icon name="user-plus" size={14} /> Daftarkan
                        </Button>
                      )}
                      {r.status === "baru" && (
                        <Button
                          size="sm"
                          variant="light"
                          className="ml-1"
                          onClick={() => setEdit({ row: r, to: "dihubungi" })}
                        >
                          Dihubungi
                        </Button>
                      )}
                      {(r.status === "baru" || r.status === "dihubungi") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-1"
                          onClick={() => setEdit({ row: r, to: "batal" })}
                          aria-label={`Batalkan permintaan ${r.full_name}`}
                        >
                          <Icon name="x" size={14} />
                        </Button>
                      )}
                      {r.status === "batal" && (
                        <Button
                          size="sm"
                          variant="light"
                          className="ml-1"
                          onClick={() => setEdit({ row: r, to: "baru" })}
                        >
                          Buka lagi
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
                {data && data.items.length === 0 && (
                  <TableEmpty colSpan={5}>
                    Tidak ada permintaan {STATUS[status].label.toLowerCase()}.
                  </TableEmpty>
                )}
              </tbody>
            </Table>
          )}
          {data && (
            <Pager
              page={data.page}
              size={data.size}
              total={data.total}
              onPage={(p) => setParam({ page: String(p) })}
            />
          )}
        </CardBody>
      </Card>
      {edit && (
        <StatusModal
          row={edit.row}
          to={edit.to}
          onClose={() => setEdit(null)}
        />
      )}
      {daftar && <DaftarModal row={daftar} onClose={() => setDaftar(null)} />}
    </>
  );
}

function useUpdate(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: PermintaanStatus;
      catatan: string | null;
      pasien_id: string | null;
    }) => api.patch(`/permintaan-janji/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permintaan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
    },
  });
}

function StatusModal({
  row,
  to,
  onClose,
}: {
  row: Permintaan;
  to: PermintaanStatus;
  onClose: () => void;
}) {
  const [catatan, setCatatan] = useState(row.catatan ?? "");
  const save = useUpdate(onClose);
  const title = {
    baru: "Buka lagi permintaan",
    dihubungi: "Tandai sudah dihubungi",
    batal: "Batalkan permintaan",
    terdaftar: "",
  }[to];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      id: row.id,
      status: to,
      catatan: catatan.trim() || null,
      pasien_id: row.pasien_id,
    });
  };
  return (
    <Modal open onClose={onClose} title={`${title}: ${row.full_name}`}>
      <form onSubmit={submit} className="grid gap-4">
        <Textarea
          label={to === "batal" ? "Alasan" : "Catatan"}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          maxLength={1000}
          required={to === "batal"}
          hint={
            to === "dihubungi"
              ? "Misalnya jadwal yang disepakati: Senin 09.00, dr. Rina."
              : undefined
          }
          error={fieldErrors(save.error).catatan}
        />
        {save.error && !fieldErrors(save.error).catatan && (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            variant={to === "batal" ? "danger" : "primary"}
            loading={save.isPending}
          >
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Link the request to an existing patient, or create a new one with name/phone prefilled.
function DaftarModal({
  row,
  onClose,
}: {
  row: Permintaan;
  onClose: () => void;
}) {
  const [q, setQ] = useState(row.full_name);
  const [term, setTerm] = useState(row.full_name);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const pasien = useQuery({
    queryKey: ["pasien", "cari-permintaan", term],
    queryFn: () => api.get<Page<Pasien>>(`/pasien${qs({ q: term, size: 6 })}`),
    enabled: term.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
  const byPhone = useQuery({
    queryKey: ["pasien", "cari-permintaan", row.phone],
    queryFn: () =>
      api.get<Page<Pasien>>(
        `/pasien${qs({ q: row.phone.replace(/^\+62/, "0"), size: 3 })}`,
      ),
  });
  const save = useUpdate(onClose);
  const matches = [
    ...(byPhone.data?.items ?? []),
    ...(pasien.data?.items ?? []),
  ].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const baru = `/app/pasien/baru${qs({ nama: row.full_name, no_hp: row.phone.replace(/^\+62/, "0"), permintaan: row.id })}`;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Daftarkan: ${row.full_name}`}
      size="lg"
    >
      <div className="grid gap-4">
        <p className="mb-0">
          Kalau calon pasien sudah punya rekam medis, pilih datanya. Kalau
          belum, buat pasien baru; nama dan nomor WhatsApp terisi otomatis.
        </p>
        <Input
          label="Cari pasien"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nama, No. RM, atau nomor HP"
        />
        <ul className="m-0 max-h-72 list-none overflow-y-auto rounded-[2px] border border-line p-0">
          {matches.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0"
            >
              <span className="flex-1">
                <span className="font-medium text-dark">{p.nama}</span>{" "}
                <span className="text-sm text-muted">
                  {p.no_rm} · {p.no_hp}
                </span>
              </span>
              <Button
                size="sm"
                loading={save.isPending && save.variables?.pasien_id === p.id}
                onClick={() =>
                  save.mutate({
                    id: row.id,
                    status: "terdaftar",
                    catatan: row.catatan,
                    pasien_id: p.id,
                  })
                }
              >
                Pilih
              </Button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-muted">
              {pasien.isFetching || byPhone.isFetching
                ? "Mencari…"
                : "Tidak ada pasien yang cocok."}
            </li>
          )}
        </ul>
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-between gap-2">
          <Link to={baru}>
            <Button variant="success">
              <Icon name="user-plus" size={16} /> Pasien baru
            </Button>
          </Link>
          <Button variant="light" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}
