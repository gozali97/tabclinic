#!/usr/bin/env bash
# Lampiran foto (consent pasien, pemeriksaan, tindakan) dan ganti password sendiri.
source "$(dirname "$0")/lib.sh"
# upl JAR URL FILE -> HTTP code; multipart field "file" (lib req forces a JSON content type).
upl() { curl -s -o "$TMP/body" -w '%{http_code}' -b "$TMP/$1" -c "$TMP/$1" -F "file=@$3" "$2"; }
FILES_DIR=${FILES_DIR:-data/files}
python3 - "$TMP" <<'PY'
import sys, zlib, struct
d = sys.argv[1]
def chunk(t, b): return struct.pack(">I", len(b)) + t + b + struct.pack(">I", zlib.crc32(t + b) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b"")
open(d + "/a.png", "wb").write(png)
open(d + "/b.jpg", "wb").write(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
open(d + "/fake.png", "wb").write(b"<script>alert(1)</script>")
open(d + "/big.png", "wb").write(png + b"\x00" * (5 * 1024 * 1024))
PY
login p pendaftaran@demo.local >/dev/null
login du dokter.umum@demo.local >/dev/null
login dg dokter.gigi@demo.local >/dev/null
login o apotek@demo.local >/dev/null
login ad admin@demo.local >/dev/null
UMUM=$(req ad "$BASE/poli" >/dev/null; j "[p['id'] for p in d['data'] if p['nama']=='Poli Umum'][0]")
DU=$(req ad "$BASE/dokter?poli_id=$UMUM" >/dev/null; j "d['data'][0]['id']")

# --- General consent pasien ---
req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"L$RUN\",\"nama\":\"Smoke Lampiran $RUN\",\"jk\":\"Perempuan\",\"no_hp\":\"081300009999\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
P=$(j "d['data']['id']")
echo "consent before upload (want 404): $(req p "$BASE/pasien/$P/consent")"
echo "consent not image (want 422): $(upl p "$BASE/pasien/$P/consent" "$TMP/fake.png")"
echo "consent over 5 MB (want 422): $(upl p "$BASE/pasien/$P/consent" "$TMP/big.png")"
echo "consent as JSON body (want 422): $(req p -X POST "$BASE/pasien/$P/consent" -d '{}')"
echo "dokter cannot upload consent (want 403): $(upl du "$BASE/pasien/$P/consent" "$TMP/a.png")"
echo "upload consent png (want 200): $(upl p "$BASE/pasien/$P/consent" "$TMP/a.png")"
echo "pasien has_consent (want True): $(req p "$BASE/pasien/$P" >/dev/null; j "d['data']['has_consent']")"
echo "get consent (want 200 image/png): $(curl -s -o /dev/null -w '%{http_code} %{content_type}' -b "$TMP/p" "$BASE/pasien/$P/consent")"
echo "consent sandboxed (want 1): $(curl -s -D - -o /dev/null -b "$TMP/p" "$BASE/pasien/$P/consent" | grep -ci '^content-security-policy:.*sandbox')"
OLD=$(bash scripts/psql.sh "SELECT consent_file FROM pasien WHERE id='$P'")
echo "replace consent with jpg (want 200): $(upl p "$BASE/pasien/$P/consent" "$TMP/b.jpg")"
echo "old consent file removed (want 0): $(ls "$FILES_DIR/$OLD" 2>/dev/null | wc -l)"
NEW=$(bash scripts/psql.sh "SELECT consent_file FROM pasien WHERE id='$P'")
echo "stored as jpg in company folder (want 1): $([[ "$NEW" == 11111111-1111-4111-8111-111111111111/*.jpg && -f "$FILES_DIR/$NEW" ]] && echo 1 || echo 0)"
echo "delete consent (want 200): $(req p -X DELETE "$BASE/pasien/$P/consent")"
echo "consent file removed (want 0): $(ls "$FILES_DIR/$NEW" 2>/dev/null | wc -l)"
echo "delete consent again (want 404): $(req p -X DELETE "$BASE/pasien/$P/consent")"
# Keep one consent so smoke_isolation probes a pasien that really has a file.
echo "re-upload consent (want 200): $(upl p "$BASE/pasien/$P/consent" "$TMP/a.png")"

# --- Foto pemeriksaan / tindakan ---
req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$P\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"Luka\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
R=$(j "d['data']['id']")
echo "pemeriksaan file by pendaftaran (want 200): $(upl p "$BASE/rekam/$R/pemeriksaan/file" "$TMP/a.png")"
echo "pendaftaran cannot upload tindakan file (want 403): $(upl p "$BASE/rekam/$R/tindakan/file" "$TMP/a.png")"
echo "tindakan file at status 1 (want 409): $(upl du "$BASE/rekam/$R/tindakan/file" "$TMP/a.png")"
req p -X PUT "$BASE/rekam/$R/pemeriksaan" -d '{"text":"Luka lecet lutut"}' >/dev/null
req p -X POST "$BASE/rekam/$R/status" -d '{"status":2}' >/dev/null
echo "dokter tindakan file (want 200): $(upl du "$BASE/rekam/$R/tindakan/file" "$TMP/b.jpg")"
echo "rekam file flags (want True True): $(req du "$BASE/rekam/$R" >/dev/null; j "d['data']['has_pemeriksaan_file'], d['data']['has_tindakan_file']" | tr -d '(),')"
echo "dokter gets tindakan file (want 200 image/jpeg): $(curl -s -o /dev/null -w '%{http_code} %{content_type}' -b "$TMP/du" "$BASE/rekam/$R/tindakan/file")"
echo "apotek gets pemeriksaan file (want 200): $(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/o" "$BASE/rekam/$R/pemeriksaan/file")"
echo "other dokter cannot get file (want 404): $(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/dg" "$BASE/rekam/$R/tindakan/file")"
echo "other dokter cannot upload (want 404): $(upl dg "$BASE/rekam/$R/tindakan/file" "$TMP/a.png")"
echo "unknown file kind (want 404): $(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/du" "$BASE/rekam/$R/resep/file")"
NEB=$(req ad "$BASE/tindakan?poli_id=$UMUM" >/dev/null; j "[t['id'] for t in d['data'] if t['kode']=='U03'][0]")
req du -X PUT "$BASE/rekam/$R/tindakan" -d "{\"text\":\"Rawat luka\",\"tindakan_ids\":[\"$NEB\"]}" >/dev/null
req du -X POST "$BASE/rekam/$R/diagnosa" -d '{"icd_code":"R50.9"}' >/dev/null
echo "send to apotek (want 200): $(req du -X POST "$BASE/rekam/$R/status" -d '{"status":3}')"
echo "tindakan file locked at status 3 (want 409): $(upl du "$BASE/rekam/$R/tindakan/file" "$TMP/a.png")"
echo "delete tindakan file locked (want 409): $(req du -X DELETE "$BASE/rekam/$R/tindakan/file")"
echo "file still readable at status 3 (want 200): $(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/du" "$BASE/rekam/$R/tindakan/file")"

# Deleting a queued rekam removes its photo from disk.
req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"M$RUN\",\"nama\":\"Smoke Hapus $RUN\",\"jk\":\"Perempuan\",\"no_hp\":\"081300009998\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
P2=$(j "d['data']['id']")
req p -X POST "$BASE/rekam" -d "{\"pasien_id\":\"$P2\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$UMUM\",\"dokter_id\":\"$DU\",\"keluhan\":\"x\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
R2=$(j "d['data']['id']")
upl p "$BASE/rekam/$R2/pemeriksaan/file" "$TMP/a.png" >/dev/null
F2=$(bash scripts/psql.sh "SELECT pemeriksaan_file FROM rekam WHERE id='$R2'")
upl p "$BASE/pasien/$P2/consent" "$TMP/a.png" >/dev/null
C2=$(bash scripts/psql.sh "SELECT consent_file FROM pasien WHERE id='$P2'")
echo "delete rekam (want 200): $(req p -X DELETE "$BASE/rekam/$R2")"
echo "rekam photo removed (want 0): $(ls "$FILES_DIR/$F2" 2>/dev/null | wc -l)"
echo "delete pasien (want 200): $(req p -X DELETE "$BASE/pasien/$P2")"
echo "consent photo removed (want 0): $(ls "$FILES_DIR/$C2" 2>/dev/null | wc -l)"

# --- Ganti password sendiri ---
PW1="Lama-$RUN-pw"; PW2="Baru-$RUN-pw"
CID=$(req ad "$BASE/auth/me" >/dev/null; j "d['data']['company_id']")
req ad -X POST "$BASE/companies/$CID/users" -d "{\"email\":\"pw$RUN@demo.local\",\"password\":\"$PW1\",\"full_name\":\"Uji Password\",\"roles\":[\"apotek\"]}" >/dev/null
login u1 "pw$RUN@demo.local" "$PW1" >/dev/null
login u2 "pw$RUN@demo.local" "$PW1" >/dev/null
pw() { req "$1" -X POST "$BASE/auth/password" -d "$(python3 -c 'import json,sys;print(json.dumps({"current_password":sys.argv[1],"new_password":sys.argv[2]}))' "$2" "$3")"; }
echo "wrong current password (want 422 current_password): $(pw u1 wrong-password "$PW2") $(j "list(d['error']['fields'])[0]")"
echo "new password too short (want 422 new_password): $(pw u1 "$PW1" short) $(j "list(d['error']['fields'])[0]")"
echo "same as old (want 422): $(pw u1 "$PW1" "$PW1")"
echo "change password (want 200): $(pw u1 "$PW1" "$PW2")"
echo "current session still valid (want 200): $(req u1 "$BASE/auth/me")"
echo "other session revoked (want 401): $(req u2 "$BASE/auth/me")"
echo "login old password (want 401): $(login x "pw$RUN@demo.local" "$PW1")"
echo "login new password (want 200): $(login x "pw$RUN@demo.local" "$PW2")"
echo "audit recorded (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM audit_events WHERE action='user.password_changed' AND object_id=(SELECT id::text FROM users WHERE email='pw$RUN@demo.local')")"
echo "anonymous change (want 401): $(pw anon "$PW2" "Lain-$RUN-pw")"
