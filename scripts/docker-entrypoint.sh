#!/bin/sh
set -eu

updater_token_file="${PERIDOT_WATCHTOWER_TOKEN_FILE:-/data/watchtower-token}"
if [ ! -s "$updater_token_file" ]; then
  umask 077
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$updater_token_file"
fi

pnpm --filter @peridot/server db:update
exec node apps/server/dist/index.js
