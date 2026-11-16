import { useCallback, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatIDR } from "../../lib/format";
import { ROLE_LABEL, errorMessage, qs, type Dokter, type ICD, type Page, type Poli, type Tindakan } from "../../lib/klinik";
import { Confirm, Pager, SearchBox } from "../../components/Common";
import { Alert, Badge, Button, Card, CardBody, Icon, Input, Modal, PageHeader, Select, Spinner, Table, TableEmpty, Td, Th } from "../../components/ui";

const crumbs = (label: string) => [{ label: "Dashboard", to: "/app" }, { label: "Master Data" }, { label }];

function usePoli() {
  return useQuery({ queryKey: ["poli"], queryFn: () => api.get<Poli[]>("/poli") });
}

// ===== Poli =====
export function PoliPage() {
  const qc = useQueryClient();
  const { data, isLoading } = usePoli();
  const [form, setForm] = useState<{ id?: string; nama: string; is_gigi: boolean; biaya: string; is_active: boolean } | null>(null);
  const [del, setDel] = useState<Poli | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { nama: form!.nama, is_gigi: form!.is_gigi, biaya_pemeriksaan: Number(form!.biaya), is_active: form!.is_active };
      return form!.id ? api.patch(`/poli/${form!.id}`, body) : api.post("/poli", body);
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["poli"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/poli/${id}`), onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ["poli"] }); } });
  const err = fieldErrors(save.error);
  return (
    <>
      <PageHeader title="Poli" breadcrumb={crumbs("Poli")} actions={<Button onClick={() => { save.reset(); setForm({ nama: "", is_gigi: false, biaya: "0", is_active: true }); }}><Icon name="plus" size={16} /> Tambah Poli</Button>} />
      <Card>
        <CardBody className="p-0!">
          <Table>
            <thead><tr><Th>Nama</Th><Th>Jenis</Th><Th className="text-right">Biaya pemeriksaan</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={5}><Spinner /></TableEmpty>}
              {data?.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.nama}</Td>
                  <Td>{p.is_gigi ? "Gigi (odontogram)" : "Umum"}</Td>
                  <Td className="text-right">{formatIDR(p.biaya_pemeriksaan)}</Td>
                  <Td>{p.is_active ? <Badge tone="success">Aktif</Badge> : <Badge tone="light">Nonaktif</Badge>}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ id: p.id, nama: p.nama, is_gigi: p.is_gigi, biaya: String(p.biaya_pemeriksaan), is_active: p.is_active }); }}><Icon name="edit-2" size={14} /></Button>{" "}
                    <Button size="sm" variant="light" aria-label="Hapus" onClick={() => { remove.reset(); setDel(p); }}><Icon name="trash-2" size={14} className="text-danger" /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Ubah Poli" : "Tambah Poli"}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4">
            <Input label="Nama *" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} error={err.nama} required autoFocus />
            <Input label="Biaya pemeriksaan (Rp)" type="number" min={0} value={form.biaya} onChange={(e) => setForm({ ...form, biaya: e.target.value })} error={err.biaya_pemeriksaan} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_gigi} onChange={(e) => setForm({ ...form, is_gigi: e.target.checked })} /> Poli gigi (pakai odontogram)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
            {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="light" onClick={() => setForm(null)}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan</Button></div>
          </form>
        </Modal>
      )}
      <Confirm open={!!del} title="Hapus poli" onCancel={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}>
        <p>Hapus {del?.nama}? Poli yang sudah dipakai dokter atau rekam tidak bisa dihapus; nonaktifkan saja.</p>
        {remove.error && <Alert tone="danger" className="mt-3">{errorMessage(remove.error)}</Alert>}
      </Confirm>
    </>
  );
}

// ===== Dokter =====
const emptyDokter = { email: "", password: "", nip: "", nama: "", no_hp: "", alamat: "", poli_id: "", is_active: true };

export function DokterPage() {
  const qc = useQueryClient();
  const poli = usePoli();
  const { data, isLoading } = useQuery({ queryKey: ["dokter"], queryFn: () => api.get<Dokter[]>("/dokter") });
  const [form, setForm] = useState<{ id?: string; v: typeof emptyDokter } | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const v = form!.v;
      const body = { ...v, nip: v.nip || null, alamat: v.alamat || null };
      return form!.id ? api.patch(`/dokter/${form!.id}`, body) : api.post("/dokter", body);
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["dokter"] }); },
  });
  const err = fieldErrors(save.error);
  const set = (k: keyof typeof emptyDokter, v: string | boolean) => setForm((f) => f && { ...f, v: { ...f.v, [k]: v } });
  return (
    <>
      <PageHeader title="Dokter" breadcrumb={crumbs("Dokter")} description="Setiap dokter punya akun login sendiri dan hanya melihat pasien yang didaftarkan kepadanya."
        actions={<Button onClick={() => { save.reset(); setForm({ v: { ...emptyDokter, poli_id: poli.data?.[0]?.id ?? "" } }); }}><Icon name="plus" size={16} /> Tambah Dokter</Button>} />
      <Card>
        <CardBody className="p-0!">
          <Table>
            <thead><tr><Th>Nama</Th><Th>Poli</Th><Th>Email login</Th><Th>No. HP</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={6}><Spinner /></TableEmpty>}
              {data?.map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium">{d.nama}{d.nip && <div className="text-sm font-normal text-muted">NIP {d.nip}</div>}</Td>
                  <Td>{d.poli_nama}</Td>
                  <Td>{d.email}</Td>
                  <Td>{d.no_hp}</Td>
                  <Td>{d.is_active ? <Badge tone="success">Aktif</Badge> : <Badge tone="light">Nonaktif</Badge>}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ id: d.id, v: { email: d.email, password: "", nip: d.nip ?? "", nama: d.nama, no_hp: d.no_hp, alamat: d.alamat ?? "", poli_id: d.poli_id, is_active: d.is_active } }); }}><Icon name="edit-2" size={14} /></Button>
                  </Td>
                </tr>
              ))}
              {data && data.length === 0 && <TableEmpty colSpan={6}>Belum ada dokter.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Ubah Dokter" : "Tambah Dokter"}>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2">
            <Input label="Nama *" value={form.v.nama} onChange={(e) => set("nama", e.target.value)} error={err.nama} required autoFocus containerClassName="sm:col-span-2" />
            <Input label="NIP" value={form.v.nip} onChange={(e) => set("nip", e.target.value)} />
            <Input label="No. HP *" value={form.v.no_hp} onChange={(e) => set("no_hp", e.target.value)} error={err.no_hp} required />
            <Select label="Poli *" value={form.v.poli_id} onChange={(e) => set("poli_id", e.target.value)} error={err.poli_id} required containerClassName="sm:col-span-2">
              {poli.data?.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </Select>
            <Input label="Alamat" value={form.v.alamat} onChange={(e) => set("alamat", e.target.value)} containerClassName="sm:col-span-2" />
            <Input label="Email login *" type="email" value={form.v.email} onChange={(e) => set("email", e.target.value)} error={err.email} required disabled={!!form.id} />
            <Input label={form.id ? "Password baru" : "Password *"} type="password" value={form.v.password} onChange={(e) => set("password", e.target.value)} error={err.password} required={!form.id} minLength={8} hint={form.id ? "Kosongkan bila tidak diganti" : "8–72 karakter"} autoComplete="new-password" />
            {form.id && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={form.v.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Aktif (nonaktif = tidak bisa login dan tidak muncul di pendaftaran)</label>}
            {save.error && !Object.keys(err).length && <Alert tone="danger" className="sm:col-span-2">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="light" onClick={() => setForm(null)}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ===== Tindakan =====
export function TindakanPage() {
  const qc = useQueryClient();
  const poli = usePoli();
  const [poliID, setPoliID] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["tindakan", poliID], queryFn: () => api.get<Tindakan[]>(`/tindakan${qs({ poli_id: poliID })}`) });
  const [form, setForm] = useState<{ id?: string; poli_id: string; kode: string; nama: string; harga: string } | null>(null);
  const [del, setDel] = useState<Tindakan | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { poli_id: form!.poli_id, kode: form!.kode, nama: form!.nama, harga: Number(form!.harga) };
      return form!.id ? api.patch(`/tindakan/${form!.id}`, body) : api.post("/tindakan", body);
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["tindakan"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/tindakan/${id}`), onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ["tindakan"] }); } });
  const err = fieldErrors(save.error);
  return (
    <>
      <PageHeader title="Tindakan" breadcrumb={crumbs("Tindakan")} actions={<Button onClick={() => { save.reset(); setForm({ poli_id: poliID || poli.data?.[0]?.id || "", kode: "", nama: "", harga: "0" }); }}><Icon name="plus" size={16} /> Tambah Tindakan</Button>} />
      <Card>
        <CardBody className="flex justify-end pb-0">
          <Select value={poliID} onChange={(e) => setPoliID(e.target.value)} aria-label="Filter poli" containerClassName="w-56">
            <option value="">Semua poli</option>
            {poli.data?.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </Select>
        </CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead><tr><Th>Kode</Th><Th>Nama</Th><Th>Poli</Th><Th className="text-right">Tarif</Th><Th /></tr></thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={5}><Spinner /></TableEmpty>}
              {data?.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium">{t.kode}</Td>
                  <Td>{t.nama}</Td>
                  <Td>{t.poli_nama}</Td>
                  <Td className="text-right">{formatIDR(t.harga)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ id: t.id, poli_id: t.poli_id, kode: t.kode, nama: t.nama, harga: String(t.harga) }); }}><Icon name="edit-2" size={14} /></Button>{" "}
                    <Button size="sm" variant="light" aria-label="Hapus" onClick={() => { remove.reset(); setDel(t); }}><Icon name="trash-2" size={14} className="text-danger" /></Button>
                  </Td>
                </tr>
              ))}
              {data && data.length === 0 && <TableEmpty colSpan={5}>Belum ada tindakan.</TableEmpty>}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Ubah Tindakan" : "Tambah Tindakan"}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4">
            <Select label="Poli *" value={form.poli_id} onChange={(e) => setForm({ ...form, poli_id: e.target.value })} error={err.poli_id} required>
              {poli.data?.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </Select>
            <Input label="Kode *" value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} error={err.kode} required />
            <Input label="Nama *" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} error={err.nama} required />
            <Input label="Tarif (Rp)" type="number" min={0} value={form.harga} onChange={(e) => setForm({ ...form, harga: e.target.value })} error={err.harga} />
            {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="light" onClick={() => setForm(null)}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan</Button></div>
          </form>
        </Modal>
      )}
      <Confirm open={!!del} title="Hapus tindakan" onCancel={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}>
        <p>Hapus {del?.nama}?</p>
        {remove.error && <Alert tone="danger" className="mt-3">{errorMessage(remove.error)}</Alert>}
      </Confirm>
    </>
  );
}

// ===== ICD-10 =====
export function IcdPage() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") || 1);
  const { data, isLoading } = useQuery({ queryKey: ["icd", "admin", q, page], queryFn: () => api.get<Page<ICD>>(`/icd${qs({ q, page })}`) });
  const [form, setForm] = useState<{ old?: string; code: string; name_id: string; name_en: string } | null>(null);
  const [del, setDel] = useState<ICD | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { code: form!.code, name_id: form!.name_id || null, name_en: form!.name_en || null };
      return form!.old ? api.patch(`/icd/${encodeURIComponent(form!.old)}`, body) : api.post("/icd", body);
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["icd"] }); },
  });
  const remove = useMutation({ mutationFn: (code: string) => api.delete(`/icd/${encodeURIComponent(code)}`), onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ["icd"] }); } });
  // CSV is sent as the raw body; same-origin fetch keeps the session cookie and passes CSRF checks.
  const imp = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || "/api/v1"}/icd/import`, { method: "POST", credentials: "include", headers: { "Content-Type": "text/csv" }, body: file });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.fields?.file || json.error?.message || "Impor gagal");
      return json.data as { imported: number };
    },
    onSuccess: (r) => { setImported(`${r.imported} kode diimpor.`); qc.invalidateQueries({ queryKey: ["icd"] }); },
    onError: () => setImported(null),
  });
  const err = fieldErrors(save.error);
  const onSearch = useCallback((v: string) => setSp(v ? { q: v } : {}), [setSp]);
  return (
    <>
      <PageHeader
        title="ICD-10"
        breadcrumb={crumbs("ICD")}
        description="Impor CSV berkolom: code, name_id, name_en. Gunakan daftar ICD-10 resmi yang lisensinya dimiliki klinik."
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ""; }} />
            <Button variant="light" onClick={() => fileRef.current?.click()} loading={imp.isPending}><Icon name="upload" size={16} /> Impor CSV</Button>
            <Button onClick={() => { save.reset(); setForm({ code: "", name_id: "", name_en: "" }); }}><Icon name="plus" size={16} /> Tambah</Button>
          </>
        }
      />
      {imported && <Alert tone="success" className="mb-4" onClose={() => setImported(null)}>{imported}</Alert>}
      {imp.error && <Alert tone="danger" className="mb-4">{(imp.error as Error).message}</Alert>}
      <Card>
        <CardBody className="flex justify-end pb-0"><SearchBox value={q} onSearch={onSearch} placeholder="Cari kode / nama" /></CardBody>
        <CardBody className="p-0!">
          <Table>
            <thead><tr><Th>Kode</Th><Th>Nama (Indonesia)</Th><Th>Nama (Inggris)</Th><Th /></tr></thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={4}><Spinner /></TableEmpty>}
              {data?.items.map((i) => (
                <tr key={i.code}>
                  <Td className="font-medium">{i.code}</Td>
                  <Td>{i.name_id ?? "-"}</Td>
                  <Td>{i.name_en ?? "-"}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ old: i.code, code: i.code, name_id: i.name_id ?? "", name_en: i.name_en ?? "" }); }}><Icon name="edit-2" size={14} /></Button>{" "}
                    <Button size="sm" variant="light" aria-label="Hapus" onClick={() => setDel(i)}><Icon name="trash-2" size={14} className="text-danger" /></Button>
                  </Td>
                </tr>
              ))}
              {data && data.items.length === 0 && <TableEmpty colSpan={4}>Tidak ada kode.</TableEmpty>}
            </tbody>
          </Table>
          {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => setSp({ ...(q ? { q } : {}), page: String(p) })} />}
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.old ? "Ubah ICD" : "Tambah ICD"}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4">
            <Input label="Kode *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} error={err.code} required />
            <Input label="Nama (Indonesia)" value={form.name_id} onChange={(e) => setForm({ ...form, name_id: e.target.value })} error={err.name_id} />
            <Input label="Nama (Inggris)" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="light" onClick={() => setForm(null)}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan</Button></div>
          </form>
        </Modal>
      )}
      <Confirm open={!!del} title="Hapus ICD" onCancel={() => setDel(null)} onConfirm={() => del && remove.mutate(del.code)} loading={remove.isPending}>
        Hapus {del?.code}? Diagnosa yang sudah tercatat di rekam tidak berubah.
      </Confirm>
    </>
  );
}

// ===== Petugas (akun admin/pendaftaran/apotek) =====
interface UserRow { id: string; email: string; full_name: string; status: string; roles: string[] }
const STAFF_ROLES = ["admin", "pendaftaran", "apotek"];

export function PetugasPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: UserRow[] }>("/users") });
  const [form, setForm] = useState<{ id?: string; email: string; full_name: string; password: string; roles: string[]; active: boolean } | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      if (f.id) return api.patch(`/users/${f.id}`, { full_name: f.full_name, roles: f.roles, status: f.active ? "active" : "inactive", ...(f.password ? { password: f.password } : {}) });
      return api.post(`/companies/${me!.company_id}/users`, { email: f.email, full_name: f.full_name, password: f.password, roles: f.roles });
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ["users"] }); },
  });
  const err = fieldErrors(save.error);
  // Dokter accounts are managed from the Dokter page.
  const staff = data?.users.filter((u) => !u.roles.includes("dokter")) ?? [];
  const toggle = (r: string) => setForm((f) => f && { ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] });
  return (
    <>
      <PageHeader title="Petugas" breadcrumb={crumbs("Petugas")} description="Akun admin, pendaftaran dan apotek. Akun dokter diatur di menu Dokter."
        actions={<Button onClick={() => { save.reset(); setForm({ email: "", full_name: "", password: "", roles: ["pendaftaran"], active: true }); }}><Icon name="user-plus" size={16} /> Tambah Petugas</Button>} />
      <Card>
        <CardBody className="p-0!">
          <Table>
            <thead><tr><Th>Nama</Th><Th>Email</Th><Th>Peran</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {isLoading && <TableEmpty colSpan={5}><Spinner /></TableEmpty>}
              {staff.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium">{u.full_name}</Td>
                  <Td>{u.email}</Td>
                  <Td className="space-x-1">{u.roles.map((r) => <Badge key={r} tone="light">{ROLE_LABEL[r] ?? r}</Badge>)}</Td>
                  <Td>{u.status === "active" ? <Badge tone="success">Aktif</Badge> : <Badge tone="light">Nonaktif</Badge>}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="light" aria-label="Ubah" onClick={() => { save.reset(); setForm({ id: u.id, email: u.email, full_name: u.full_name, password: "", roles: u.roles, active: u.status === "active" }); }}><Icon name="edit-2" size={14} /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.id ? "Ubah Petugas" : "Tambah Petugas"}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4">
            <Input label="Nama *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={err.full_name} required autoFocus />
            <Input label="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={err.email} required disabled={!!form.id} />
            <Input label={form.id ? "Password baru" : "Password *"} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={err.password} required={!form.id} minLength={8} hint={form.id ? "Kosongkan bila tidak diganti" : "8–72 karakter"} autoComplete="new-password" />
            <fieldset>
              <legend className="mb-2 text-dark">Peran *</legend>
              <div className="flex flex-wrap gap-4">
                {STAFF_ROLES.map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggle(r)} /> {ROLE_LABEL[r]}</label>)}
              </div>
              {err.roles && <small className="text-danger">{err.roles}</small>}
            </fieldset>
            {form.id && <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Aktif</label>}
            {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="light" onClick={() => setForm(null)}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
