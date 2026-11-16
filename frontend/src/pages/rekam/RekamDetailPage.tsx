import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatIDR } from "../../lib/format";
import { errorMessage, formatDate, formatDateTime, qs, type ICD, type KondisiGigi, type Page, type RekamDetail, type RekamGigi, type Tindakan } from "../../lib/klinik";
import { Confirm, InfoRow, RekamStatus } from "../../components/Common";
import { Lampiran } from "../../components/Lampiran";
import { Odontogram } from "../../components/Odontogram";
import { BayarModal } from "../pembayaran/BayarModal";
import { Alert, Button, Card, CardBody, CardHeader, Icon, Input, Modal, PageHeader, Select, Spinner, Table, TableEmpty, Td, Textarea, Th } from "../../components/ui";

export function RekamDetailPage() {
  const { id = "" } = useParams();
  const { me, hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: r, isLoading, error } = useQuery({ queryKey: ["rekam", id], queryFn: () => api.get<RekamDetail>(`/rekam/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rekam"] });
    qc.invalidateQueries({ queryKey: ["odontogram"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [del, setDel] = useState(false);
  const [bayar, setBayar] = useState(false);
  const status = useMutation({
    mutationFn: (to: number) => api.post(`/rekam/${id}/status`, { status: to }),
    onSuccess: (_, to) => {
      refresh();
      setMsg({ tone: "success", text: to === 2 ? "Pasien diteruskan ke dokter." : "Pasien diteruskan ke apotek." });
    },
    onError: (e) => setMsg({ tone: "danger", text: errorMessage(e) }),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/rekam/${id}`),
    onSuccess: () => {
      refresh();
      navigate(r ? `/app/pasien/${r.pasien_id}` : "/app/rekam");
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !r) return <Alert tone="danger">Rekam tidak ditemukan.</Alert>;

  const front = hasRole("admin", "pendaftaran");
  const isDokter = !!me && (me.roles.includes("dokter") || me.is_superadmin);
  const doctorStep = isDokter && r.status === 2;
  const canEditPemeriksaan = (front && r.status === 1) || doctorStep;

  return (
    <>
      <PageHeader
        title={`Rekam ${r.no_rekam}`}
        breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Rekam Medis", to: "/app/rekam" }, { label: r.pasien_nama }]}
        actions={
          <>
            {front && r.status <= 2 && (
              <Button variant="light" onClick={() => setDel(true)}><Icon name="trash-2" size={16} className="text-danger" /> Hapus</Button>
            )}
            {front && r.status === 1 && (
              <Button onClick={() => status.mutate(2)} loading={status.isPending}>
                <Icon name="send" size={16} /> Teruskan ke Dokter
              </Button>
            )}
            {doctorStep && (
              <Button onClick={() => status.mutate(3)} loading={status.isPending}>
                <Icon name="send" size={16} /> Selesai Periksa, ke Apotek
              </Button>
            )}
            {hasRole("admin", "apotek") && r.status === 3 && (
              <Link to={`/app/apotek/${r.id}`}><Button><Icon name="package" size={16} /> Berikan Obat</Button></Link>
            )}
            {front && r.status === 4 && (
              <Button variant="success" onClick={() => setBayar(true)}><Icon name="credit-card" size={16} /> Pembayaran</Button>
            )}
          </>
        }
      />
      {msg && <Alert tone={msg.tone} className="mb-4" onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="grid gap-[30px] xl:grid-cols-3">
        <Card>
          <CardHeader title="Pendaftaran" actions={<RekamStatus status={r.status} />} />
          <CardBody>
            <InfoRow label="Pasien"><Link to={`/app/pasien/${r.pasien_id}`}>{r.pasien_nama}</Link> ({r.pasien_no_rm})</InfoRow>
            <InfoRow label="Tanggal">{formatDate(r.tgl_rekam)}</InfoRow>
            <InfoRow label="Poli">{r.poli_nama}</InfoRow>
            <InfoRow label="Dokter">{r.dokter_nama}</InfoRow>
            <InfoRow label="Cara bayar">{r.cara_bayar}</InfoRow>
            <InfoRow label="Petugas">{r.petugas_nama}</InfoRow>
            <InfoRow label="Keluhan">{r.keluhan}</InfoRow>
            {front && r.status === 1 && <EditDaftar r={r} onDone={refresh} />}
          </CardBody>
        </Card>

        <div className="grid gap-[30px] xl:col-span-2">
          <TextStep
            title="Pemeriksaan (Subjective / Objective)"
            hint={r.is_gigi ? "Opsional untuk poli gigi." : "Wajib diisi sebelum diteruskan ke dokter."}
            value={r.pemeriksaan}
            editable={canEditPemeriksaan}
            path={`/rekam/${id}/pemeriksaan`}
            onDone={refresh}
          >
            <Lampiran label="Foto pemeriksaan" path={`/rekam/${id}/pemeriksaan/file`} exists={r.has_pemeriksaan_file} editable={canEditPemeriksaan} onChange={refresh} />
          </TextStep>
          {r.is_gigi ? (
            <GigiStep r={r} editable={doctorStep} onDone={refresh} />
          ) : (
            <>
              <DiagnosaStep r={r} editable={doctorStep} onDone={refresh} />
              <TindakanStep r={r} editable={doctorStep} onDone={refresh} />
            </>
          )}
          <TextStep title="Resep Obat (Plan)" hint="Ditulis dokter, disiapkan apotek." value={r.resep_obat} editable={doctorStep} path={`/rekam/${id}/resep`} onDone={refresh} />
          {(r.obat.length > 0 || r.status >= 4) && <ObatCard r={r} />}
          {r.status >= 4 && <TagihanCard r={r} />}
        </div>
      </div>

      <Confirm open={del} title="Hapus rekam" onCancel={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending}>
        <p>Hapus pendaftaran {r.no_rekam}? Data pemeriksaan pada rekam ini ikut terhapus.</p>
        {remove.error && <Alert tone="danger" className="mt-3">{errorMessage(remove.error)}</Alert>}
      </Confirm>
      <BayarModal open={bayar} onClose={() => setBayar(false)} rekam={r} onPaid={refresh} />
    </>
  );
}

function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={hint} actions={actions} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function TextStep({ title, hint, value, editable, path, onDone, extra, children }: {
  title: string; hint?: string; value: string | null; editable: boolean; path: string; onDone: () => void; extra?: () => Record<string, unknown>; children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const save = useMutation({
    mutationFn: () => api.put(path, { text, ...(extra?.() ?? {}) }),
    onSuccess: () => {
      setEditing(false);
      onDone();
    },
  });
  return (
    <Section
      title={title}
      hint={hint}
      actions={editable && !editing && <Button size="sm" variant="light" onClick={() => setEditing(true)}><Icon name="edit-2" size={14} /> {value ? "Ubah" : "Isi"}</Button>}
    >
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} required autoFocus aria-label={title} />
          {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="light" onClick={() => { setEditing(false); setText(value ?? ""); }}>Batal</Button>
            <Button type="submit" loading={save.isPending}>Simpan</Button>
          </div>
        </form>
      ) : value ? (
        <p className="mb-0 whitespace-pre-wrap text-dark">{value}</p>
      ) : (
        <p className="mb-0 text-muted">Belum diisi.</p>
      )}
      {children && <div className="mt-4 border-t border-line pt-4">{children}</div>}
    </Section>
  );
}

function DiagnosaStep({ r, editable, onDone }: { r: RekamDetail; editable: boolean; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const icd = useQuery({
    queryKey: ["icd", term],
    queryFn: () => api.get<Page<ICD>>(`/icd${qs({ q: term, size: 8 })}`),
    enabled: editable && term.length >= 2,
    placeholderData: keepPreviousData,
  });
  const add = useMutation({ mutationFn: (code: string) => api.post(`/rekam/${r.id}/diagnosa`, { icd_code: code }), onSuccess: () => { setQ(""); onDone(); } });
  const del = useMutation({ mutationFn: (did: string) => api.delete(`/rekam/${r.id}/diagnosa/${did}`), onSuccess: onDone });
  return (
    <Section title="Diagnosa (Assessment)" hint="ICD-10, minimal satu sebelum ke apotek">
      {r.diagnosa.length === 0 && <p className="text-muted">Belum ada diagnosa.</p>}
      <ul className="m-0 mb-3 list-none p-0">
        {r.diagnosa.map((d) => (
          <li key={d.id} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
            <span className="font-medium text-dark">{d.icd_code}</span>
            <span className="flex-1">{d.icd_name}</span>
            {editable && <Button size="sm" variant="ghost" aria-label={`Hapus ${d.icd_code}`} onClick={() => del.mutate(d.id)}><Icon name="x" size={14} /></Button>}
          </li>
        ))}
      </ul>
      {editable && (
        <div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik kode atau nama penyakit (min. 2 huruf)" aria-label="Cari ICD-10" />
          {term.length >= 2 && (
            <ul className="m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-[2px] border border-line p-0">
              {icd.data?.items.map((i) => (
                <li key={i.code}>
                  <button type="button" onClick={() => add.mutate(i.code)} className="flex w-full cursor-pointer gap-3 px-3 py-2 text-left hover:bg-light/60">
                    <span className="w-16 shrink-0 font-medium text-dark">{i.code}</span>
                    <span>{i.name_id || i.name_en}</span>
                  </button>
                </li>
              ))}
              {icd.data?.items.length === 0 && <li className="px-3 py-2 text-muted">Tidak ditemukan.</li>}
            </ul>
          )}
          {(add.error || del.error) && <Alert tone="danger" className="mt-2">{errorMessage(add.error || del.error)}</Alert>}
        </div>
      )}
    </Section>
  );
}

function TindakanStep({ r, editable, onDone }: { r: RekamDetail; editable: boolean; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.tindakan ?? "");
  const [ids, setIds] = useState<string[]>(r.tindakan_list.map((t) => t.tindakan_id));
  useEffect(() => {
    setText(r.tindakan ?? "");
    setIds(r.tindakan_list.map((t) => t.tindakan_id));
  }, [r]);
  const master = useQuery({ queryKey: ["tindakan", r.poli_id], queryFn: () => api.get<Tindakan[]>(`/tindakan${qs({ poli_id: r.poli_id })}`), enabled: editing });
  const save = useMutation({
    mutationFn: () => api.put(`/rekam/${r.id}/tindakan`, { text, tindakan_ids: ids }),
    onSuccess: () => { setEditing(false); onDone(); },
  });
  const toggle = (tid: string) => setIds((s) => (s.includes(tid) ? s.filter((x) => x !== tid) : [...s, tid]));
  return (
    <Section
      title="Tindakan (Plan)"
      hint="Catatan tindakan dan tindakan bertarif"
      actions={editable && !editing && <Button size="sm" variant="light" onClick={() => setEditing(true)}><Icon name="edit-2" size={14} /> {r.tindakan ? "Ubah" : "Isi"}</Button>}
    >
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} required autoFocus aria-label="Catatan tindakan" />
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="mb-1 text-dark">Tindakan bertarif</legend>
            {master.data?.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} />
                <span>{t.kode} · {t.nama}</span>
                <span className="ml-auto text-sm text-muted">{formatIDR(t.harga)}</span>
              </label>
            ))}
            {master.data?.length === 0 && <span className="text-muted">Belum ada master tindakan untuk poli ini.</span>}
          </fieldset>
          {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="light" onClick={() => setEditing(false)}>Batal</Button>
            <Button type="submit" loading={save.isPending}>Simpan</Button>
          </div>
        </form>
      ) : (
        <>
          {r.tindakan ? <p className="whitespace-pre-wrap text-dark">{r.tindakan}</p> : <p className="text-muted">Belum diisi.</p>}
          {r.tindakan_list.length > 0 && (
            <ul className="m-0 list-none p-0 text-sm">
              {r.tindakan_list.map((t) => (
                <li key={t.id} className="flex justify-between border-t border-line py-1.5">
                  <span>{t.nama}</span>
                  <span>{formatIDR(t.harga)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <Lampiran label="Foto tindakan" path={`/rekam/${r.id}/tindakan/file`} exists={r.has_tindakan_file} editable={editable} onChange={onDone} />
      </div>
    </Section>
  );
}

function GigiStep({ r, editable, onDone }: { r: RekamDetail; editable: boolean; onDone: () => void }) {
  const [tooth, setTooth] = useState<string | null>(null);
  const history = useQuery({ queryKey: ["odontogram", r.pasien_id], queryFn: () => api.get<RekamGigi[]>(`/pasien/${r.pasien_id}/odontogram`) });
  const del = useMutation({ mutationFn: (gid: string) => api.delete(`/rekam/${r.id}/gigi/${gid}`), onSuccess: onDone });
  return (
    <Section title="Odontogram & Pemeriksaan Gigi" hint="Per elemen gigi: kondisi, diagnosa, tindakan. Minimal satu sebelum ke apotek.">
      <Odontogram rows={history.data ?? r.gigi} currentRekamId={r.id} onSelect={editable ? setTooth : undefined} />
      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Gigi</Th>
            <Th>Kondisi</Th>
            <Th>Diagnosa</Th>
            <Th>Tindakan</Th>
            <Th className="text-right">Biaya</Th>
            {editable && <Th />}
          </tr>
        </thead>
        <tbody>
          {r.gigi.map((g) => (
            <tr key={g.id}>
              <Td className="font-medium">{g.elemen_gigi}</Td>
              <Td>{g.kondisi}{g.kondisi_nama && <span className="text-muted"> · {g.kondisi_nama}</span>}</Td>
              <Td>{g.diagnosa}</Td>
              <Td>{g.tindakan_nama ?? "-"}</Td>
              <Td className="text-right">{formatIDR(g.harga)}</Td>
              {editable && (
                <Td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" aria-label="Ubah" onClick={() => setTooth(g.elemen_gigi)}><Icon name="edit-2" size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label="Hapus" onClick={() => del.mutate(g.id)}><Icon name="trash-2" size={14} className="text-danger" /></Button>
                </Td>
              )}
            </tr>
          ))}
          {r.gigi.length === 0 && <TableEmpty colSpan={editable ? 6 : 5}>Belum ada pemeriksaan gigi pada kunjungan ini.</TableEmpty>}
        </tbody>
      </Table>
      {del.error && <Alert tone="danger" className="mt-2">{errorMessage(del.error)}</Alert>}
      {tooth && <GigiModal r={r} tooth={tooth} onClose={() => setTooth(null)} onDone={onDone} />}
    </Section>
  );
}

function GigiModal({ r, tooth, onClose, onDone }: { r: RekamDetail; tooth: string; onClose: () => void; onDone: () => void }) {
  const existing = r.gigi.find((g) => g.elemen_gigi === tooth);
  const [f, setF] = useState({ kondisi: existing?.kondisi ?? "sou", diagnosa: existing?.diagnosa ?? "", tindakan_id: existing?.tindakan_id ?? "" });
  const kondisi = useQuery({ queryKey: ["kondisi-gigi"], queryFn: () => api.get<KondisiGigi[]>("/kondisi-gigi"), staleTime: Infinity });
  const tindakan = useQuery({ queryKey: ["tindakan", r.poli_id], queryFn: () => api.get<Tindakan[]>(`/tindakan${qs({ poli_id: r.poli_id })}`) });
  const save = useMutation({
    mutationFn: () => api.post(`/rekam/${r.id}/gigi`, { elemen_gigi: tooth, kondisi: f.kondisi, diagnosa: f.diagnosa, tindakan_id: f.tindakan_id || null }),
    onSuccess: () => { onDone(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open onClose={onClose} title={`Gigi ${tooth}`}>
      <form onSubmit={submit} className="grid gap-4">
        <Select label="Kondisi *" value={f.kondisi} onChange={(e) => setF({ ...f, kondisi: e.target.value })}>
          {kondisi.data?.map((k) => <option key={k.kode} value={k.kode}>{k.kode} — {k.nama ?? ""}</option>)}
        </Select>
        <Input label="Diagnosa *" value={f.diagnosa} onChange={(e) => setF({ ...f, diagnosa: e.target.value })} required autoFocus />
        <Select label="Tindakan" value={f.tindakan_id} onChange={(e) => setF({ ...f, tindakan_id: e.target.value })}>
          <option value="">Tanpa tindakan bertarif</option>
          {tindakan.data?.map((t) => <option key={t.id} value={t.id}>{t.kode} · {t.nama} ({formatIDR(t.harga)})</option>)}
        </Select>
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={save.isPending}>Simpan</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditDaftar({ r, onDone }: { r: RekamDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [keluhan, setKeluhan] = useState(r.keluhan);
  const save = useMutation({
    mutationFn: () => api.patch(`/rekam/${r.id}`, { tgl_rekam: r.tgl_rekam.slice(0, 10), poli_id: r.poli_id, dokter_id: r.dokter_id, cara_bayar: r.cara_bayar, keluhan }),
    onSuccess: () => { setOpen(false); onDone(); },
  });
  if (!open) return <Button size="sm" variant="light" className="mt-3" onClick={() => setOpen(true)}><Icon name="edit-2" size={14} /> Ubah keluhan</Button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="mt-3 grid gap-2">
      <Textarea value={keluhan} onChange={(e) => setKeluhan(e.target.value)} rows={3} required aria-label="Keluhan" />
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="light" onClick={() => setOpen(false)}>Batal</Button>
        <Button size="sm" type="submit" loading={save.isPending}>Simpan</Button>
      </div>
    </form>
  );
}

function ObatCard({ r }: { r: RekamDetail }) {
  return (
    <Section title="Obat Diberikan">
      <Table>
        <thead>
          <tr>
            <Th>Obat</Th>
            <Th>Jumlah</Th>
            <Th>Aturan pakai</Th>
            <Th className="text-right">Subtotal</Th>
          </tr>
        </thead>
        <tbody>
          {r.obat.map((o) => (
            <tr key={o.id}>
              <Td>{o.obat_nama}</Td>
              <Td>{o.jumlah} {o.satuan}</Td>
              <Td>{o.keterangan ?? "-"}</Td>
              <Td className="text-right">{formatIDR(o.subtotal)}</Td>
            </tr>
          ))}
          {r.obat.length === 0 && <TableEmpty colSpan={4}>Tidak ada obat.</TableEmpty>}
        </tbody>
      </Table>
    </Section>
  );
}

function TagihanCard({ r }: { r: RekamDetail }) {
  const t = r.tagihan;
  const p = r.pembayaran;
  return (
    <Section title="Pembayaran" hint={r.cara_bayar === "Jaminan Kesehatan" ? "Ditanggung Jaminan Kesehatan" : undefined}>
      <InfoRow label="Pemeriksaan">{formatIDR(t.biaya_pemeriksaan)}</InfoRow>
      <InfoRow label="Tindakan">{formatIDR(t.biaya_tindakan)}</InfoRow>
      <InfoRow label="Obat">{formatIDR(t.biaya_obat)}</InfoRow>
      <InfoRow label="Total"><b>{formatIDR(t.total)}</b></InfoRow>
      {p ? (
        <Alert tone="success" className="mt-3">
          Lunas {formatIDR(p.total)} via {p.metode} · dibayar {formatIDR(p.dibayar)}, kembali {formatIDR(p.kembalian)} · {formatDateTime(p.created_at)} oleh {p.petugas}.{" "}
          <Link to={`/app/pembayaran/${r.id}/cetak`}>Cetak kuitansi</Link>
        </Alert>
      ) : r.status === 4 ? (
        <Alert tone="warning" className="mt-3">Menunggu pembayaran di pendaftaran.</Alert>
      ) : null}
    </Section>
  );
}
