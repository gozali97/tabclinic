// Types mirror backend/internal/klinik. Status rekam follows SI-Shina 1..5.
import type { BadgeTone } from "../components/ui";
import { ApiError } from "./api";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface Poli {
  id: string;
  nama: string;
  is_gigi: boolean;
  biaya_pemeriksaan: number;
  is_active: boolean;
}

export interface Dokter {
  id: string;
  user_id: string;
  email: string;
  nip: string | null;
  nama: string;
  no_hp: string;
  alamat: string | null;
  poli_id: string;
  poli_nama: string;
  is_active: boolean;
}

export interface Pasien {
  id: string;
  no_rm: string;
  nama: string;
  tmp_lahir: string | null;
  tgl_lahir: string | null;
  jk: "Laki-Laki" | "Perempuan";
  alamat_lengkap: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten: string | null;
  kodepos: string | null;
  agama: string | null;
  status_menikah: string | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  kewarganegaraan: "WNI" | "WNA";
  no_hp: string;
  cara_bayar: CaraBayar;
  no_bpjs: string | null;
  alergi: string | null;
  created_at: string;
  has_consent: boolean;
}

export interface Obat {
  id: string;
  kd_obat: string | null;
  nama: string;
  satuan: string;
  stok: number;
  harga: number;
  is_bpjs: boolean;
}

export interface Tindakan {
  id: string;
  poli_id: string;
  poli_nama: string;
  kode: string;
  nama: string;
  harga: number;
}

export interface ICD {
  code: string;
  name_id: string | null;
  name_en: string | null;
}

export interface KondisiGigi {
  kode: string;
  nama: string | null;
}

export type CaraBayar = "Umum/Mandiri" | "Jaminan Kesehatan";
export const CARA_BAYAR: CaraBayar[] = ["Umum/Mandiri", "Jaminan Kesehatan"];

export interface Rekam {
  id: string;
  no_rekam: string;
  tgl_rekam: string;
  pasien_id: string;
  pasien_nama: string;
  pasien_no_rm: string;
  dokter_id: string;
  dokter_nama: string;
  poli_id: string;
  poli_nama: string;
  is_gigi: boolean;
  keluhan: string;
  pemeriksaan: string | null;
  tindakan: string | null;
  resep_obat: string | null;
  cara_bayar: CaraBayar;
  biaya_pemeriksaan: number;
  status: number;
  status_label: string;
  petugas_nama: string;
  created_at: string;
  has_pemeriksaan_file: boolean;
  has_tindakan_file: boolean;
}

export interface RekamGigi {
  id: string;
  rekam_id: string;
  elemen_gigi: string;
  kondisi: string;
  kondisi_nama: string | null;
  diagnosa: string;
  tindakan_id: string | null;
  tindakan_nama: string | null;
  harga: number;
  tgl_rekam: string;
}

export interface PengeluaranRow {
  id: string;
  rekam_id: string;
  no_rekam: string;
  pasien_nama: string;
  obat_id: string;
  obat_nama: string;
  kd_obat: string | null;
  jumlah: number;
  satuan: string | null;
  harga: number;
  subtotal: number;
  keterangan: string | null;
  petugas: string;
  created_at: string;
}

export interface Pembayaran {
  id: string;
  rekam_id: string;
  no_rekam: string;
  pasien_nama: string;
  pasien_no_rm: string;
  biaya_pemeriksaan: number;
  biaya_tindakan: number;
  biaya_obat: number;
  total: number;
  dibayar: number;
  kembalian: number;
  metode: string;
  petugas: string;
  created_at: string;
}

export interface RekamDetail extends Rekam {
  diagnosa: { id: string; icd_code: string; icd_name: string | null }[];
  tindakan_list: { id: string; tindakan_id: string; nama: string; harga: number }[];
  gigi: RekamGigi[];
  obat: PengeluaranRow[];
  pembayaran: Pembayaran | null;
  tagihan: {
    biaya_pemeriksaan: number;
    biaya_tindakan: number;
    biaya_obat: number;
    total: number;
  };
}

export const STATUS: Record<number, { label: string; tone: BadgeTone }> = {
  1: { label: "Antrian", tone: "warning" },
  2: { label: "Pemeriksaan", tone: "info" },
  3: { label: "Di Apotek", tone: "orange" },
  4: { label: "Pembayaran", tone: "danger" },
  5: { label: "Selesai", tone: "success" },
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  pendaftaran: "Pendaftaran",
  dokter: "Dokter",
  apotek: "Apotek",
};

export const METODE_BAYAR = ["Tunai", "Transfer", "Kartu Debit", "QRIS"];

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const f = err.fields ? Object.values(err.fields)[0] : undefined;
    return f || err.message;
  }
  return "Terjadi kesalahan";
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(v: string): string {
  return new Date(v).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function today(): string {
  // Clinic wall-clock date (Asia/Jakarta), matching the backend's CURRENT_DATE.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

export function age(tgl: string | null): string {
  if (!tgl) return "-";
  const b = new Date(`${tgl.slice(0, 10)}T00:00:00`);
  const n = new Date();
  let y = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) y--;
  return `${y} th`;
}

export function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}
