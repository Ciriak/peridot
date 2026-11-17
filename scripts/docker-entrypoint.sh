#!/bin/sh
set -eu

pnpm --filter @peridot/server db:migrate
exec node apps/server/dist/index.js
