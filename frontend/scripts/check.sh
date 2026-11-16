#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
npx tsc --noEmit -p . && echo TSC_OK
npm run build 2>&1 | tail -8
echo "STYLE_GREP:"
grep -rn 'style={{\|var(--' src --include=*.tsx | grep -v landing || echo none
