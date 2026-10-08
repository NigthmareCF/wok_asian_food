#!/usr/bin/env bash
set -euo pipefail

database_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container_name="wok-db-validation-$$-${RANDOM}"
container_id=""

cleanup() {
  if [[ -n "$container_id" ]]; then
    docker rm -f "$container_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mapfile -t migrations < <(find "$database_dir/migrations" -maxdepth 1 -type f -name 'V*.sql' -print | sort -V)
if (( ${#migrations[@]} != 51 )); then
  printf 'Expected 51 Flyway migrations (V1–V51), found %s.\n' "${#migrations[@]}" >&2
  exit 1
fi
for index in "${!migrations[@]}"; do
  expected=$((index + 1))
  actual="$(basename "${migrations[$index]}" | sed -E 's/^V([0-9]+)__.*/\1/')"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected migration V%s, found V%s.\n' "$expected" "$actual" >&2
    exit 1
  fi
done

container_id="$(docker run --rm --detach --name "$container_name" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=wokdb \
  --volume "$database_dir:/wok:ro" \
  postgres:18-alpine)"

ready=false
for _ in {1..45}; do
  if docker exec "$container_id" pg_isready -U postgres -d wokdb >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  printf 'PostgreSQL did not become ready within 45 seconds.\n' >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  docker exec "$container_id" psql -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d wokdb -f "/wok/migrations/$(basename "$migration")" >/dev/null
done

mapfile -t checks < <(find "$database_dir/tests" -maxdepth 1 -type f -name '*.sql' \
  ! -name 'candidate_constraints.sql' -print | sort -V)
for check in "${checks[@]}"; do
  docker exec "$container_id" psql -v ON_ERROR_STOP=1 -U postgres -d wokdb \
    -f "/wok/tests/$(basename "$check")" >/dev/null
done

for _ in 1 2; do
  docker exec "$container_id" psql -v ON_ERROR_STOP=1 -U postgres -d wokdb \
    -f /wok/seeds/menu_real_dev.sql >/dev/null
done

menu_count="$(docker exec "$container_id" psql -At -U postgres -d wokdb \
  -c 'SELECT count(*) FROM wok.menu_items')"
if [[ "$menu_count" != 31 ]]; then
  printf 'Expected 31 menu products after two seed runs, found %s.\n' "$menu_count" >&2
  exit 1
fi

printf 'PASS: %s migrations (V1–V51), %s SQL checks, and idempotent 31-product development seed on PostgreSQL 18.\n' \
  "${#migrations[@]}" "${#checks[@]}"
