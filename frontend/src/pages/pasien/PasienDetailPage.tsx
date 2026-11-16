import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { CARA_BAYAR, age, errorMessage, formatDate, qs, today, type Dokter, type Page, type Pasien, type Poli, type Rekam, type RekamGigi } from "../../lib/klinik";
import { InfoRow, Pager, RekamStatus } from "../../components/Common";
import { Lampiran } from "../../components/Lampiran";
import { Odontogram } from "../../components/Odontogram";
import { Alert, Button, Card, CardBody, CardHeader, Icon, Input, Modal, PageHeader, Select, Spinner, Table, TableEmpty, Td, Textarea, Th } from "../../components/ui";

export function PasienDetailPage() {
  const { id = "" } = useParams();
  const { hasRole } = useAuth();
  const canRegister = hasRole("admin", "pendaftaran");
  const [page, setPage] = useState(1);
  const [daftar, setDaftar] = useState(false);
  const qc = useQueryClient();
  const pasien = useQuery({ queryKey: ["pasien", id], queryFn: () => api.get<Pasien>(`/pasien/${id}`) });
  const rekams = useQuery({ queryKey: ["rekam", "pasien", id, page], queryFn: () => api.get<Page<Rekam>>(`/rekam${qs({ pasien_id: id, page, size: 10 })}`) });
  const gigi = useQuery({ queryKey: ["odontogram", id], queryFn: () => api.get<RekamGigi[]>(`/pasien/${id}/odontogram`) });
  const open = rekams.data?.items.find((r) => r.status < 5);
  const [sp] = useSearchParams();

  if (pasien.isLoading) return <Spinner />;
  if (!pasien.data) return <Alert tone="danger">Pasien tidak ditemukan.</Alert>;
  const p = pasien.data;

  return (
    <>
      <PageHeader
        title={p.nama}
        breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Pasien", to: "/app/pasien" }, { label: p.no_rm }]}
        actions={
          canRegister && (
            <>
              <Link to={`/app/pasien/${id}/edit`}>
                <Button variant="light"><Icon name="edit-2" size={16} /> Ubah data</Button>
              </Link>
              <Button onClick={() => setDaftar(true)} disabled={!!open} title={open ? "Masih ada rekam yang belum selesai" : undefined}>
                <Icon name="plus" size={16} /> Daftar Periksa
              </Button>
            </>
          )
        }
      />
      {sp.get("permintaan") === "gagal" && (
        <Alert tone="warning" className="mb-4">
          Pasien tersimpan, tetapi permintaan janji belum tertaut. Buka <Link to="/app/permintaan-janji">Permintaan Janji</Link> lalu pilih pasien ini lewat “Daftarkan”.
        </Alert>
      )}
      {open && (
        <Alert tone="warning" className="mb-4">
          Rekam <b>{open.no_rekam}</b> masih berjalan (<RekamStatus status={open.status} />).{" "}
          <Link to={`/app/rekam/${open.id}`}>Buka rekam</Link>
        </Alert>
      )}
      <div className="grid gap-[30px] lg:grid-cols-3">
        <Card>
          <CardHeader title="Identitas" />
          <CardBody>
            <InfoRow label="No. RM">{p.no_rm}</InfoRow>
            <InfoRow label="Jenis kelamin">{p.jk}</InfoRow>
            <InfoRow label="TTL">{[p.tmp_lahir, formatDate(p.tgl_lahir)].filter(Boolean).join(", ")} ({age(p.tgl_lahir)})</InfoRow>
            <InfoRow label="No. HP">{p.no_hp}</InfoRow>
            <InfoRow label="Cara bayar">{p.cara_bayar}</InfoRow>
            <InfoRow label="No. BPJS">{p.no_bpjs}</InfoRow>
            <InfoRow label="Alamat">{[p.alamat_lengkap, p.kelurahan, p.kecamatan, p.kabupaten].filter(Boolean).join(", ") || "-"}</InfoRow>
            <InfoRow label="Pekerjaan">{p.pekerjaan}</InfoRow>
            <InfoRow label="Alergi"><span className={p.alergi ? "font-medium text-danger" : ""}>{p.alergi || "Tidak ada"}</span></InfoRow>
            <div className="mt-4 border-t border-line pt-4">
              <Lampiran label="General consent" path={`/pasien/${id}/consent`} exists={p.has_consent} editable={canRegister} onChange={() => qc.invalidateQueries({ queryKey: ["pasien", id] })} />
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Riwayat Rekam Medis" />
          <CardBody className="p-0!">
            <Table>
              <thead>
                <tr>
                  <Th>Tanggal</Th>
                  <Th>Poli / Dokter</Th>
                  <Th>Keluhan</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rekams.data?.items.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap">{formatDate(r.tgl_rekam)}<div className="text-sm text-muted">{r.no_rekam}</div></Td>
                    <Td>{r.poli_nama}<div className="text-sm text-muted">{r.dokter_nama}</div></Td>
                    <Td className="max-w-xs truncate">{r.keluhan}</Td>
                    <Td><RekamStatus status={r.status} /></Td>
                    <Td className="text-right"><Link to={`/app/rekam/${r.id}`}><Button size="sm" variant="light">Detail</Button></Link></Td>
                  </tr>
                ))}
                {rekams.data && rekams.data.items.length === 0 && <TableEmpty colSpan={5}>Belum ada rekam medis.</TableEmpty>}
              </tbody>
            </Table>
            {rekams.data && <Pager page={rekams.data.page} size={rekams.data.size} total={rekams.data.total} onPage={setPage} />}
          </CardBody>
        </Card>
      </div>
      {gigi.data && gigi.data.length > 0 && (
        <Card className="mt-[30px]">
          <CardHeader title="Odontogram" subtitle="Kondisi terakhir per gigi dari seluruh kunjungan poli gigi" />
          <CardBody>
            <Odontogram rows={gigi.data} />
          </CardBody>
        </Card>
      )}
      {canRegister && <DaftarModal open={daftar} onClose={() => setDaftar(false)} pasien={p} />}
    </>
  );
}

function DaftarModal({ open, onClose, pasien }: { open: boolean; onClose: () => void; pasien: Pasien }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ tgl_rekam: today(), poli_id: "", dokter_id: "", keluhan: "", cara_bayar: pasien.cara_bayar as string });
  const poli = useQuery({ queryKey: ["poli", "active"], queryFn: () => api.get<Poli[]>("/poli?active=1"), enabled: open });
  const dokter = useQuery({
    queryKey: ["dokter", "active", f.poli_id],
    queryFn: () => api.get<Dokter[]>(`/dokter${qs({ poli_id: f.poli_id, active: 1 })}`),
    enabled: open && !!f.poli_id,
  });
  const save = useMutation({
    mutationFn: () => api.post<{ id: string }>("/rekam", { ...f, pasien_id: pasien.id }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["rekam"] });
      navigate(`/app/rekam/${r.id}`);
    },
  });
  const err = fieldErrors(save.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Daftar periksa: ${pasien.nama}`}>
      <form onSubmit={submit} className="grid gap-4">
        <Input label="Tanggal" type="date" value={f.tgl_rekam} onChange={(e) => setF({ ...f, tgl_rekam: e.target.value })} error={err.tgl_rekam} required />
        <Select label="Poli *" value={f.poli_id} onChange={(e) => setF({ ...f, poli_id: e.target.value, dokter_id: "" })} required>
          <option value="">-- Pilih poli --</option>
          {poli.data?.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
        </Select>
        <Select label="Dokter *" value={f.dokter_id} onChange={(e) => setF({ ...f, dokter_id: e.target.value })} error={err.dokter_id} required disabled={!f.poli_id}>
          <option value="">-- Pilih dokter --</option>
          {dokter.data?.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
        </Select>
        <Select label="Cara bayar *" value={f.cara_bayar} onChange={(e) => setF({ ...f, cara_bayar: e.target.value })} error={err.cara_bayar}>
          {CARA_BAYAR.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Textarea label="Keluhan (anamnesa) *" value={f.keluhan} onChange={(e) => setF({ ...f, keluhan: e.target.value })} error={err.keluhan} rows={3} required />
        {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={save.isPending}>Daftarkan</Button>
        </div>
      </form>
    </Modal>
  );
}
