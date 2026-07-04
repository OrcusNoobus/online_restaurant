#!/usr/bin/env bash
# init.sh — the standard startup and verification path.
# One command that proves the repo is healthy. Run it at the start of every
# session (clock in) and before ending one (clock out).
# Keep it fast, keep it honest: if it passes, the repo is genuinely workable.
set -e

echo "=== Royal Food Delivery verification ==="

# 0. Environment
if ! command -v node >/dev/null; then
  echo "ERROR: node not found"
  echo "WHY:   the entire stack runs on Node.js"
  echo "FIX:   install Node.js >= 20 (project developed on Node 26)"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node >= 20 required (found $(node --version))"
  echo "WHY:   Next.js 16 does not support older Node versions"
  echo "FIX:   upgrade Node.js"
  exit 1
fi
[ -f .env ] || cp .env.example .env

# Database: Postgres 17 in Docker (SKIP_DB=1 to skip, e.g. on a CI box without Docker)
if [ "${SKIP_DB:-0}" != "1" ]; then
  docker compose up -d db
  printf "Waiting for Postgres"
  READY=0
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U royal -d royal >/dev/null 2>&1; then
      READY=1
      echo " — ready"
      break
    fi
    printf "."
    sleep 1
  done
  if [ "$READY" != "1" ]; then
    echo ""
    echo "ERROR: Postgres did not become ready within 30s"
    echo "WHY:   the app cannot run without its database"
    echo "FIX:   check 'docker compose logs db' and that Docker Desktop is running"
    exit 1
  fi
fi

# 1. Install dependencies (idempotent)
npm install

# 2. Static checks — layer 1: syntax, types, lint
npm run lint
npm run typecheck

# 2b. Boundary checks (see harness/docs/ARCHITECTURE.md)
# The db client may only be imported inside src/server/
if grep -rn "@/server/db" src --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v "^src/server/"; then
  echo "ERROR: direct import of the db client outside src/server/"
  echo "WHY:   only the repository layer may touch the database (harness/docs/ARCHITECTURE.md)"
  echo "FIX:   move the query into src/server/repositories/ and call it through its exported function"
  exit 1
fi
# UI components stay presentational — no server code in src/components/
if grep -rn "@/server" src/components --include='*.ts' --include='*.tsx' 2>/dev/null; then
  echo "ERROR: import from src/server/ inside src/components/"
  echo "WHY:   components are presentational; pages/route handlers fetch data and pass it down"
  echo "FIX:   fetch in src/app/ (server component or route handler) and pass plain props"
  exit 1
fi

# 3. Tests — layer 2: runtime behavior
npm test

# 4. Build — layer 3 entry: the app still builds
npm run build

echo "=== Verification complete ==="
echo ""
echo "Next steps:"
echo "1. Read harness/feature-list.json — pick the ONE active (or next unblocked) feature"
echo "2. Read harness/PROGRESS.md — continue from 'Next Steps'"
echo "3. Implement only that feature"
echo "4. Re-run ./init.sh and the feature's verification before claiming done"
