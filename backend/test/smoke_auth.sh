#!/usr/bin/env bash
# Login, superadmin company selection, role boundaries and CSRF.
source "$(dirname "$0")/lib.sh"

echo "login superadmin (want 200): $(login sa superadmin@gmail.com) company=$(j "d['data']['company_id']")"
echo "pasien before select (want 409): $(req sa "$BASE/pasien") $(j "d['error']['code']")"
CID=$(req sa "$BASE/companies" >/dev/null; j "[c['id'] for c in d['data'] if c['name']=='TabMedik Demo'][0]")
echo "select company (want 200): $(req sa -X POST "$BASE/auth/select-company" -d "{\"company_id\":\"$CID\"}") roles=$(j "len(d['data']['roles'])")"
echo "pasien after select (want 200): $(req sa "$BASE/pasien")"
echo "logout (want 200): $(req sa -X POST "$BASE/auth/logout")  me after logout (want 401): $(req sa "$BASE/auth/me")"

echo "login pendaftaran (want 200): $(login p pendaftaran@demo.local) roles=$(j "d['data']['roles']")"
echo "pendaftaran select-company (want 403): $(req p -X POST "$BASE/auth/select-company" -d "{\"company_id\":\"$CID\"}")"
echo "pendaftaran create poli (want 403): $(req p -X POST "$BASE/poli" -d '{"nama":"X"}')"
echo "login apotek (want 200): $(login o apotek@demo.local)"
echo "apotek list pasien (want 403): $(req o "$BASE/pasien")"
echo "apotek list obat (want 200): $(req o "$BASE/obat")"
echo "bad password (want 401): $(login x superadmin@gmail.com wrong-password)"

echo "cross-site POST (want 403 CSRF): $(req p -X POST "$BASE/auth/logout" -H 'Sec-Fetch-Site: cross-site') $(j "d['error']['code']")"
echo "foreign Origin POST (want 403): $(req p -X POST "$BASE/pasien" -H 'Origin: https://evil.example' -d '{}')"
echo "same-origin POST (want 422): $(req p -X POST "$BASE/pasien" -H 'Sec-Fetch-Site: same-origin' -d '{}')"
echo "cookie flags: $(curl -s -D - -o /dev/null -H 'Content-Type: application/json' -X POST "$BASE/auth/login" -d "$(python3 -c 'import json,sys;print(json.dumps({"email":"apotek@demo.local","password":sys.argv[1]}))' "$SEED_PASSWORD")" | grep -i '^set-cookie' | grep -oiE 'HttpOnly|SameSite=[A-Za-z]+' | tr '\n' ' ')"
echo "landing visit request (want 201): $(req anon -X POST "$BASE/visit-requests" -d "{\"idempotency_key\":\"$(python3 -c 'import uuid;print(uuid.uuid4())')\",\"full_name\":\"Calon Pasien\",\"phone\":\"081234567890\",\"service\":\"Kesehatan Gigi\",\"preferred_day\":\"Senin\",\"consent\":true}")"
