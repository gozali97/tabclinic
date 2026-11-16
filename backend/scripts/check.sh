#!/usr/bin/env bash
# Format, build, vet and test the backend from any working directory.
cd "$(dirname "$0")/.." || exit 1
unformatted=$(gofmt -l internal cmd pkg migrations)
[ -n "$unformatted" ] && echo "gofmt needed: $unformatted"
go build ./... && go vet ./... && go test ./... 2>&1 | grep -v "no test files"
