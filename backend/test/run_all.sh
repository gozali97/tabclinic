#!/usr/bin/env bash
# Run all smoke scripts against a temporary API and check every "(want X)" line.
# Usage (from backend/): bash test/run_all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
LOGDIR=$(mktemp -d)
# smoke_permintaan expects landing-page requests to land in the demo company.
export LANDING_COMPANY_ID=${LANDING_COMPANY_ID:-11111111-1111-4111-8111-111111111111}
for t in smoke_auth smoke_flow smoke_lampiran smoke_permintaan smoke_isolation; do
  echo "== $t"
  bash test/with_api.sh "test/$t.sh" | tee "$LOGDIR/$t.log"
done
python3 - "$LOGDIR" <<'PY'
import glob, re, sys
bad, n = [], 0
for f in glob.glob(sys.argv[1] + "/*.log"):
    for line in open(f):
        if line.startswith("LEAK"):
            bad.append(line)
        m = re.search(r"\(want ([^)]+)\):\s*(.*)", line)
        if m:
            n += 1
            want = m.group(1).split()
            got = m.group(2).split()
            # Each token of the expectation must appear in order at the start of the output.
            if got[:len(want)] != want:
                bad.append(f"{f.split('/')[-1]}: {line}")
print(f"{n} expectations checked")
print("".join(bad) or "all expectations met")
sys.exit(1 if bad else 0)
PY
