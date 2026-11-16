import { useCallback, useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatIDR } from "../../lib/format";
import { errorMessage, formatDate, formatDateTime, qs, type Obat, type Page, type Rekam, type RekamDetail } from "../../lib/klinik";
import { Confirm, InfoRow, Pager, SearchBox } from "../../components/Common";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Icon, Input, Modal, PageHeader, Spinner, Table, TableEmpty, Td, Th } from "../../components/ui";

export function ResepPage() {
  const { data, isLoading } = useQuery({ queryKey: ["rekam", "3"], queryFn: () => api.get<Page<Rekam>>(`/rekam${qs({ status: 3, size: 100 })}`), refetchInterval: 15000 });
  return (
    <>
      <PageHeader title="Resep & Pemberian Obat" breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Apotek" }]} description="Pasien yang sudah selesai diperiksa dokter." />
      <Card>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Pasien</Th>
                <Th>Dokter</Th>
                <Th>Resep</Th>
                <Th>Cara Bayar</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={6}><Spinner /></TableEmpty>}
              {data?.items.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDate(r.tgl_rekam)}</Td>
                  <Td className="font-medium">{r.pasien_nama}<div className="text-sm font-normal text-muted">{r.pasien_no_rm}</div></Td>
                  <Td>{r.dokter_nama}<div className="text-sm text-muted">{r.poli_nama}</div></Td>
                  <Td className="max-w-xs truncate">{r.resep_obat ?? <span className="text-muted">Tanpa resep</span>}</Td>
                  <Td>{r.cara_bayar}</Td>
                  <Td className="text-right"><Link to={`/app/apotek/${r.id}`}><Button size="sm">Proses</Button></Link></Td>
                </tr>
              ))}
              {data && data.items.length === 0 && <TableEmpty colSpan={6}>Tidak ada permintaan resep.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

interface Line {
  obat: Obat;
  jumlah: string;
  keterangan: string;
}

export function PengeluaranPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: r, isLoading } = useQuery({ queryKey: ["rekam", id], queryFn: () => api.get<RekamDetail>(`/rekam/${id}`) });
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const obat = useQuery({ queryKey: ["obat", "pick", q], queryFn: () => api.get<Page<Obat>>(`/obat${qs({ q, size: 8 })}`), enabled: q.length >= 2, placeholderData: keepPreviousData });
  const total = lines.reduce((a, l) => a + l.obat.harga * Number(l.jumlah || 0), 0);
  const save = useMutation({
    mutationFn: () => api.post<{ status: number }>(`/rekam/${id}/obat`, {
      items: lines.map((l) => ({ obat_id: l.obat.id, jumlah: Number(l.jumlah), keterangan: l.keterangan || null })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rekam"] });
      qc.invalidateQueries({ queryKey: ["obat"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/app/rekam/${id}`);
    },
  });
  const add = (o: Obat) => {
    if (!lines.some((l) => l.obat.id === o.id)) setLines([...lines, { obat: o, jumlah: "1", keterangan: "" }]);
    setQ("");
  };
  const upd = (i: number, k: "jumlah" | "keterangan", v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  if (isLoading) return <Spinner />;
  if (!r) return <Alert tone="danger">Rekam tidak ditemukan.</Alert>;
  const done = r.status !== 3;

  return (
    <>
      <PageHeader title="Pemberian Obat" breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Apotek", to: "/app/apotek" }, { label: r.pasien_nama }]} />
      {done && <Alert tone="info" className="mb-4">Obat untuk rekam ini sudah diproses. <Link to={`/app/rekam/${id}`}>Lihat rekam</Link></Alert>}
      <div className="grid gap-[30px] xl:grid-cols-3">
        <Card>
          <CardHeader title="Pasien" />
          <CardBody>
            <InfoRow label="Nama">{r.pasien_nama} ({r.pasien_no_rm})</InfoRow>
            <InfoRow label="Dokter">{r.dokter_nama} · {r.poli_nama}</InfoRow>
            <InfoRow label="Cara bayar">{r.cara_bayar}</InfoRow>
            <InfoRow label="Diagnosa">{r.diagnosa.map((d) => d.icd_code).join(", ") || (r.is_gigi ? r.gigi.map((g) => `${g.elemen_gigi}: ${g.diagnosa}`).join("; ") : "-")}</InfoRow>
            <div className="mt-3 rounded-[2px] bg-light/60 p-3">
              <div className="mb-1 text-sm text-muted">Resep dokter</div>
              <p className="mb-0 whitespace-pre-wrap text-dark">{r.resep_obat || "Tanpa resep."}</p>
            </div>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Obat diberikan" subtitle={r.cara_bayar === "Umum/Mandiri" ? "Setelah disimpan, pasien lanjut ke pembayaran." : "Jaminan Kesehatan: setelah disimpan, rekam selesai."} />
          <CardBody>
            {!done && (
              <div className="mb-4">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari obat (min. 2 huruf)" aria-label="Cari obat" />
                {q.length >= 2 && (
                  <ul className="m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-[2px] border border-line p-0">
                    {obat.data?.items.map((o) => (
                      <li key={o.id}>
                        <button type="button" disabled={o.stok === 0} onClick={() => add(o)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-light/60 disabled:cursor-not-allowed disabled:opacity-50">
                          <span className="flex-1">{o.nama}</span>
                          <span className="text-sm text-muted">stok {o.stok} {o.satuan}</span>
                          <span className="w-24 text-right text-sm">{formatIDR(o.harga)}</span>
                        </button>
                      </li>
                    ))}
                    {obat.data?.items.length === 0 && <li className="px-3 py-2 text-muted">Tidak ditemukan.</li>}
                  </ul>
                )}
              </div>
            )}
            <Table>
              <thead>
                <tr>
                  <Th>Obat</Th>
                  <Th>Jumlah</Th>
                  <Th>Aturan pakai</Th>
                  <Th className="text-right">Subtotal</Th>
                  {!done && <Th />}
                </tr>
              </thead>
              <tbody>
                {done
                  ? r.obat.map((o) => (
                      <tr key={o.id}>
                        <Td>{o.obat_nama}</Td>
                        <Td>{o.jumlah} {o.satuan}</Td>
                        <Td>{o.keterangan ?? "-"}</Td>
                        <Td className="text-right">{formatIDR(o.subtotal)}</Td>
                      </tr>
                    ))
                  : lines.map((l, i) => (
                      <tr key={l.obat.id}>
                        <Td>{l.obat.nama}<div className="text-sm text-muted">{formatIDR(l.obat.harga)} / {l.obat.satuan} · stok {l.obat.stok}</div></Td>
                        <Td className="w-28"><Input type="number" min={1} max={l.obat.stok} value={l.jumlah} onChange={(e) => upd(i, "jumlah", e.target.value)} aria-label="Jumlah" required /></Td>
                        <Td><Input value={l.keterangan} onChange={(e) => upd(i, "keterangan", e.target.value)} placeholder="mis. 3x1 sesudah makan" aria-label="Aturan pakai" /></Td>
                        <Td className="text-right">{formatIDR(l.obat.harga * Number(l.jumlah || 0))}</Td>
                        <Td><Button size="sm" variant="ghost" aria-label="Hapus" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" size={14} /></Button></Td>
                      </tr>
                    ))}
                {(done ? r.obat.length : lines.length) === 0 && <TableEmpty colSpan={done ? 4 : 5}>Belum ada obat.</TableEmpty>}
              </tbody>
            </Table>
            {!done && (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                <span className="mr-auto text-lg">Total obat: <b>{formatIDR(total)}</b></span>
                {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
                <Button onClick={() => save.mutate()} loading={save.isPending}>
                  <Icon name="check" size={16} /> {lines.length ? "Simpan & Berikan Obat" : "Selesai tanpa obat"}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export function RiwayatObatPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const page = Number(sp.get("page") || 1);
  const { data, isLoading } = useQuery({ queryKey: ["riwayat-obat", q, from, to, page], queryFn: () => api.get<Page<import("../../lib/klinik").PengeluaranRow>>(`/obat/riwayat${qs({ q, from, to, page })}`) });
  const set = (next: Record<string, string>) => setSp(Object.fromEntries(Object.entries({ q, from, to, ...next }).filter(([, v]) => v)));
  const onSearch = useCallback((v: string) => set({ q: v, page: "" }), [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <PageHeader title="Riwayat Keluar Obat" breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Apotek", to: "/app/apotek" }, { label: "Riwayat" }]} />
      <Card>
        <CardBody className="flex flex-wrap items-end justify-end gap-3 pb-0">
          <Input type="date" label="Dari" value={from} onChange={(e) => set({ from: e.target.value, page: "" })} />
          <Input type="date" label="Sampai" value={to} onChange={(e) => set({ to: e.target.value, page: "" })} />
          <SearchBox value={q} onSearch={onSearch} placeholder="Cari obat, kode, pasien" />
        </CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Obat</Th>
                <Th>Jumlah</Th>
                <Th>Pasien</Th>
                <Th className="text-right">Subtotal</Th>
                <Th>Petugas</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={6}><Spinner /></TableEmpty>}
              {data?.items.map((x) => (
                <tr key={x.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(x.created_at)}</Td>
                  <Td>{x.obat_nama}<div className="text-sm text-muted">{x.kd_obat}</div></Td>
                  <Td>{x.jumlah} {x.satuan}</Td>
                  <Td><Link to={`/app/rekam/${x.rekam_id}`}>{x.pasien_nama}</Link><div className="text-sm text-muted">{x.no_rekam}</div></Td>
                  <Td className="text-right">{formatIDR(x.subtotal)}</Td>
                  <Td>{x.petugas}</Td>
                </tr>
              ))}
              {data && data.items.length === 0 && <TableEmpty colSpan={6}>Belum ada obat keluar.</TableEmpty>}
            </tbody>
          </Table>
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => set({ page: String(p) })} />}
        </CardBody>
      </Card>
    </>
  );
}

const emptyObat = { kd_obat: "", nama: "", satuan: "Tablet", stok: "0", harga: "0", is_bpjs: true };

export function ObatPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "apotek");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") || 1);
  const [form, setForm] = useState<{ id?: string; v: typeof emptyObat } | null>(null);
  const [del, setDel] = useState<Obat | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["obat", q, page], queryFn: () => api.get<Page<Obat>>(`/obat${qs({ q, page })}`) });
  const save = useMutation({
    mutationFn: () => {
      const v = form!.v;
      const body = { ...v, kd_obat: v.kd_obat || null, stok: Number(v.stok), harga: Number(v.harga) };
      return form!.id ? api.patch(`/obat/${form!.id}`, body) : api.post("/obat", body);
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["obat"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/obat/${id}`), onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ["obat"] }); } });
  const err = fieldErrors(save.error);
  const onSearch = useCallback((v: string) => setSp(v ? { q: v } : {}), [setSp]);
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const set = (k: keyof typeof emptyObat, v: string | boolean) => setForm((f) => f && { ...f, v: { ...f.v, [k]: v } });

  return (
    <>
      <PageHeader
        title="Data Obat"
        breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Obat" }]}
        actions={canEdit && <Button onClick={() => { save.reset(); setForm({ v: emptyObat }); }}><Icon name="plus" size={16} /> Tambah Obat</Button>}
      />
      <Card>
        <CardBody className="flex justify-end pb-0"><SearchBox value={q} onSearch={onSearch} placeholder="Cari nama / kode obat" /></CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">Harga</Th>
                <Th>BPJS</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={7}><Spinner /></TableEmpty>}
              {data?.items.map((o) => (
                <tr key={o.id}>
                  <Td>{o.kd_obat ?? "-"}</Td>
                  <Td className="font-medium">{o.nama}</Td>
                  <Td>{o.satuan}</Td>
                  <Td className="text-right">{o.stok <= 10 ? <Badge tone="danger">{o.stok}</Badge> : o.stok}</Td>
                  <Td className="text-right">{formatIDR(o.harga)}</Td>
                  <Td>{o.is_bpjs ? <Badge tone="success">Ya</Badge> : <Badge tone="light">Tidak</Badge>}</Td>
                  {canEdit && (
                    <Td className="text-right whitespace-nowrap">
                      <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ id: o.id, v: { kd_obat: o.kd_obat ?? "", nama: o.nama, satuan: o.satuan, stok: String(o.stok), harga: String(o.harga), is_bpjs: o.is_bpjs } }); }}><Icon name="edit-2" size={14} /></Button>{" "}
                      <Button size="sm" variant="light" aria-label="Hapus" onClick={() => setDel(o)}><Icon name="trash-2" size={14} className="text-danger" /></Button>
                    </Td>
                  )}
                </tr>
              ))}
              {data && data.items.length === 0 && <TableEmpty colSpan={7}>Belum ada obat.</TableEmpty>}
            </tbody>
          </Table>
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => setSp({ ...(q ? { q } : {}), page: String(p) })} />}
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Ubah Obat" : "Tambah Obat"}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Input label="Kode" value={form.v.kd_obat} onChange={(e) => set("kd_obat", e.target.value)} error={err.kd_obat} />
            <Input label="Nama *" value={form.v.nama} onChange={(e) => set("nama", e.target.value)} error={err.nama} required autoFocus />
            <Input label="Satuan *" value={form.v.satuan} onChange={(e) => set("satuan", e.target.value)} error={err.satuan} required />
            <Input label="Stok *" type="number" min={0} value={form.v.stok} onChange={(e) => set("stok", e.target.value)} error={err.stok} required />
            <Input label="Harga (Rp) *" type="number" min={0} value={form.v.harga} onChange={(e) => set("harga", e.target.value)} error={err.harga} required />
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={form.v.is_bpjs} onChange={(e) => set("is_bpjs", e.target.checked)} /> Obat BPJS
            </label>
            {save.error && !Object.keys(err).length && <Alert tone="danger" className="sm:col-span-2">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="light" onClick={() => setForm(null)}>Batal</Button>
              <Button type="submit" loading={save.isPending}>Simpan</Button>
            </div>
          </form>
        </Modal>
      )}
      <Confirm open={!!del} title="Hapus obat" onCancel={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}>
        Hapus <b>{del?.nama}</b>? Riwayat pengeluaran obat ini tetap tersimpan.
      </Confirm>
    </>
  );
}
