#!/usr/bin/env bash
# Company B's admin+all-roles user calls EVERY {id}/{code} route from iam/access.go with company A's real IDs.
# Any 2xx carrying data is a leak. Run after smoke_flow so every entity has a sample row.
source "$(dirname "$0")/lib.sh"
FAIL=0
ids() { bash scripts/psql.sh "$1" | head -1; }
declare -A ID=(
  [poli]=$(ids "SELECT id FROM poli WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
  [dokter]=$(ids "SELECT id FROM dokter WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
  [pasien]=$(ids "SELECT id FROM pasien WHERE company_id='11111111-1111-4111-8111-111111111111' ORDER BY consent_file IS NULL, id IN (SELECT pasien_id FROM rekam_gigi) DESC LIMIT 1")
  [obat]=$(ids "SELECT id FROM obat WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
  [tindakan]=$(ids "SELECT id FROM tindakan WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
  [icd]=A09
  [rekam]=$(ids "SELECT id FROM rekam WHERE company_id='11111111-1111-4111-8111-111111111111' ORDER BY tindakan_file IS NULL, pemeriksaan_file IS NULL, status LIMIT 1")
  [permintaan-janji]=$(ids "SELECT id FROM visit_requests WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
  [users]=$(ids "SELECT id FROM users WHERE company_id='11111111-1111-4111-8111-111111111111' LIMIT 1")
)
SUB_DIAG=$(ids "SELECT id FROM rekam_diagnosa LIMIT 1")
SUB_GIGI=$(ids "SELECT id FROM rekam_gigi LIMIT 1")

# Company B with its own admin. Superadmin creates it; B's admin also gets pendaftaran+apotek; dokter via /dokter.
login sa superadmin@gmail.com >/dev/null
req sa -X POST "$BASE/companies" -d "{\"name\":\"Isolasi Uji $RUN\"}" >/dev/null; CB=$(j "d['data']['company']['id']")
req sa -X POST "$BASE/auth/select-company" -d "{\"company_id\":\"$CB\"}" >/dev/null
BPW="Isolasi-$RUN-pw"
echo "create company B admin (want 201): $(req sa -X POST "$BASE/companies/$CB/users" -d "{\"email\":\"iso$RUN@demo.local\",\"password\":\"$BPW\",\"full_name\":\"Admin Isolasi\",\"roles\":[\"admin\",\"pendaftaran\",\"apotek\"]}")"
req sa -X POST "$BASE/poli" -d '{"nama":"Poli B"}' >/dev/null; PB=$(j "d['data']['id']")
echo "create company B dokter (want 201): $(req sa -X POST "$BASE/dokter" -d "{\"email\":\"isodok$RUN@demo.local\",\"password\":\"$BPW\",\"nama\":\"Dokter B\",\"no_hp\":\"0812\",\"poli_id\":\"$PB\"}")"
login b "iso$RUN@demo.local" "$BPW" >/dev/null
login bd "isodok$RUN@demo.local" "$BPW" >/dev/null
echo "B admin cannot create user in A (want 404): $(req b -X POST "$BASE/companies/11111111-1111-4111-8111-111111111111/users" -d '{"email":"x@x.x","password":"xxxxxxxx","full_name":"x","roles":["apotek"]}')"
echo "B cannot register A's pasien (want 422): $(req b -X POST "$BASE/rekam" -d "{\"pasien_id\":\"${ID[pasien]}\",\"tgl_rekam\":\"$TODAY\",\"poli_id\":\"$PB\",\"dokter_id\":\"${ID[dokter]}\",\"keluhan\":\"x\",\"cara_bayar\":\"Umum/Mandiri\"}")"

routes=$(grep -oE '"(GET|POST|PATCH|PUT|DELETE) /api/v1/[^"]*\{(id|code)\}[^"]*"' internal/iam/access.go | tr -d '"' | sort -u)
checked=0
while read -r method path; do
  [ -z "$method" ] && continue
  seg=$(echo "$path" | cut -d/ -f4)
  id=${ID[$seg]:-}
  if [ -z "$id" ]; then echo "SKIP (no sample id for '$seg'): $method $path"; continue; fi
  url="$BASE${path#/api/v1}"
  url=${url//\{id\}/$id}; url=${url//\{code\}/$id}; url=${url//\{diagnosaId\}/$SUB_DIAG}; url=${url//\{gigiId\}/$SUB_GIGI}
  for jar in b bd; do
    code=$(req $jar -X "$method" "$url" -d '{}')
    checked=$((checked+1))
    if [[ "$code" == 2* ]]; then
      if python3 -c "import json,sys;d=json.load(open('$TMP/body'));sys.exit(0 if d.get('data') in (None,[],{}) else 1)"; then continue; fi
      echo "LEAK $code ($jar): $method $path"; FAIL=1
    fi
  done
done <<<"$routes"
echo "isolation: $checked calls checked, leaks=$FAIL"

# A's rows must still exist (B's DELETE/PATCH calls above must not have touched them).
echo "A poli intact (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM poli WHERE id='${ID[poli]}'")"
echo "A attachments intact (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE id='${ID[pasien]}' AND consent_file IS NOT NULL")"
echo "B cannot claim A's visit request (want 404): $(req b -X PATCH "$BASE/permintaan-janji/${ID[permintaan-janji]}" -d '{"status":"batal","catatan":"x"}')"
code=$(req b -X POST "$BASE/pasien" -d "{\"permintaan_id\":\"${ID[permintaan-janji]}\",\"no_rm\":\"ISOREQ$RUN\",\"nama\":\"Pasien Isolasi\",\"jk\":\"Perempuan\",\"no_hp\":\"081200000000\",\"cara_bayar\":\"Umum/Mandiri\"}")
echo "B cannot register A's request (want 404): $code"
if [[ "$code" != 404 ]]; then exit 1; fi
count=$(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE company_id='$CB' AND no_rm='ISOREQ$RUN'")
echo "cross-company registration leaves no patient (want 0): $count"
if [[ "$count" != 0 ]]; then exit 1; fi
echo "A visit request untouched (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE id='${ID[permintaan-janji]}' AND company_id='11111111-1111-4111-8111-111111111111' AND status<>'batal'")"
echo "B list permintaan empty (want 0): $(req b "$BASE/permintaan-janji" >/dev/null; j "d['data']['total']")"
echo "A ICD intact (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM icd WHERE company_id='11111111-1111-4111-8111-111111111111' AND code='A09'")"
for path in pasien obat icd rekam pembayaran obat/riwayat tindakan dokter poli; do
  echo "B list $path empty (want 0): $(req b "$BASE/$path" >/dev/null; j "len(d['data']['items']) if isinstance(d.get('data'),dict) else len([x for x in (d.get('data') or []) if x.get('nama') not in ('Poli B','Dokter B')])")"
done
echo "B users has no demo.local A accounts (want 0): $(req b "$BASE/users" >/dev/null; j "len([u for u in d['data']['users'] if '$RUN' not in u['email']])")"
exit $FAIL
