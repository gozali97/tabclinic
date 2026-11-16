import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatIDR } from "../../lib/format";
import { STATUS, qs, type Page, type Rekam, formatDate } from "../../lib/klinik";
import { RekamStatus } from "../../components/Common";
import { Alert, Card, CardBody, CardHeader, PageHeader, Spinner, StatCard, Table, TableEmpty, Td, Th } from "../../components/ui";

interface Dashboard {
  periksa_hari_ini: number;
  antri_hari_ini: number;
  periksa_bulan_ini: number;
  periksa_tahun_ini: number;
  total_pasien: number;
  per_status: number[];
  permintaan_obat: number;
  total_obat: number;
  obat_keluar_hari_ini: number;
  stok_menipis: number;
  pendapatan_hari_ini: number;
  menunggu_bayar: number;
  filtered_by_dokter: boolean;
  permintaan_janji_baru: number;
}

export function DashboardPage() {
  const { me, hasRole } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), refetchInterval: 30000 });
  const isApotek = hasRole("apotek") && !hasRole("admin");
  const isDokter = hasRole("dokter") && !hasRole("admin", "pendaftaran");
  const worklistStatus = isApotek ? "3" : isDokter ? "2" : "1,2,3,4";
  const worklist = useQuery({
    queryKey: ["rekam", "dashboard", worklistStatus],
    queryFn: () => api.get<Page<Rekam>>(`/rekam${qs({ status: worklistStatus, size: 8 })}`),
    refetchInterval: 30000,
  });

  return (
    <>
      <PageHeader title={`Selamat datang, ${me?.full_name ?? ""}`} breadcrumb={[{ label: "Dashboard" }]} />
      {error && <Alert tone="danger">Gagal memuat dashboard.</Alert>}
      {!!data?.permintaan_janji_baru && (
        <Alert tone="warning" className="mb-4">
          Ada <b>{data.permintaan_janji_baru}</b> permintaan janji baru dari website.{" "}
          <Link to="/app/permintaan-janji">Tindak lanjuti</Link>
        </Alert>
      )}
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-[30px] grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
            {isApotek ? (
              <>
                <StatCard value={data.permintaan_obat} label="Permintaan resep" icon="inbox" />
                <StatCard value={data.obat_keluar_hari_ini} label="Obat keluar hari ini" icon="package" />
                <StatCard value={data.total_obat} label="Jenis obat" icon="archive" />
                <StatCard value={data.stok_menipis} label="Stok ≤ 10" icon="alert-triangle" badge={data.stok_menipis ? { text: "cek", tone: "danger" } : undefined} />
              </>
            ) : (
              <>
                <StatCard value={data.periksa_hari_ini} label={data.filtered_by_dokter ? "Pasien saya hari ini" : "Periksa hari ini"} icon="activity" />
                <StatCard value={data.antri_hari_ini} label="Antri / diperiksa hari ini" icon="clock" />
                <StatCard value={data.periksa_bulan_ini} label="Periksa bulan ini" icon="calendar" />
                {data.filtered_by_dokter ? (
                  <StatCard value={data.periksa_tahun_ini} label="Periksa tahun ini" icon="bar-chart-2" />
                ) : (
                  <StatCard value={formatIDR(data.pendapatan_hari_ini)} label="Pembayaran hari ini" icon="credit-card" />
                )}
              </>
            )}
          </div>
          <Card className="mb-[30px]">
            <CardHeader title="Rekam berjalan" subtitle="Jumlah rekam per tahap alur" />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {data.per_status.map((n, i) => (
                  <Link key={i} to={`/app/rekam?status=${i + 1}`} className="rounded-md border border-line p-3 text-center no-underline hover:border-primary">
                    <div className="text-2xl font-medium text-dark">{n}</div>
                    <div className="text-sm text-muted">{STATUS[i + 1].label}{i === 4 ? " (hari ini)" : ""}</div>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
      <Card>
        <CardHeader
          title={isApotek ? "Permintaan resep" : isDokter ? "Pasien menunggu pemeriksaan" : "Rekam belum selesai"}
          actions={
            <Link to={isApotek ? "/app/apotek" : `/app/rekam?status=${worklistStatus}`} className="text-sm">
              Lihat semua
            </Link>
          }
        />
        <CardBody className="p-0!">
          <Table plain>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Pasien</Th>
                <Th>Poli / Dokter</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(worklist.data?.items ?? []).map((r) => (
                <tr key={r.id}>
                  <Td>{formatDate(r.tgl_rekam)}</Td>
                  <Td>
                    <Link to={isApotek ? `/app/apotek/${r.id}` : `/app/rekam/${r.id}`} className="font-medium">
                      {r.pasien_nama}
                    </Link>
                    <div className="text-sm text-muted">{r.pasien_no_rm}</div>
                  </Td>
                  <Td>
                    {r.poli_nama}
                    <div className="text-sm text-muted">{r.dokter_nama}</div>
                  </Td>
                  <Td>
                    <RekamStatus status={r.status} />
                  </Td>
                </tr>
              ))}
              {worklist.data && worklist.data.items.length === 0 && <TableEmpty colSpan={4}>Tidak ada antrean.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </>
  );
}
