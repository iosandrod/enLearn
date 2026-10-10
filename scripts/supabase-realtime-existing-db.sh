#!/bin/bash
# The remote database already contains the Realtime schemas and tenant.
# Start the service without the CLI image's migrate/seed bootstrap.
set -euo pipefail

if [ -n "${RLIMIT_NOFILE:-}" ]; then
    ulimit -Sn "$RLIMIT_NOFILE"
fi

export ERL_CRASH_DUMP=/tmp/erl_crash.dump
exec "$@"
