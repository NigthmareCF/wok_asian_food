#!/usr/bin/env bash
set -euo pipefail

project=$(docker compose config --format json | jq -r '.name')
network="${project}_app_net"

docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < database/seeds/dev_demo.sql > /dev/null

docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > /dev/null <<'SQL'
SET search_path = wok, public;
INSERT INTO users (id, email, display_name, status, email_verified_at)
VALUES ('b849b4e6-1a03-4e5e-a2ee-8248d8ee3284', 'client-flow@wok.demo', 'Client Flow', 'ACTIVE', now());
INSERT INTO user_credentials (user_id, password_hash)
SELECT 'b849b4e6-1a03-4e5e-a2ee-8248d8ee3284', password_hash
FROM user_credentials WHERE user_id = 'c9b8f7d9-1f27-4f05-b79a-580fe34165a2';
INSERT INTO user_roles (user_id, role_id)
SELECT 'b849b4e6-1a03-4e5e-a2ee-8248d8ee3284', id FROM roles WHERE code = 'CLIENT';
INSERT INTO customer_profiles (user_id, full_name)
VALUES ('b849b4e6-1a03-4e5e-a2ee-8248d8ee3284', 'Client Flow');
SQL

request() {
  local method=$1 path=$2 token=${3:-} json=${4:-} idempotency_key=${5:-}
  local -a args=(--silent --show-error --request "$method" --write-out '\n%{http_code}')
  if [[ -n "$token" ]]; then args+=(--header "Authorization: Bearer $token"); fi
  if [[ -n "$json" ]]; then args+=(--header 'Content-Type: application/json' --data "$json"); fi
  if [[ -n "$idempotency_key" ]]; then args+=(--header "Idempotency-Key: $idempotency_key"); fi
  local response
  response=$(docker run --rm --network "$network" curlimages/curl:8.16.0 \
    "${args[@]}" "http://api:8080$path")
  http_status=${response##*$'\n'}
  http_body=${response%$'\n'*}
}

expect_status() {
  if [[ "$http_status" != "$1" ]]; then
    printf 'Expected HTTP %s, got %s: %s\n' "$1" "$http_status" "$http_body" >&2
    exit 1
  fi
}

db_value() {
  docker compose exec -T db sh -c \
    'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' \
    sh "$1" | tr -d '\r'
}

request POST /api/v1/auth/login '' \
  '{"email":"operativo@wok.demo","password":"DemoOperativo2026","clientType":"WEB"}'
expect_status 200
operational_token=$(jq -er '.accessToken' <<< "$http_body")

request POST /api/v1/auth/login '' \
  '{"email":"client-flow@wok.demo","password":"DemoOperativo2026","clientType":"WEB"}'
expect_status 200
client_token=$(jq -er '.accessToken' <<< "$http_body")

request GET /api/v1/operational/tables
expect_status 401
request GET /api/v1/operational/tables "$client_token"
expect_status 403
request GET /api/v1/operational/kitchen/tickets "$client_token"
expect_status 403

table_id=$(db_value "SELECT id FROM wok.dining_tables WHERE name = 'Mesa 01';")
menu_item_id=$(db_value "SELECT id FROM wok.menu_items WHERE name = 'Gyozas de cerdo';")
[[ -n "$table_id" && -n "$menu_item_id" ]]

request POST "/api/v1/operational/tables/$table_id/open" "$operational_token"
expect_status 200
account_id=$(jq -er --arg table "$table_id" 'select(.id == $table and .status == "OCCUPIED") | .accountId' <<< "$http_body")

order_json=$(jq -nc --arg account "$account_id" --arg item "$menu_item_id" \
  '{accountId:$account,channel:"DINE_IN",guestCount:2,items:[{menuItemId:$item,quantity:2,fulfillment:"DINE_IN"}]}')
idempotency_key='79ab58d0-d770-409b-9813-834d3282c2b5'
request POST /api/v1/operational/orders "$client_token" "$order_json" "$idempotency_key"
expect_status 403
request POST /api/v1/operational/orders "$operational_token" "$order_json" "$idempotency_key"
expect_status 201
order_id=$(jq -er 'select(.status == "SENT" and .subtotal == 136 and .idempotentReplay == false) | .orderId' <<< "$http_body")

request POST /api/v1/operational/orders "$operational_token" "$order_json" "$idempotency_key"
expect_status 201
jq -e --arg id "$order_id" '.orderId == $id and .idempotentReplay == true' <<< "$http_body" > /dev/null

changed_order_json=$(jq '.items[0].quantity = 3' <<< "$order_json")
request POST /api/v1/operational/orders "$operational_token" "$changed_order_json" "$idempotency_key"
expect_status 409

[[ "$(db_value "SELECT count(*) FROM wok.orders WHERE id = '$order_id';")" == '1' ]]
[[ "$(db_value "SELECT count(*) FROM wok.kitchen_tickets WHERE order_id = '$order_id';")" == '1' ]]

request POST "/api/v1/operational/tables/$table_id/close" "$operational_token"
expect_status 409
request GET /api/v1/operational/kitchen/tickets "$operational_token"
expect_status 200
ticket_id=$(jq -er --arg order "$order_id" '.[] | select(.orderId == $order and .status == "QUEUED") | .id' <<< "$http_body")

request POST "/api/v1/operational/kitchen/tickets/$ticket_id/claim" "$operational_token"
expect_status 200
ticket_version=$(jq -er 'select(.status == "PREPARING") | .rowVersion' <<< "$http_body")

request PATCH "/api/v1/operational/kitchen/tickets/$ticket_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$ticket_version" '{status:"READY",expectedVersion:$version}')"
expect_status 200
jq -e '.status == "READY"' <<< "$http_body" > /dev/null

request GET "/api/v1/operational/orders/$order_id" "$operational_token"
expect_status 200
order_version=$(jq -er 'select(.order.status == "READY" and .tickets[0].status == "READY") | .order.rowVersion' <<< "$http_body")

request PATCH "/api/v1/operational/orders/$order_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$order_version" '{status:"SERVED",expectedVersion:$version}')"
expect_status 200
served_version=$(jq -er 'select(.status == "SERVED") | .rowVersion' <<< "$http_body")

request PATCH "/api/v1/operational/orders/$order_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$served_version" '{status:"CLOSED",expectedVersion:$version}')"
expect_status 200
jq -e '.status == "CLOSED"' <<< "$http_body" > /dev/null

request POST "/api/v1/operational/tables/$table_id/close" "$operational_token"
expect_status 200
jq -e '.status == "CLEANING"' <<< "$http_body" > /dev/null

printf 'Operational HTTP/PostgreSQL flow passed: table, order, replay, kitchen, roles and close.\n'
