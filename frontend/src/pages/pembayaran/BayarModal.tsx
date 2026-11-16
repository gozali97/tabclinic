import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, fieldErrors } from "../../lib/api";
import { formatIDR } from "../../lib/format";
import { METODE_BAYAR, errorMessage, type Pembayaran, type RekamDetail } from "../../lib/klinik";
import { InfoRow } from "../../components/Common";
import { Alert, Button, Input, Modal, Select } from "../../components/ui";

export function BayarModal({ open, onClose, rekam, onPaid }: { open: boolean; onClose: () => void; rekam: RekamDetail; onPaid: () => void }) {
  const navigate = useNavigate();
  const total = rekam.tagihan.total;
  const [metode, setMetode] = useState("Tunai");
  const [dibayar, setDibayar] = useState(String(total));
  const paid = Number(dibayar || 0);
  const save = useMutation({
    mutationFn: () => api.post<Pembayaran>(`/rekam/${rekam.id}/pembayaran`, { metode, dibayar: metode === "Tunai" ? paid : total }),
    onSuccess: () => {
      onPaid();
      onClose();
      navigate(`/app/pembayaran/${rekam.id}/cetak`);
    },
  });
  const err = fieldErrors(save.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Pembayaran ${rekam.pasien_nama}`}>
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <InfoRow label="Pemeriksaan">{formatIDR(rekam.tagihan.biaya_pemeriksaan)}</InfoRow>
          <InfoRow label="Tindakan">{formatIDR(rekam.tagihan.biaya_tindakan)}</InfoRow>
          <InfoRow label="Obat">{formatIDR(rekam.tagihan.biaya_obat)}</InfoRow>
          <InfoRow label="Total"><span className="text-xl font-medium">{formatIDR(total)}</span></InfoRow>
        </div>
        <Select label="Metode" value={metode} onChange={(e) => setMetode(e.target.value)} error={err.metode}>
          {METODE_BAYAR.map((m) => <option key={m}>{m}</option>)}
        </Select>
        {metode === "Tunai" && (
          <Input
            label="Uang diterima"
            type="number"
            min={total}
            value={dibayar}
            onChange={(e) => setDibayar(e.target.value)}
            error={err.dibayar}
            hint={paid >= total ? `Kembalian ${formatIDR(paid - total)}` : "Kurang dari total"}
            required
          />
        )}
        {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="light" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="success" loading={save.isPending} disabled={metode === "Tunai" && paid < total}>
            Simpan & Cetak
          </Button>
        </div>
      </form>
    </Modal>
  );
}
