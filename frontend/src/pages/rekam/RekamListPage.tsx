import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDate, qs, type Page, type Rekam } from "../../lib/klinik";
import { Pager, RekamStatus, SearchBox } from "../../components/Common";
import { Button, Card, CardBody, Icon, PageHeader, Spinner, Table, TableEmpty, Tabs, Td, Th } from "../../components/ui";

const TABS = [
  { value: "", label: "Semua" },
  { value: "1", label: "Antrian" },
  { value: "2", label: "Pemeriksaan" },
  { value: "3", label: "Di Apotek" },
  { value: "4", label: "Pembayaran" },
  { value: "5", label: "Selesai" },
];

export function RekamListPage() {
  const { hasRole } = useAuth();
  const isDokterOnly = hasRole("dokter") && !hasRole("admin", "pendaftaran");
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") ?? (isDokterOnly ? "2" : "");
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") || 1);
  const { data, isLoading } = useQuery({
    queryKey: ["rekam", status, q, page],
    queryFn: () => api.get<Page<Rekam>>(`/rekam${qs({ status, q, page })}`),
    refetchInterval: 20000,
  });
  const update = (next: Record<string, string>) => {
    const s = { status, q, ...next };
    setSp(Object.fromEntries(Object.entries(s).filter(([, v]) => v)));
  };
  const onSearch = useCallback((v: string) => update({ q: v, page: "" }), [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title="Rekam Medis"
        breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Rekam Medis" }]}
        description={isDokterOnly ? "Hanya pasien yang didaftarkan ke Anda." : "Daftarkan pasien dari halaman pasien, lalu lanjutkan ke dokter."}
        actions={
          hasRole("admin", "pendaftaran") && (
            <Link to="/app/pasien">
              <Button><Icon name="plus" size={16} /> Daftar Periksa</Button>
            </Link>
          )
        }
      />
      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pb-0">
          <Tabs tabs={TABS} value={status.includes(",") ? "" : status} onChange={(v) => update({ status: v, page: "" })} />
          <SearchBox value={q} onSearch={onSearch} placeholder="Cari pasien, No. RM, No. Rekam" />
        </CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Pasien</Th>
                <Th>Poli / Dokter</Th>
                <Th>Cara Bayar</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={6}><Spinner /></TableEmpty>}
              {data?.items.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDate(r.tgl_rekam)}<div className="text-sm text-muted">{r.no_rekam}</div></Td>
                  <Td>
                    <Link to={`/app/pasien/${r.pasien_id}`} className="font-medium">{r.pasien_nama}</Link>
                    <div className="text-sm text-muted">{r.pasien_no_rm}</div>
                  </Td>
                  <Td>{r.poli_nama}<div className="text-sm text-muted">{r.dokter_nama}</div></Td>
                  <Td>{r.cara_bayar}</Td>
                  <Td><RekamStatus status={r.status} /></Td>
                  <Td className="text-right">
                    <Link to={`/app/rekam/${r.id}`}><Button size="sm" variant={r.status < 5 ? "primary" : "light"}>{r.status < 5 ? "Proses" : "Detail"}</Button></Link>
                  </Td>
                </tr>
              ))}
              {data && data.items.length === 0 && <TableEmpty colSpan={6}>Tidak ada rekam.</TableEmpty>}
            </tbody>
          </Table>
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => update({ page: String(p) })} />}
        </CardBody>
      </Card>
    </>
  );
}
