#!/usr/bin/env bash
set -euo pipefail

RESET_PG=0
NO_LLM=0
FULL=0
READY_TIMEOUT=90
BASE_URL="https://app.ledger-mind.org"
SMOKE_AUTH=0
JSON=0
AUTO_MIGRATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
  -ResetPg) RESET_PG=1; shift ;;
  -NoLLM)   NO_LLM=1; shift ;;
  -Full)    FULL=1; shift ;;
  -ReadyTimeoutSec) READY_TIMEOUT="$2"; shift 2 ;;
  -BaseUrl) BASE_URL="$2"; shift 2 ;;
  -SmokeAuth) SMOKE_AUTH=1; shift ;;
  -Json) JSON=1; shift ;;
  -AutoMigrate) AUTO_MIGRATE=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

FILES=(-f docker-compose.prod.yml -f docker-compose.prod.override.yml)
ENV_FILE=".env.prod.local"

new_rand_b64() {
  head -c 32 /dev/urandom | base64
}

export_envfile() {
  while IFS='=' read -r k v; do
    [[ -z "${k}" || "${k:0:1}" == "#" ]] && continue
    export "${k}"="${v}"
  done < "$1"
}

if [[ ! -f "$ENV_FILE" ]]; then
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
  MASTER_KEK_B64="${MASTER_KEK_B64:-}"
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"

  [[ -z "$POSTGRES_PASSWORD" ]] && POSTGRES_PASSWORD="$(uuidgen | tr -d '-' )!PgA1"
  [[ -z "$MASTER_KEK_B64"   ]] && MASTER_KEK_B64="$(new_rand_b64)"
  [[ -z "$OPENAI_API_KEY"   ]] && OPENAI_API_KEY=""

  BACKEND_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  BACKEND_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  if [[ -z "$OPENAI_API_KEY" || "$NO_LLM" -eq 1 ]]; then
    DEV_ALLOW_NO_LLM=1
  else
    DEV_ALLOW_NO_LLM=0
  fi

  cat > "$ENV_FILE" <<EOF
# Generated $(date -Iseconds)
# Keep POSTGRES_USER consistent with compose (myuser)
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
MASTER_KEK_B64=$MASTER_KEK_B64
OPENAI_API_KEY=$OPENAI_API_KEY
BACKEND_BRANCH=$BACKEND_BRANCH
BACKEND_COMMIT=$BACKEND_COMMIT
DEV_ALLOW_NO_LLM=$DEV_ALLOW_NO_LLM
EOF
  echo "Wrote $ENV_FILE"
else
  echo "$ENV_FILE exists; using its values."
fi

export_envfile "$ENV_FILE"
echo "Exported envs (POSTGRES_PASSWORD, MASTER_KEK_B64, OPENAI_API_KEY, DEV_ALLOW_NO_LLM)"

if [[ "$RESET_PG" -eq 1 ]]; then
  echo "Stopping stack & removing pgdata volume..."
  docker compose "${FILES[@]}" down
  docker volume rm ai-finance-agent-oss-clean_pgdata || true
fi

docker compose "${FILES[@]}" up -d postgres
docker compose "${FILES[@]}" up -d --build backend

if [[ "$FULL" -eq 1 ]]; then
  for svc in nginx agui cloudflared certbot nginx-reloader; do
    docker compose "${FILES[@]}" up -d "$svc" || true
  done
fi

sleep 2
docker compose "${FILES[@]}" logs --tail=80 backend || true

echo "If you see [STARTUP] DB connectivity OK, proceeding to readiness probe..."

deadline=$(( $(date +%s) + READY_TIMEOUT ))
ok=0
while [[ $(date +%s) -lt $deadline ]]; do
  if resp=$(curl -fsS --max-time 6 "$BASE_URL/api/status"); then
    db_ok=$(echo "$resp" | jq -r '.db.ok // false')
    mig_ok=$(echo "$resp" | jq -r '.migrations.ok // false')
    all_ok=$(echo "$resp" | jq -r '.ok // false')
    if [[ "$db_ok" == "true" && "$mig_ok" == "true" && "$all_ok" == "true" ]]; then
      echo "Ready."
      ok=1; break
    else
      cur=$(echo "$resp" | jq -r '.migrations.current // "?"')
      head=$(echo "$resp" | jq -r '.migrations.head // "?"')
      echo "Waiting: ok=$all_ok db=$db_ok mig=$mig_ok (current=$cur head=$head)"
    fi
  else
    echo "Waiting: /api/status unreachable..."
  fi
  sleep 3
done

if [[ $ok -ne 1 ]]; then
  echo "Timed out waiting for /api/status readiness." >&2
  exit 1
fi

resp=$(curl -fsS "$BASE_URL/api/status")
mig_ok=$(echo "$resp" | jq -r '.migrations.ok')
drift=0
if [[ "$mig_ok" != "true" ]]; then
  drift=1
  cur=$(echo "$resp" | jq -r '.migrations.current // "?"')
  head=$(echo "$resp" | jq -r '.migrations.head // "?"')
  echo "Migration drift: current=$cur head=$head"
  if [[ "$AUTO_MIGRATE" -eq 1 ]]; then
    echo "Running 'alembic upgrade head'..."
    docker compose "${FILES[@]}" exec backend alembic upgrade head || true
    resp=$(curl -fsS "$BASE_URL/api/status" || echo '{}')
    mig_ok=$(echo "$resp" | jq -r '.migrations.ok // false')
    if [[ "$mig_ok" != "true" ]]; then
      echo "Migrations still not at head." >&2
    else
      echo "Migrations upgraded to head."
      drift=0
    fi
  else
    echo "Run: docker compose ${FILES[*]} exec backend alembic upgrade head"
  fi
fi

if [[ "$SMOKE_AUTH" -eq 1 ]]; then
  echo "(Skipping interactive auth smoke in bash; use PowerShell version for auth tests.)"
fi

ok=$(echo "$resp" | jq -r '.ok // false')
db_ok=$(echo "$resp" | jq -r '.db.ok // false')
crypto_ok=$(echo "$resp" | jq -r '.crypto.ok // false')
llm_ok=$(echo "$resp" | jq -r '.llm.ok // false')
t_ms=$(echo "$resp" | jq -r '.t_ms // -1')

if [[ "$JSON" -eq 1 ]]; then
  jq -n --arg url "$BASE_URL" \
        --argjson ok "$ok" \
        --argjson db_ok "$db_ok" \
        --argjson mig_ok "$mig_ok" \
        --argjson crypto_ok "$crypto_ok" \
        --argjson llm_ok "$llm_ok" \
        --argjson t_ms "$t_ms" \
        --argjson drift "$drift" \
        '{ok:$ok, db_ok:$db_ok, mig_ok:$mig_ok, crypto_ok:$crypto_ok, llm_ok:$llm_ok, t_ms:$t_ms, drift:$drift, url:$url}'
else
  if [[ "$ok" == "true" && "$db_ok" == "true" && "$mig_ok" == "true" ]]; then
    echo "SUMMARY | ok=$ok db=$db_ok mig=$mig_ok crypto=$crypto_ok llm=$llm_ok t=${t_ms}ms url=$BASE_URL"
  else
    echo "SUMMARY | ok=$ok db=$db_ok mig=$mig_ok crypto=$crypto_ok llm=$llm_ok t=${t_ms}ms url=$BASE_URL" >&2
  fi
fi

echo "Bootstrap complete."
