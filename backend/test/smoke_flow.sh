#!/usr/bin/env bash
# Alur SI-Shina: pendaftaran -> dokter -> apotek -> pembayaran (umum) / selesai (jaminan), plus poli gigi.
source "$(dirname "$0")/lib.sh"
login p pendaftaran@demo.local >/dev/null
login du dokter.umum@demo.local >/dev/null
login dg dokter.gigi@demo.local >/dev/null
login o apotek@demo.local >/dev/null
login ad admin@demo.local >/dev/null

UMUM=$(req ad "$BASE/poli" >/dev/null; j "[p['id'] for p in d['data'] if p['nama']=='Poli Umum'][0]")
GIGI=$(req ad "$BASE/poli" >/dev/null; j "[p['id'] for p in d['data'] if p['nama']=='Poli Gigi'][0]")
DU=$(req ad "$BASE/dokter?poli_id=$UMUM" >/dev/null; j "d['data'][0]['id']")
DG=$(req ad "$BASE/dokter?poli_id=$GIGI" >/dev/null; j "d['data'][0]['id']")
PARA=$(req o "$BASE/obat?q=paracetamol" >/dev/null; j "d['data']['items'][0]['id']")
STOK0=$(j "d['data']['items'][0]['stok']")
NEB=$(req ad "$BASE/tindakan?poli_id=$UMUM" >/dev/null; j "[t['id'] for t in d['data'] if t['kode']=='U02'][0]")
TAMBAL=$(req ad "$BASE/tindakan?poli_id=$GIGI" >/dev/null; j "[t['id'] for t in d['data'] if t['kode']=='G01'][0]")

# --- Pasien baru (umum) ---
RM=$(req p "$BASE/pasien/next-rm?kategori=D&nama=Smoke" >/dev/null; j "d['data']['no_rm']")
echo "next no RM prefix (want DS): ${RM:0:2}"
echo "create pasien (want 201): $(req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"$RM\",\"nama\":\"Smoke Umum $RUN\",\"jk\":\"Laki-Laki\",\"no_hp\":\"081311112222\",\"cara_bayar\":\"Umum/Mandiri\",\"tgl_lahir\":\"1991-02-03\"}")"
PU=$(j "d['data']['id']")
echo "duplicate no RM (want 422): $(req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"$RM\",\"nama\":\"Dup\",\"jk\":\"Perempuan\",\"no_hp\":\"081311112223\",\"cara_bayar\":\"Umum/Mandiri\"}") $(j "d['error']['fields']")"
echo "jaminan without BPJS (want 422): $(req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"X$RUN\",\"nama\":\"NoBPJS\",\"jk\":\"Perempuan\",\"no_hp\":\"081311112223\",\"cara_bayar\":\"Jaminan Kesehatan\"}")"

# --- Pendaftaran rekam ---
echo "dokter wrong poli (want 422): $(req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PU\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DG\",\"keluhan\":\"Demam\",\"cara_bayar\":\"Umum/Mandiri\"}")"
echo "daftar rekam umum (want 201): $(req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PU\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"Demam 3 hari\",\"cara_bayar\":\"Umum/Mandiri\"}")"
R1=$(j "d['data']['id']")
echo "second open rekam (want 409 OPEN_REKAM): $(req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PU\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"Lagi\",\"cara_bayar\":\"Umum/Mandiri\"}") $(j "d['error']['code']")"
echo "send to dokter without pemeriksaan (want 409 PEMERIKSAAN_REQUIRED): $(req p -X POST "$BASE/rekam/$R1/status" -d '{"status":2}') $(j "d['error']['code']")"
echo "pemeriksaan by pendaftaran (want 200): $(req p -X PUT "$BASE/rekam/$R1/pemeriksaan" -d '{"text":"TD 120/80, suhu 38.5"}')"
echo "dokter cannot send to dokter (want 403): $(req du -X POST "$BASE/rekam/$R1/status" -d '{"status":2}')"
echo "send to dokter (want 200): $(req p -X POST "$BASE/rekam/$R1/status" -d '{"status":2}')"
echo "registration locked after status 2 (want 409): $(req p -X PATCH "$BASE/rekam/$R1" -d "{\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"x\",\"cara_bayar\":\"Umum/Mandiri\"}")"

# --- Dokter ---
echo "dokter gigi cannot see umum rekam (want 404): $(req dg "$BASE/rekam/$R1")"
echo "dokter gigi list excludes it (want 0): $(req dg "$BASE/rekam?q=Smoke%20Umum%20$RUN" >/dev/null; j "d['data']['total']")"
echo "dokter umum list includes it (want 1): $(req du "$BASE/rekam?q=Smoke%20Umum%20$RUN" >/dev/null; j "d['data']['total']")"
echo "to apotek without tindakan (want 409 TINDAKAN_REQUIRED): $(req du -X POST "$BASE/rekam/$R1/status" -d '{"status":3}') $(j "d['error']['code']")"
echo "diagnosa unknown ICD (want 422): $(req du -X POST "$BASE/rekam/$R1/diagnosa" -d '{"icd_code":"ZZZ"}')"
echo "diagnosa J06.9 (want 201): $(req du -X POST "$BASE/rekam/$R1/diagnosa" -d '{"icd_code":"j06.9"}')"
echo "diagnosa again is idempotent (want 201): $(req du -X POST "$BASE/rekam/$R1/diagnosa" -d '{"icd_code":"J06.9"}')"
echo "tindakan from other poli (want 422): $(req du -X PUT "$BASE/rekam/$R1/tindakan" -d "{\"text\":\"x\",\"tindakan_ids\":[\"$TAMBAL\"]}")"
echo "tindakan + nebulizer (want 200): $(req du -X PUT "$BASE/rekam/$R1/tindakan" -d "{\"text\":\"Nebulizer, istirahat\",\"tindakan_ids\":[\"$NEB\"]}")"
echo "resep (want 200): $(req du -X PUT "$BASE/rekam/$R1/resep" -d '{"text":"Paracetamol 3x1"}')"
echo "pendaftaran cannot add diagnosa (want 403): $(req p -X POST "$BASE/rekam/$R1/diagnosa" -d '{"icd_code":"A09"}')"
echo "send to apotek (want 200): $(req du -X POST "$BASE/rekam/$R1/status" -d '{"status":3}')"
echo "diagnosa locked after status 3 (want 409): $(req du -X POST "$BASE/rekam/$R1/diagnosa" -d '{"icd_code":"A09"}')"

# --- Apotek ---
echo "apotek queue has it (want 1): $(req o "$BASE/rekam?status=3&q=Smoke%20Umum%20$RUN" >/dev/null; j "d['data']['total']")"
echo "stock too low (want 409 INSUFFICIENT_STOCK): $(req o -X POST "$BASE/rekam/$R1/obat" -d "{\"items\":[{\"obat_id\":\"$PARA\",\"jumlah\":9999}]}") $(j "d['error']['code']")"
echo "dispense 10 paracetamol -> pembayaran (want 200 4): $(req o -X POST "$BASE/rekam/$R1/obat" -d "{\"items\":[{\"obat_id\":\"$PARA\",\"jumlah\":10,\"keterangan\":\"3x1 sesudah makan\"}]}") $(j "d['data']['status']")"
echo "dispense twice (want 409): $(req o -X POST "$BASE/rekam/$R1/obat" -d "{\"items\":[{\"obat_id\":\"$PARA\",\"jumlah\":1}]}")"
echo "stock reduced by 10 (want 10): $(req o "$BASE/obat?q=paracetamol" >/dev/null; j "$STOK0 - d['data']['items'][0]['stok']")"

# --- Pembayaran ---
req p "$BASE/rekam/$R1" >/dev/null
echo "tagihan 50000+75000+5000 (want 130000): $(j "d['data']['tagihan']['total']")"
echo "pay too little (want 422): $(req p -X POST "$BASE/rekam/$R1/pembayaran" -d '{"dibayar":1000,"metode":"Tunai"}')"
echo "apotek cannot pay (want 403): $(req o -X POST "$BASE/rekam/$R1/pembayaran" -d '{"dibayar":200000,"metode":"Tunai"}')"
echo "pay 150000 tunai (want 201): $(req p -X POST "$BASE/rekam/$R1/pembayaran" -d '{"dibayar":150000,"metode":"Tunai"}') kembalian=$(j "d['data']['kembalian']")"
echo "pay twice (want 409): $(req p -X POST "$BASE/rekam/$R1/pembayaran" -d '{"dibayar":150000,"metode":"Tunai"}')"
echo "rekam selesai (want 5): $(req p "$BASE/rekam/$R1" >/dev/null; j "d['data']['status']")"
echo "pasien can register again (want 201): $(req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PU\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"Kontrol\",\"cara_bayar\":\"Umum/Mandiri\"}")"
R1B=$(j "d['data']['id']")
echo "delete queued rekam (want 200): $(req p -X DELETE "$BASE/rekam/$R1B")"
echo "pasien with rekam cannot be deleted (want 409): $(req p -X DELETE "$BASE/pasien/$PU")"

# --- Jaminan Kesehatan: apotek closes directly ---
BPJS=$(python3 -c "print(str($RUN)[-13:].zfill(13))")
req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"DJ$RUN\",\"nama\":\"Smoke BPJS $RUN\",\"jk\":\"Perempuan\",\"no_hp\":\"081311113333\",\"cara_bayar\":\"Jaminan Kesehatan\",\"no_bpjs\":\"$BPJS\"}" >/dev/null
PB=$(j "d['data']['id']")
req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PB\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"Batuk\",\"cara_bayar\":\"Jaminan Kesehatan\"}" >/dev/null
R2=$(j "d['data']['id']")
req p -X PUT "$BASE/rekam/$R2/pemeriksaan" -d '{"text":"Ronki -"}' >/dev/null
req p -X POST "$BASE/rekam/$R2/status" -d '{"status":2}' >/dev/null
req du -X POST "$BASE/rekam/$R2/diagnosa" -d '{"icd_code":"J00"}' >/dev/null
req du -X PUT "$BASE/rekam/$R2/tindakan" -d '{"text":"Edukasi"}' >/dev/null
req du -X POST "$BASE/rekam/$R2/status" -d '{"status":3}' >/dev/null
echo "BPJS dispense without drugs -> selesai (want 200 5): $(req o -X POST "$BASE/rekam/$R2/obat" -d '{"items":[]}') $(j "d['data']['status']")"

# --- Poli gigi / odontogram ---
req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$PB\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$GIGI\",\"dokter_id\":\"$DG\",\"keluhan\":\"Gigi berlubang\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
R3=$(j "d['data']['id']")
echo "gigi: send to dokter without pemeriksaan allowed (want 200): $(req p -X POST "$BASE/rekam/$R3/status" -d '{"status":2}')"
echo "gigi: to apotek without odontogram (want 409 GIGI_REQUIRED): $(req dg -X POST "$BASE/rekam/$R3/status" -d '{"status":3}') $(j "d['error']['code']")"
echo "gigi: bad tooth number (want 422): $(req dg -X POST "$BASE/rekam/$R3/gigi" -d '{"elemen_gigi":"19","kondisi":"car","diagnosa":"x"}')"
echo "gigi: tooth 36 caries + tambal (want 201): $(req dg -X POST "$BASE/rekam/$R3/gigi" -d "{\"elemen_gigi\":\"36\",\"kondisi\":\"car\",\"diagnosa\":\"Karies dentin\",\"tindakan_id\":\"$TAMBAL\"}")"
echo "gigi: update same tooth (want 201): $(req dg -X POST "$BASE/rekam/$R3/gigi" -d "{\"elemen_gigi\":\"36\",\"kondisi\":\"cof\",\"diagnosa\":\"Karies dentin\",\"tindakan_id\":\"$TAMBAL\"}")"
echo "gigi: dokter umum cannot edit (want 404): $(req du -X POST "$BASE/rekam/$R3/gigi" -d '{"elemen_gigi":"11","kondisi":"car","diagnosa":"x"}')"
echo "gigi: to apotek (want 200): $(req dg -X POST "$BASE/rekam/$R3/status" -d '{"status":3}')"
echo "odontogram rows (want 1): $(req p "$BASE/pasien/$PB/odontogram" >/dev/null; j "len(d['data'])")"
req o -X POST "$BASE/rekam/$R3/obat" -d '{"items":[]}' >/dev/null
echo "gigi tagihan 75000+150000 (want 225000): $(req p "$BASE/rekam/$R3" >/dev/null; j "d['data']['tagihan']['total']")"
echo "gigi pay QRIS (want 201): $(req p -X POST "$BASE/rekam/$R3/pembayaran" -d '{"metode":"QRIS"}')"

echo "dashboard (want 200): $(req ad "$BASE/dashboard") periksa_hari_ini=$(j "d['data']['periksa_hari_ini']")"
echo "riwayat obat (want 200): $(req o "$BASE/obat/riwayat?q=Smoke") rows=$(j "d['data']['total']")"
echo "pembayaran list (want 200): $(req p "$BASE/pembayaran?q=Smoke") rows=$(j "d['data']['total']")"
