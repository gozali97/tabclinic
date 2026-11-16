import type { RekamGigi } from "../lib/klinik";
import { cx } from "./ui";

// FDI layout as seen facing the patient: upper right -> upper left, lower right -> lower left.
const ROWS: string[][] = [
  ["18", "17", "16", "15", "14", "13", "12", "11", "|", "21", "22", "23", "24", "25", "26", "27", "28"],
  ["", "", "", "55", "54", "53", "52", "51", "|", "61", "62", "63", "64", "65", "", "", ""],
  ["", "", "", "85", "84", "83", "82", "81", "|", "71", "72", "73", "74", "75", "", "", ""],
  ["48", "47", "46", "45", "44", "43", "42", "41", "|", "31", "32", "33", "34", "35", "36", "37", "38"],
];

// Condition groups for colouring (SI-Shina odontogram codes).
const TONE: Record<string, string> = {
  car: "bg-danger text-white", cfr: "bg-danger text-white", nvt: "bg-danger text-white", rrx: "bg-danger text-white",
  mis: "bg-dark text-white", une: "bg-light text-heading", imx: "bg-light text-heading",
  amf: "bg-primary text-white", gif: "bg-primary text-white", cof: "bg-primary text-white", fis: "bg-primary text-white",
  inl: "bg-primary text-white", onl: "bg-primary text-white", rct: "bg-cyan text-white",
  fmc: "bg-warning text-heading", poc: "bg-warning text-heading", mpc: "bg-warning text-heading", gmc: "bg-warning text-heading",
  ipx: "bg-success text-white", meb: "bg-success text-white", pob: "bg-success text-white", pon: "bg-success text-white", abu: "bg-success text-white",
};

interface Props {
  rows: RekamGigi[];
  /** Highlights teeth recorded in this rekam. */
  currentRekamId?: string;
  onSelect?: (tooth: string) => void;
}

/** rows must be newest first; the first row per tooth is its latest condition. */
export function Odontogram({ rows, currentRekamId, onSelect }: Props) {
  const latest = new Map<string, RekamGigi>();
  for (const r of rows) if (!latest.has(r.elemen_gigi)) latest.set(r.elemen_gigi, r);
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-cols-[repeat(17,minmax(2.25rem,1fr))] gap-1">
        {ROWS.map((row, ri) =>
          row.map((t, ci) => {
            if (t === "|") return <div key={`${ri}-${ci}`} className="mx-auto w-px bg-line-input" />;
            if (!t) return <div key={`${ri}-${ci}`} />;
            const g = latest.get(t);
            const label = g ? `Gigi ${t}: ${g.kondisi}${g.kondisi_nama ? ` (${g.kondisi_nama})` : ""} — ${g.diagnosa}` : `Gigi ${t}`;
            return (
              <button
                key={t}
                type="button"
                title={label}
                aria-label={label}
                disabled={!onSelect}
                onClick={() => onSelect?.(t)}
                className={cx(
                  "flex h-12 flex-col items-center justify-center rounded-[2px] border text-xs leading-tight",
                  g ? TONE[g.kondisi] ?? "bg-secondary text-white" : "border-line-input bg-white text-body",
                  g && g.rekam_id === currentRekamId && "ring-2 ring-primary ring-offset-1",
                  onSelect ? "cursor-pointer hover:border-primary" : "cursor-default",
                  ri === 1 || ri === 2 ? "h-10 text-[11px]" : "",
                )}
              >
                <span className="font-medium">{t}</span>
                {g && <span className="uppercase">{g.kondisi}</span>}
              </button>
            );
          }),
        )}
      </div>
      <p className="mt-3 mb-0 text-sm text-muted">
        Merah: karies/fraktur/sisa akar · Biru: tambalan/sealant · Kuning: mahkota · Hijau: implan/jembatan · Hitam: hilang.
        {onSelect ? " Klik gigi untuk mengisi pemeriksaan." : ""}
      </p>
    </div>
  );
}
