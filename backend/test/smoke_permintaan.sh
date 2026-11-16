#!/usr/bin/env bash
# Permintaan janji dari landing page sampai ditindaklanjuti pendaftaran.
# Run with LANDING_COMPANY_ID set to the demo company (run_all.sh does this).
source "$(dirname "$0")/lib.sh"
DEMO=11111111-1111-4111-8111-111111111111
uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
ask() { req anon -X POST "$BASE/visit-requests" -d "{\"idempotency_key\":\"$(uuid)\",\"full_name\":\"$1\",\"phone\":\"$2\",\"service\":\"$3\",\"preferred_day\":\"Senin\",\"consent\":true}"; }
login p pendaftaran@demo.local >/dev/null
login ad admin@demo.local >/dev/null
login du dokter.umum@demo.local >/dev/null
login o apotek@demo.local >/dev/null

echo "landing form poli umum (want 201): $(ask "Janji Satu $RUN" "0812${RUN: -8}" "Konsultasi Umum")"
echo "landing form poli gigi (want 201): $(ask "Janji Dua $RUN" "0813${RUN: -8}" "Kesehatan Gigi")"
echo "removed service rejected (want 422): $(ask "Janji Tiga $RUN" "0814${RUN: -8}" "Perawatan Preventif")"
echo "saved to LANDING_COMPANY_ID (want 2): $(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE company_id='$DEMO' AND full_name LIKE 'Janji % $RUN'")"

echo "dokter cannot list (want 403): $(req du "$BASE/permintaan-janji")"
echo "apotek cannot list (want 403): $(req o "$BASE/permintaan-janji")"
echo "pendaftaran lists baru (want 200 2): $(req p "$BASE/permintaan-janji?status=baru&q=$RUN") $(j "d['data']['total']")"
ID1=$(j "[r['id'] for r in d['data']['items'] if r['full_name']=='Janji Satu $RUN'][0]")
ID2=$(j "[r['id'] for r in d['data']['items'] if r['full_name']=='Janji Dua $RUN'][0]")
echo "counts include baru (want True): $(j "d['data']['counts']['baru'] >= 2")"
echo "search by phone (want 1): $(req p "$BASE/permintaan-janji?q=0812${RUN: -8}" >/dev/null; j "d['data']['total']")"
echo "unknown status filter (want 422): $(req p "$BASE/permintaan-janji?status=xx")"
echo "dashboard shows new requests (want True): $(req p "$BASE/dashboard" >/dev/null; j "d['data']['permintaan_janji_baru'] >= 2")"
echo "dokter dashboard hides count (want 0): $(req du "$BASE/dashboard" >/dev/null; j "d['data']['permintaan_janji_baru']")"

echo "mark dihubungi (want 200): $(req p -X PATCH "$BASE/permintaan-janji/$ID1" -d '{"status":"dihubungi","catatan":"Senin 09.00 dr. Rina"}')"
echo "handled_by recorded (want Petugas Pendaftaran): $(req p "$BASE/permintaan-janji?status=dihubungi&q=$RUN" >/dev/null; j "d['data']['items'][0]['handled_by']")"
echo "terdaftar without pasien (want 422 pasien_id): $(req p -X PATCH "$BASE/permintaan-janji/$ID1" -d '{"status":"terdaftar"}') $(j "list(d['error']['fields'])[0]")"
echo "unknown status (want 422): $(req p -X PATCH "$BASE/permintaan-janji/$ID1" -d '{"status":"jadwal"}')"
echo "catatan too long (want 422): $(req p -X PATCH "$BASE/permintaan-janji/$ID1" -d "{\"status\":\"dihubungi\",\"catatan\":\"$(printf 'x%.0s' $(seq 1 1001))\"}")"
echo "unknown request id (want 404): $(req p -X PATCH "$BASE/permintaan-janji/$(uuid)" -d '{"status":"batal"}')"

req p -X POST "$BASE/pasien" -d "{\"no_rm\":\"J$RUN\",\"nama\":\"Janji Satu $RUN\",\"jk\":\"Perempuan\",\"no_hp\":\"0812${RUN: -8}\",\"cara_bayar\":\"Umum/Mandiri\"}" >/dev/null
PID=$(j "d['data']['id']")
echo "link to pasien (want 200): $(req p -X PATCH "$BASE/permintaan-janji/$ID1" -d "{\"status\":\"terdaftar\",\"pasien_id\":\"$PID\",\"catatan\":\"Senin 09.00 dr. Rina\"}")"
echo "terdaftar row shows pasien (want J$RUN): $(req p "$BASE/permintaan-janji?status=terdaftar&q=$RUN" >/dev/null; j "d['data']['items'][0]['pasien_no_rm']")"
echo "cancel second (want 200): $(req ad -X PATCH "$BASE/permintaan-janji/$ID2" -d '{"status":"batal","catatan":"Nomor tidak aktif"}')"
echo "reopen second (want 200): $(req ad -X PATCH "$BASE/permintaan-janji/$ID2" -d '{"status":"baru","catatan":null}')"
echo "audit recorded (want 4): $(bash scripts/psql.sh "SELECT count(*) FROM audit_events WHERE action='permintaan.updated' AND object_id IN ('$ID1','$ID2')")"
echo "deleting pasien unlinks request (want 200 1): $(req p -X DELETE "$BASE/pasien/$PID") $(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE id='$ID1' AND pasien_id IS NULL AND status='terdaftar'")"

# Rows saved before LANDING_COMPANY_ID existed have no company: only a superadmin sees and claims them.
OLD=$(bash scripts/psql.sh "INSERT INTO visit_requests (idempotency_key, full_name, phone, service, preferred_day, consent) VALUES (gen_random_uuid(), 'Tanpa Klinik $RUN', '081500000000', 'Kesehatan Gigi', 'Rabu', true) RETURNING id" | head -1)
echo "admin does not see unassigned (want 0): $(req ad "$BASE/permintaan-janji?status=baru&q=Tanpa%20Klinik%20$RUN" >/dev/null; j "d['data']['total']")"
echo "admin cannot update unassigned (want 404): $(req ad -X PATCH "$BASE/permintaan-janji/$OLD" -d '{"status":"dihubungi"}')"
login sa superadmin@gmail.com >/dev/null
req sa -X POST "$BASE/auth/select-company" -d "{\"company_id\":\"$DEMO\"}" >/dev/null
echo "superadmin sees unassigned (want 1 True): $(req sa "$BASE/permintaan-janji?status=baru&q=Tanpa%20Klinik%20$RUN" >/dev/null; j "d['data']['total'], d['data']['items'][0]['unassigned']" | tr -d '(),')"
echo "superadmin claims it (want 200): $(req sa -X PATCH "$BASE/permintaan-janji/$OLD" -d '{"status":"dihubungi"}')"
echo "claimed by selected company (want 1): $(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE id='$OLD' AND company_id='$DEMO'")"
echo "admin now sees it (want 1): $(req ad "$BASE/permintaan-janji?status=dihubungi&q=Tanpa%20Klinik%20$RUN" >/dev/null; j "d['data']['total']")"

set -euo pipefail
expect() {
	if [[ "$1" != "$2" ]]; then
		printf 'FAIL %s: expected %s, got %s\n' "$3" "$2" "$1" >&2
		exit 1
	fi
}
registration_body() {
	printf '{"permintaan_id":"%s","no_rm":"%s","nama":"Atomik %s","jk":"Perempuan","no_hp":"081200000000","cara_bayar":"Umum/Mandiri"}' "$1" "$2" "$RUN"
}
expect "$(req p -X PATCH "$BASE/permintaan-janji/$ID2" -d '{"status":"dihubungi","catatan":"Catatan harus tetap tersimpan"}')" 200 'prepare atomic registration'
BODY=$(registration_body "$ID2" "AT$RUN")
expect "$(req p -X POST "$BASE/pasien" -d "$BODY")" 201 'atomic registration'
ATOMIC_PID=$(j "d['data']['id']")
expect "$(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE id='$ID2' AND pasien_id='$ATOMIC_PID' AND status='terdaftar' AND catatan='Catatan harus tetap tersimpan'")" 1 'request linked with notes preserved'
expect "$(req p -X POST "$BASE/pasien" -d "$BODY")" 201 'retry registration'
expect "$(j "d['data']['id']")" "$ATOMIC_PID" 'retry returns same patient'
expect "$(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE company_id='$DEMO' AND no_rm='AT$RUN'")" 1 'no duplicate patient'

expect "$(req p -X POST "$BASE/pasien" -d "$(registration_body "$(uuid)" "UNKNOWN$RUN")")" 404 'unknown request'
expect "$(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE no_rm='UNKNOWN$RUN'")" 0 'unknown request creates no patient'
expect "$(req p -X PATCH "$BASE/permintaan-janji/$ID2" -d '{"status":"batal"}')" 200 'cancel request'
expect "$(req p -X POST "$BASE/pasien" -d "$(registration_body "$ID2" "CANCEL$RUN")")" 409 'cancelled request rejected'
expect "$(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE no_rm='CANCEL$RUN'")" 0 'cancelled request creates no patient'
expect "$(req p -X PATCH "$BASE/permintaan-janji/$ID2" -d '{"status":"baru"}')" 200 'reopen request'
expect "$(req p -X POST "$BASE/pasien" -d "$BODY")" 422 'duplicate RM rolls back registration'
expect "$(bash scripts/psql.sh "SELECT count(*) FROM visit_requests WHERE id='$ID2' AND status='baru' AND pasien_id IS NULL")" 1 'failed insert leaves request unchanged'

for attempt in 1 2; do
	curl -sS -o "$TMP/atomic-$attempt.json" -w '%{http_code}' -b "$TMP/p" \
		-H 'Content-Type: application/json' -X POST "$BASE/pasien" \
		-d "$(registration_body "$ID2" "PAR$RUN-$attempt")" > "$TMP/atomic-$attempt.code" &
done
wait
for attempt in 1 2; do
	expect "$(<"$TMP/atomic-$attempt.code")" 201 'parallel registration'
done
python3 - "$TMP" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
first = json.loads((root / 'atomic-1.json').read_text())['data']['id']
second = json.loads((root / 'atomic-2.json').read_text())['data']['id']
assert first == second, 'parallel requests created different patients'
PY
expect "$(bash scripts/psql.sh "SELECT count(*) FROM pasien WHERE company_id='$DEMO' AND no_rm LIKE 'PAR$RUN-%'")" 1 'parallel requests create one patient'
echo 'atomic registration assertions (want PASS): PASS'
