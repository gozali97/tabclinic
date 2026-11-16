import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, fieldErrors } from "../lib/api";
import { errorMessage } from "../lib/klinik";
import { Alert, Button, Input, Modal } from "./ui";

const empty = { current_password: "", new_password: "", confirm: "" };

// Ganti password sendiri (SI-Shina). The API keeps this session and signs out other devices.
export function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState(empty);
  const [mismatch, setMismatch] = useState(false);
  const save = useMutation({
    mutationFn: () => api.post("/auth/password", { current_password: f.current_password, new_password: f.new_password }),
    onSuccess: () => setF(empty),
  });
  const err = fieldErrors(save.error);
  const close = () => {
    setF(empty);
    setMismatch(false);
    save.reset();
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return setMismatch(true);
    setMismatch(false);
    save.mutate();
  };
  return (
    <Modal open={open} onClose={close} title="Ganti password">
      {save.isSuccess ? (
        <div className="grid gap-4">
          <Alert tone="success">Password sudah diganti. Sesi di perangkat lain otomatis keluar.</Alert>
          <div className="flex justify-end"><Button onClick={close}>Tutup</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Input label="Password lama" type="password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} error={err.current_password} required autoComplete="current-password" />
          <Input label="Password baru" type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} error={err.new_password} required minLength={8} maxLength={72} hint="8–72 karakter" autoComplete="new-password" />
          <Input label="Ulangi password baru" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={mismatch ? "Konfirmasi password tidak sama" : undefined} required autoComplete="new-password" />
          {save.error && !Object.keys(err).length && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="light" onClick={close}>Batal</Button>
            <Button type="submit" loading={save.isPending}>Simpan</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
