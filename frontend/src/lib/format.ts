const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatIDR(amount: number) {
  return idr.format(amount);
}

export function maskNIK(nik?: string) {
  if (!nik) return "-";
  if (nik.length < 10) return nik;
  return `${nik.slice(0, 6)}******${nik.slice(-4)}`;
}
