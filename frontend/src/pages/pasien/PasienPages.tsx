import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import {
  CARA_BAYAR,
  age,
  errorMessage,
  qs,
  type Page,
  type Pasien,
} from "../../lib/klinik";
import { Confirm, Pager, SearchBox } from "../../components/Common";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Icon,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  TableEmpty,
  Td,
  Textarea,
  Th,
} from "../../components/ui";

export function PasienListPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") || 1);
  const qc = useQueryClient();
  const [del, setDel] = useState<Pasien | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["pasien", q, page],
    queryFn: () => api.get<Page<Pasien>>(`/pasien${qs({ q, page })}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/pasien/${id}`),
    onSuccess: () => {
      setDel(null);
      qc.invalidateQueries({ queryKey: ["pasien"] });
    },
  });
  const onSearch = useCallback(
    (v: string) => setSp(v ? { q: v } : {}),
    [setSp],
  );

  return (
    <>
      <PageHeader
        title="Data Pasien"
        breadcrumb={[{ label: "Dashboard", to: "/app" }, { label: "Pasien" }]}
        actions={
          <Link to="/app/pasien/baru">
            <Button>
              <Icon name="user-plus" size={16} /> Pasien Baru
            </Button>
          </Link>
        }
      />
      <Card>
        <CardBody className="flex justify-end pb-0">
          <SearchBox
            value={q}
            onSearch={onSearch}
            placeholder="Cari nama, No. RM, BPJS, HP"
          />
        </CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead>
              <tr>
                <Th>No. RM</Th>
                <Th>Nama</Th>
                <Th>JK / Umur</Th>
                <Th>No. HP</Th>
                <Th>Cara Bayar</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <TableEmpty colSpan={6}>
                  <Spinner />
                </TableEmpty>
              )}
              {data?.items.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.no_rm}</Td>
                  <Td>
                    <Link to={`/app/pasien/${p.id}`} className="font-medium">
                      {p.nama}
                    </Link>
                    {p.alergi && (
                      <div className="text-sm text-danger">
                        Alergi: {p.alergi}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {p.jk === "Laki-Laki" ? "L" : "P"} / {age(p.tgl_lahir)}
                  </Td>
                  <Td>{p.no_hp}</Td>
                  <Td>
                    <Badge
                      tone={
                        p.cara_bayar === "Umum/Mandiri" ? "light" : "success"
                      }
                    >
                      {p.cara_bayar}
                    </Badge>
                    {p.no_bpjs && (
                      <div className="text-sm text-muted">{p.no_bpjs}</div>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Link to={`/app/pasien/${p.id}`}>
                      <Button size="sm" variant="success" title="Rekam medis">
                        <Icon name="file-text" size={14} /> Rekam
                      </Button>
                    </Link>{" "}
                    <Link to={`/app/pasien/${p.id}/edit`}>
                      <Button size="sm" variant="light" aria-label="Ubah">
                        <Icon name="edit-2" size={14} />
                      </Button>
                    </Link>{" "}
                    <Button
                      size="sm"
                      variant="light"
                      aria-label="Hapus"
                      onClick={() => setDel(p)}
                    >
                      <Icon name="trash-2" size={14} className="text-danger" />
                    </Button>
                  </Td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <TableEmpty colSpan={6}>Belum ada pasien.</TableEmpty>
              )}
            </tbody>
          </Table>
          {data && (
            <Pager
              page={data.page}
              size={data.size}
              total={data.total}
              onPage={(p) => setSp({ ...(q ? { q } : {}), page: String(p) })}
            />
          )}
        </CardBody>
      </Card>
      <Confirm
        open={!!del}
        title="Hapus pasien"
        onCancel={() => {
          setDel(null);
          remove.reset();
        }}
        onConfirm={() => del && remove.mutate(del.id)}
        loading={remove.isPending}
      >
        <p>
          Hapus <b>{del?.nama}</b> ({del?.no_rm})? Pasien yang sudah punya rekam
          medis tidak bisa dihapus.
        </p>
        {remove.error && (
          <Alert tone="danger" className="mt-3">
            {errorMessage(remove.error)}
          </Alert>
        )}
      </Confirm>
    </>
  );
}

type Form = Record<string, string>;
const empty: Form = {
  kategori: "D",
  no_rm: "",
  nama: "",
  tmp_lahir: "",
  tgl_lahir: "",
  jk: "",
  alamat_lengkap: "",
  kelurahan: "",
  kecamatan: "",
  kabupaten: "",
  kodepos: "",
  agama: "Islam",
  status_menikah: "",
  pendidikan: "",
  pekerjaan: "",
  kewarganegaraan: "WNI",
  no_hp: "",
  cara_bayar: "Umum/Mandiri",
  no_bpjs: "",
  alergi: "",
};
const AGAMA = ["Islam", "Kristen", "Katholik", "Hindu", "Budha", "Konghucu"];
const PENDIDIKAN = [
  "SD",
  "SMP",
  "SMA",
  "Diploma",
  "S1",
  "S2",
  "S3",
  "Tidak Sekolah",
];
const PEKERJAAN = [
  "PNS",
  "Wiraswasta",
  "TNI/Polri",
  "Pelajar/Mahasiswa",
  "Petani",
  "Guru/Pengajar",
  "IRT",
  "Lain-Lain",
];
const MENIKAH = ["Belum Menikah", "Menikah", "Duda", "Janda"];

export function PasienFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const permintaanID = editing ? null : sp.get("permintaan");
  const [f, setF] = useState<Form>(() =>
    editing
      ? empty
      : { ...empty, nama: sp.get("nama") ?? "", no_hp: sp.get("no_hp") ?? "" },
  );
  const existing = useQuery({
    queryKey: ["pasien", id],
    queryFn: () => api.get<Pasien>(`/pasien/${id}`),
    enabled: editing,
  });
  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    const next: Form = { ...empty };
    for (const k of Object.keys(empty)) {
      const v = (p as unknown as Record<string, unknown>)[k];
      if (typeof v === "string")
        next[k] = k === "tgl_lahir" ? v.slice(0, 10) : v;
    }
    setF(next);
  }, [existing.data]);
  const set = (k: string) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  // SI-Shina: nomor RM = kategori (D/A) + huruf awal nama + urut 3 digit.
  const genRM = useMutation({
    mutationFn: () =>
      api.get<{ no_rm: string }>(
        `/pasien/next-rm${qs({ kategori: f.kategori, nama: f.nama })}`,
      ),
    onSuccess: (r) => setF((s) => ({ ...s, no_rm: r.no_rm })),
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(f))
        if (k !== "kategori") body[k] = v.trim() === "" ? null : v;
      body.no_rm = f.no_rm;
      body.nama = f.nama;
      body.no_hp = f.no_hp;
      if (permintaanID) body.permintaan_id = permintaanID;
      return editing
        ? api.patch(`/pasien/${id}`, body)
        : api.post<{ id: string }>("/pasien", body);
    },
    onSuccess: async (r) => {
      qc.invalidateQueries({ queryKey: ["pasien"] });
      const pid = editing ? id : (r as { id: string }).id;
      if (permintaanID && pid) {
        qc.invalidateQueries({ queryKey: ["permintaan"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      navigate(`/app/pasien/${pid}`);
    },
  });
  const err = fieldErrors(save.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  if (editing && existing.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={editing ? "Ubah Pasien" : "Pasien Baru"}
        breadcrumb={[
          { label: "Dashboard", to: "/app" },
          { label: "Pasien", to: "/app/pasien" },
          { label: editing ? "Ubah" : "Baru" },
        ]}
      />
      <form onSubmit={submit}>
        <Card>
          <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Input
              label="Nama lengkap *"
              value={f.nama}
              onChange={set("nama")}
              error={err.nama}
              required
              autoFocus
            />
            <div className="flex items-end gap-2">
              {!editing && (
                <Select
                  label="Kategori"
                  value={f.kategori}
                  onChange={set("kategori")}
                  containerClassName="w-32"
                >
                  <option value="D">Dewasa</option>
                  <option value="A">Anak</option>
                </Select>
              )}
              <Input
                label="No. RM *"
                value={f.no_rm}
                onChange={set("no_rm")}
                error={
                  err.no_rm ||
                  (genRM.error ? errorMessage(genRM.error) : undefined)
                }
                required
                containerClassName="flex-1"
              />
              {!editing && (
                <Button
                  variant="light"
                  onClick={() => genRM.mutate()}
                  loading={genRM.isPending}
                  disabled={!f.nama.trim()}
                  title="Buat nomor RM otomatis"
                >
                  <Icon name="refresh-cw" size={16} />
                </Button>
              )}
            </div>
            <Select
              label="Jenis kelamin *"
              value={f.jk}
              onChange={set("jk")}
              error={err.jk}
              required
            >
              <option value="">-- Pilih --</option>
              <option>Laki-Laki</option>
              <option>Perempuan</option>
            </Select>
            <Input
              label="Tempat lahir"
              value={f.tmp_lahir}
              onChange={set("tmp_lahir")}
            />
            <Input
              label="Tanggal lahir"
              type="date"
              value={f.tgl_lahir}
              onChange={set("tgl_lahir")}
              error={err.tgl_lahir}
            />
            <Input
              label="No. HP *"
              value={f.no_hp}
              onChange={set("no_hp")}
              error={err.no_hp}
              inputMode="tel"
              required
            />
            <Select
              label="Cara bayar *"
              value={f.cara_bayar}
              onChange={set("cara_bayar")}
              error={err.cara_bayar}
            >
              {CARA_BAYAR.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Input
              label={`No. BPJS${f.cara_bayar === "Jaminan Kesehatan" ? " *" : ""}`}
              value={f.no_bpjs}
              onChange={set("no_bpjs")}
              error={err.no_bpjs}
              inputMode="numeric"
              maxLength={13}
              hint="13 digit"
            />
            <Input
              label="Alergi"
              value={f.alergi}
              onChange={set("alergi")}
              placeholder="Kosongkan bila tidak ada"
            />
            <Textarea
              label="Alamat lengkap"
              value={f.alamat_lengkap}
              onChange={set("alamat_lengkap")}
              rows={2}
              containerClassName="md:col-span-2 xl:col-span-3"
            />
            <Input
              label="Kelurahan"
              value={f.kelurahan}
              onChange={set("kelurahan")}
            />
            <Input
              label="Kecamatan"
              value={f.kecamatan}
              onChange={set("kecamatan")}
            />
            <Input
              label="Kabupaten/Kota"
              value={f.kabupaten}
              onChange={set("kabupaten")}
            />
            <Input
              label="Kode pos"
              value={f.kodepos}
              onChange={set("kodepos")}
              inputMode="numeric"
            />
            <Select label="Agama" value={f.agama} onChange={set("agama")}>
              <option value="">-</option>
              {AGAMA.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Status menikah"
              value={f.status_menikah}
              onChange={set("status_menikah")}
              error={err.status_menikah}
            >
              <option value="">-</option>
              {MENIKAH.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Pendidikan"
              value={f.pendidikan}
              onChange={set("pendidikan")}
            >
              <option value="">-</option>
              {PENDIDIKAN.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Pekerjaan"
              value={f.pekerjaan}
              onChange={set("pekerjaan")}
            >
              <option value="">-</option>
              {PEKERJAAN.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Kewarganegaraan"
              value={f.kewarganegaraan}
              onChange={set("kewarganegaraan")}
            >
              <option>WNI</option>
              <option>WNA</option>
            </Select>
          </CardBody>
          <CardBody className="flex items-center justify-end gap-2 border-t border-line">
            {save.error && !Object.keys(err).length && (
              <Alert tone="danger" className="mr-auto">
                {errorMessage(save.error)}
              </Alert>
            )}
            <Button variant="light" onClick={() => navigate(-1)}>
              Batal
            </Button>
            <Button type="submit" loading={save.isPending}>
              Simpan
            </Button>
          </CardBody>
        </Card>
      </form>
    </>
  );
}
