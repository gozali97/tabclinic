import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/klinik";
import { Alert, Button, Icon } from "./ui";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
const MAX_BYTES = 5 * 1024 * 1024;

// Lampiran shows one JPG/PNG attachment (SI-Shina: consent, foto pemeriksaan/tindakan).
// The image is served by the API with the session cookie, so <img src> works same-origin.
export function Lampiran({ label, path, exists, editable, onChange }: {
  label: string;
  path: string; // e.g. /pasien/{id}/consent
  exists: boolean;
  editable: boolean;
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const done = () => {
    setVersion((v) => v + 1);
    onChange();
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload(path, form);
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api.delete(path), onSuccess: done });
  const pick = (file?: File) => {
    setLocalError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return setLocalError("File harus berupa gambar JPG atau PNG");
    if (file.size > MAX_BYTES) return setLocalError("Ukuran file maksimal 5 MB");
    upload.mutate(file);
  };
  const src = `${API_BASE}${path}?v=${version}`;
  const error = localError || (upload.error && errorMessage(upload.error)) || (remove.error && errorMessage(remove.error));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dark">{label}</span>
        {editable && (
          <>
            <Button size="sm" variant="light" onClick={() => input.current?.click()} loading={upload.isPending}>
              <Icon name="upload" size={14} /> {exists ? "Ganti" : "Unggah"}
            </Button>
            {exists && (
              <Button size="sm" variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending} aria-label={`Hapus ${label}`}>
                <Icon name="trash-2" size={14} className="text-danger" />
              </Button>
            )}
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {exists ? (
        <a href={src} target="_blank" rel="noreferrer" className="block w-fit" title="Buka ukuran penuh">
          <img src={src} alt={label} className="max-h-48 rounded-[2px] border border-line object-contain" />
        </a>
      ) : (
        <p className="mb-0 text-sm text-muted">Belum ada file.{editable && " JPG atau PNG, maksimal 5 MB."}</p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
