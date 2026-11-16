import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatIDR } from "../../lib/format";
import { formatDate, formatDateTime, qs, type Page, type Pembayaran, type Rekam, type RekamDetail } from "../../lib/klinik";
import { Pager, SearchBox } from "../../components/Common";
import { BayarModal } from "./BayarModal";
import { Alert, Button, Card, CardBody, CardHeader, Icon, Input, PageHeader, Spinner, Table, TableEmpty, Td, Th } from "../../components/ui";

export function PembayaranPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const page = Number(sp.get("page") || 1);
  const [pay, setPay] = useState<string | null>(null);
  const waiting = useQuery({ queryKey: ["rekam", "4"], queryFn: () => api.get<Page<Rekam>>(`/rekam${qs({ status: 4, size: 50 })}`), refetchInterval: 20000 });
  const history = useQuery({ queryKey: ["pembayaran", q, from, to, page], queryFn: () => api.get<Page<Pembayaran>>(`/pembayaran${qs({ q, from, to, page })}`) });
  const detail = useQuery({ queryKey: ["rekam", pay], queryFn: () => api.get<RekamDetail>(`/rekam/${pay}`), enabled: !!pay });
  const set = (next: Record<string, string>) => setSp(Object.fromEntries(Object.entries({ q, from, to, ...next }).filter(([, v]) => v)));
  const onSearch = useCallback((v: string) => set({ q: v, page: "" }), [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = history.data?.items.reduce((a, p) => a + p.total, 0) ?? 0;

  return (
    <>
      <PageHeader title="Pembayaran" breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Pembayaran" }]} description="Pasien Umum/Mandiri membayar setelah obat diberikan apotek." />
      <Card className="mb-[30px]">
        <CardHeader title="Menunggu pembayaran" subtitle={`${waiting.data?.total ?? 0} pasien`} />
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Pasien</Th>
                <Th>Poli</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {waiting.data?.items.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDate(r.tgl_rekam)}</Td>
                  <Td><Link to={`/app/rekam/${r.id}`} className="font-medium">{r.pasien_nama}</Link><div className="text-sm text-muted">{r.pasien_no_rm}</div></Td>
                  <Td>{r.poli_nama}</Td>
                  <Td className="text-right"><Button size="sm" variant="success" onClick={() => setPay(r.id)}><Icon name="credit-card" size={14} /> Bayar</Button></Td>
                </tr>
              ))}
              {waiting.data && waiting.data.items.length === 0 && <TableEmpty colSpan={4}>Tidak ada pasien menunggu pembayaran.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Riwayat pembayaran" subtitle={history.data ? `Halaman ini: ${formatIDR(sum)}` : undefined} />
        <CardBody className="flex flex-wrap items-end justify-end gap-3 pb-0">
          <Input type="date" label="Dari" value={from} onChange={(e) => set({ from: e.target.value, page: "" })} />
          <Input type="date" label="Sampai" value={to} onChange={(e) => set({ to: e.target.value, page: "" })} />
          <SearchBox value={q} onSearch={onSearch} placeholder="Cari pasien / No. Rekam" />
        </CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Pasien</Th>
                <Th>Metode</Th>
                <Th className="text-right">Total</Th>
                <Th>Petugas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {history.isLoading && <TableEmpty colSpan={6}><Spinner /></TableEmpty>}
              {history.data?.items.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(p.created_at)}</Td>
                  <Td>{p.pasien_nama}<div className="text-sm text-muted">{p.no_rekam}</div></Td>
                  <Td>{p.metode}</Td>
                  <Td className="text-right">{formatIDR(p.total)}</Td>
                  <Td>{p.petugas}</Td>
                  <Td className="text-right"><Link to={`/app/pembayaran/${p.rekam_id}/cetak`}><Button size="sm" variant="light"><Icon name="printer" size={14} /></Button></Link></Td>
                </tr>
              ))}
              {history.data && history.data.items.length === 0 && <TableEmpty colSpan={6}>Belum ada pembayaran.</TableEmpty>}
            </tbody>
          </Table>
          {history.data && <Pager page={history.data.page} size={history.data.size} total={history.data.total} onPage={(p) => set({ page: String(p) })} />}
        </CardBody>
      </Card>
      {detail.data && <BayarModal open={!!pay} onClose={() => setPay(null)} rekam={detail.data} onPaid={() => { waiting.refetch(); history.refetch(); }} />}
    </>
  );
}

export function KuitansiPage() {
  const { id = "" } = useParams();
  const { me } = useAuth();
  const { data: r, isLoading } = useQuery({ queryKey: ["rekam", id], queryFn: () => api.get<RekamDetail>(`/rekam/${id}`) });
  if (isLoading) return <Spinner />;
  if (!r || !r.pembayaran) return <Alert tone="warning">Rekam ini belum dibayar.</Alert>;
  const p = r.pembayaran;
  const lines = [
    { label: "Pemeriksaan " + r.poli_nama, amount: p.biaya_pemeriksaan },
    ...r.tindakan_list.map((t) => ({ label: t.nama, amount: t.harga })),
    ...r.gigi.filter((g) => g.harga > 0).map((g) => ({ label: `${g.tindakan_nama} (gigi ${g.elemen_gigi})`, amount: g.harga })),
    ...r.obat.map((o) => ({ label: `${o.obat_nama} × ${o.jumlah}`, amount: o.subtotal })),
  ];
  return (
    <>
      <div className="mb-4 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}><Icon name="printer" size={16} /> Cetak</Button>
        <Link to={`/app/rekam/${id}`}><Button variant="light">Kembali</Button></Link>
      </div>
      <div className="mx-auto max-w-md bg-white p-6 text-dark print:max-w-none print:p-0">
        <div className="mb-4 border-b border-dashed border-line-input pb-3 text-center">
          <div className="text-lg font-medium">{me?.company_name}</div>
          <div className="text-sm">Kuitansi Pembayaran</div>
        </div>
        <div className="mb-3 text-sm">
          <div>No. Rekam: {r.no_rekam}</div>
          <div>Pasien: {r.pasien_nama} ({r.pasien_no_rm})</div>
          <div>Dokter: {r.dokter_nama}</div>
          <div>Tanggal: {formatDateTime(p.created_at)}</div>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5">{l.label}</td>
                <td className="py-0.5 text-right">{formatIDR(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-dashed border-line-input font-medium">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right">{formatIDR(p.total)}</td>
            </tr>
            <tr>
              <td>Dibayar ({p.metode})</td>
              <td className="text-right">{formatIDR(p.dibayar)}</td>
            </tr>
            <tr>
              <td>Kembali</td>
              <td className="text-right">{formatIDR(p.kembalian)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-6 text-center text-sm">Petugas: {p.petugas}</div>
      </div>
    </>
  );
}
