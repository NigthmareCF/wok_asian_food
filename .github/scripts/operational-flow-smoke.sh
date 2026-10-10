#!/usr/bin/env bash
set -euo pipefail

current_step='initialization'
trap 'status=$?; echo "::error title=Operational smoke failed::Step: ${current_step}"; exit "$status"' ERR

current_step='read Compose network'
project=$(docker compose config --format json | jq -r '.name')
network="${project}_app_net"

current_step='require empty isolated fixture database'
# No sembrar ni ajustar horarios sobre una base que ya contiene usuarios/ventas.
empty_database=$(docker compose exec -T db sh -c \
  'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT NOT EXISTS (SELECT 1 FROM wok.users) AND NOT EXISTS (SELECT 1 FROM wok.orders) AND NOT EXISTS (SELECT 1 FROM wok.payments) AND NOT EXISTS (SELECT 1 FROM wok.order_requests);"' \
  | tr -d '\r')
[[ "$empty_database" == 't' ]]

current_step='verify pickup schedule boundaries in rollback-only fixture'
# CI envia SQL por stdin; resolver el include aqui evita depender de mounts del DB.
while IFS= read -r line; do
  if [[ "$line" == '\ir ../../.github/scripts/pickup-smoke-window.sql' ]]; then
    cat .github/scripts/pickup-smoke-window.sql
  else
    printf '%s\n' "$line"
  fi
done < database/tests/smoke_pickup_window.sql | docker compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null
printf 'PASS seven rollback-only pickup-window boundary checks\n'

current_step='seed demo data'
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < database/seeds/dev_demo.sql > /dev/null

current_step='seed client flow account'
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
INSERT INTO users (id, email, display_name, status, email_verified_at)
VALUES ('09a29fc4-eef8-43e6-bb88-f37158c2cbe9', 'client-other@wok.demo', 'Client Other', 'ACTIVE', now());
INSERT INTO user_credentials (user_id, password_hash)
SELECT '09a29fc4-eef8-43e6-bb88-f37158c2cbe9', password_hash
FROM user_credentials WHERE user_id = 'c9b8f7d9-1f27-4f05-b79a-580fe34165a2';
INSERT INTO user_roles (user_id, role_id)
SELECT '09a29fc4-eef8-43e6-bb88-f37158c2cbe9', id FROM roles WHERE code = 'CLIENT';
INSERT INTO customer_profiles (user_id, full_name)
VALUES ('09a29fc4-eef8-43e6-bb88-f37158c2cbe9', 'Client Other');
SQL

request() {
  local method=$1 path=$2 token=${3:-} json=${4:-} idempotency_key=${5:-}
  current_step="$method $path"
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
    printf 'Step %s: expected HTTP %s, got %s: %s\n' \
      "$current_step" "$1" "$http_status" "$http_body" >&2
    exit 1
  fi
  # Evidencia sin cuerpos, cookies ni tokens.
  printf 'PASS HTTP %s %s\n' "$http_status" "$current_step"
}

db_value() {
  current_step='query PostgreSQL fixture data'
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

request POST /api/v1/auth/login '' \
  '{"email":"client-other@wok.demo","password":"DemoOperativo2026","clientType":"WEB"}'
expect_status 200
other_client_token=$(jq -er '.accessToken' <<< "$http_body")

request GET /api/v1/operational/tables
expect_status 401
request GET /api/v1/operational/tables "$client_token"
expect_status 403
request GET /api/v1/operational/kitchen/tickets "$client_token"
expect_status 403
request GET /api/v1/client/order-requests
expect_status 401
request GET /api/v1/client/order-requests "$operational_token"
expect_status 403

table_id=$(db_value "SELECT id FROM wok.dining_tables WHERE name = 'Mesa 01';")
menu_item_id=$(db_value "SELECT id FROM wok.menu_items WHERE name = 'Gyozas de cerdo';")
[[ -n "$table_id" && -n "$menu_item_id" ]]

preparation_seconds=$(db_value "SELECT estimated_preparation_seconds FROM wok.menu_items WHERE id = '$menu_item_id';")
[[ "$preparation_seconds" =~ ^[0-9]+$ ]]
(( preparation_seconds + 120 <= 3 * 60 * 60 - 60 ))

select_pickup_window() {
  local now_utc
  now_utc=$(db_value "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');")
  docker compose exec -T db sh -c \
    'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v now_utc="$1" -v preparation_seconds="$2"' \
    sh "$now_utc" "$preparation_seconds" < .github/scripts/pickup-smoke-window.sql | tr -d '\r'
}

current_step='select pickup within real service window'
requested_for=$(select_pickup_window)
if [[ -z "$requested_for" ]]; then
  current_step='prepare deterministic hours only in empty isolated smoke database'
  # Solo fixture de esta base nueva: cubre lunes y cruces de medianoche.
  db_value "UPDATE wok.business_hours SET active = false WHERE service_type = 'RESTAURANT';
    INSERT INTO wok.business_hours(service_type, weekday, opens_at, closes_at, timezone_name)
    SELECT 'RESTAURANT', day, '00:00', '23:59:59', 'America/Guatemala'
    FROM generate_series(1,7) AS day;" > /dev/null
  requested_for=$(select_pickup_window)
  printf 'PASS isolated deterministic service-hours fixture\n'
else
  printf 'PASS existing service-hours window\n'
fi
[[ -n "$requested_for" ]]

# El mismo timestamp cumple preparación/máximo; cerrar el servicio debe rechazarlo.
# Restaurar la configuración antes del recorrido válido, sin aceptar422 como éxito.
current_step='negative pickup outside service window'
restore_hours=$(db_value "SELECT string_agg(format('UPDATE wok.business_hours SET active = %L WHERE id = %L;', active, id), E'\n') FROM wok.business_hours WHERE service_type = 'RESTAURANT';")
db_value "UPDATE wok.business_hours SET active = false WHERE service_type = 'RESTAURANT';" > /dev/null
negative_pickup_json=$(jq -nc --arg item "$menu_item_id" --arg requested_for "$requested_for" \
  '{requestedFor:$requested_for,items:[{menuItemId:$item,quantity:1}]}')
negative_pickup_key='85ea0654-a18e-4921-a7ed-36f1fef2ed13'
request POST /api/v1/client/order-requests "$client_token" "$negative_pickup_json" "$negative_pickup_key"
expect_status 422
jq -e '.message | contains("horario debe estar dentro del servicio")' <<< "$http_body" > /dev/null
[[ "$(db_value "SELECT count(*) FROM wok.order_requests WHERE idempotency_key = '$negative_pickup_key';")" == '0' ]]
db_value "$restore_hours" > /dev/null
printf 'PASS outside-service rejection and zero persisted requests\n'
requested_for=$(select_pickup_window)
[[ -n "$requested_for" ]]

quote_request_json=$(jq -nc --arg item "$menu_item_id" --arg requested_for "$requested_for" \
  '{fulfillmentType:"PICKUP",requestedFor:$requested_for,items:[{menuItemId:$item,quantity:1}]}')
quote_idempotency_key='f1f2d0d9-9db9-4d7d-8671-bbb38670fa8d'
request POST /api/v1/client/order-quotes "$client_token" "$quote_request_json" "$quote_idempotency_key"
expect_status 201
quote_id=$(jq -er '.quoteId' <<< "$http_body")

pickup_request_json=$(jq -nc --arg item "$menu_item_id" --arg requested_for "$requested_for" --arg quote "$quote_id" \
  '{requestedFor:$requested_for,customerNote:"Smoke security flow",quoteId:$quote,items:[{menuItemId:$item,quantity:1}]}')
pickup_idempotency_key='85ea0654-a18e-4921-a7ed-36f1fef2ed12'
request POST /api/v1/client/order-requests "$operational_token" "$pickup_request_json" "$pickup_idempotency_key"
expect_status 403
request POST /api/v1/client/order-requests "$client_token" "$pickup_request_json" "$pickup_idempotency_key"
expect_status 202
pickup_request_id=$(jq -er '.requestId' <<< "$http_body")

request GET "/api/v1/client/order-requests/$pickup_request_id" "$client_token"
expect_status 200
jq -e '.status == "PENDING_REVIEW" and .orderId == null and .orderStatus == null' <<< "$http_body" > /dev/null
request GET "/api/v1/client/order-requests/$pickup_request_id" "$other_client_token"
expect_status 404

request POST "/api/v1/operational/order-requests/$pickup_request_id/decision" "$operational_token" \
  '{"action":"ACCEPT"}'
expect_status 200
pickup_order_id=$(jq -er 'select(.status == "ACCEPTED") | .orderId' <<< "$http_body")

request GET "/api/v1/client/order-requests/$pickup_request_id" "$client_token"
expect_status 200
jq -e --arg order "$pickup_order_id" \
  '.status == "ACCEPTED" and .orderId == $order and .orderStatus == "SENT"' <<< "$http_body" > /dev/null

request GET /api/v1/operational/kitchen/tickets "$operational_token"
expect_status 200
pickup_ticket_id=$(jq -er --arg order "$pickup_order_id" \
  '.[] | select(.orderId == $order and .status == "QUEUED") | .id' <<< "$http_body")
request POST "/api/v1/operational/kitchen/tickets/$pickup_ticket_id/claim" "$operational_token"
expect_status 200
pickup_ticket_version=$(jq -er 'select(.status == "PREPARING") | .rowVersion' <<< "$http_body")
request PATCH "/api/v1/operational/kitchen/tickets/$pickup_ticket_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$pickup_ticket_version" '{status:"READY",expectedVersion:$version}')"
expect_status 200

request GET "/api/v1/client/order-requests/$pickup_request_id" "$client_token"
expect_status 200
jq -e '.orderStatus == "READY"' <<< "$http_body" > /dev/null

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

request POST "/api/v1/operational/orders" "$operational_token" "$order_json" "$idempotency_key"
expect_status 201
jq -e --arg id "$order_id" '.orderId == $id and .idempotentReplay == true' <<< "$http_body" > /dev/null

changed_order_json=$(jq '.items[0].quantity = 3' <<< "$order_json")
request POST "/api/v1/operational/orders" "$operational_token" "$changed_order_json" "$idempotency_key"
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
expect_status 409
request POST "/api/v1/operational/tables/$table_id/close" "$operational_token"
expect_status 409

payment_key='9a646dd1-2026-49fa-844f-006000000001'
request POST "/api/v1/operational/accounts/$account_id/payments" '' \
  '{"method":"TRANSFER","amount":50}' "$payment_key"
expect_status 401
request POST "/api/v1/operational/accounts/$account_id/payments" "$client_token" \
  '{"method":"TRANSFER","amount":50}' "$payment_key"
expect_status 403
request POST "/api/v1/operational/tables/$table_id/close" ''
expect_status 401
request POST "/api/v1/operational/tables/$table_id/close" "$client_token"
expect_status 403

request POST "/api/v1/operational/accounts/$account_id/payments" "$operational_token" \
  '{"method":"TRANSFER","amount":50}' "$payment_key"
expect_status 201
payment_id=$(jq -er 'select(.amount == 50 and .balance == 86 and .accountStatus == "OPEN") | .paymentId' <<< "$http_body")
request POST "/api/v1/operational/accounts/$account_id/payments" "$operational_token" \
  '{"method":"TRANSFER","amount":50}' "$payment_key"
expect_status 201
jq -e --arg id "$payment_id" '.paymentId == $id and .idempotentReplay == true' <<< "$http_body" > /dev/null
[[ "$(db_value "SELECT count(*) FROM wok.payments WHERE account_id = '$account_id';")" == '1' ]]
request PATCH "/api/v1/operational/orders/$order_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$served_version" '{status:"CLOSED",expectedVersion:$version}')"
expect_status 409
request POST "/api/v1/operational/tables/$table_id/close" "$operational_token"
expect_status 409

request POST "/api/v1/operational/accounts/$account_id/payments" "$operational_token" \
  '{"method":"TRANSFER"}' '9a646dd1-2026-49fa-844f-006000000002'
expect_status 201
jq -e '.amount == 86 and .balance == 0 and .accountStatus == "PAID"' <<< "$http_body" > /dev/null
request GET "/api/v1/operational/accounts/$account_id" "$operational_token"
expect_status 200
jq -e '.total == 136 and .paid == 136 and .balance == 0 and (.payments | length) == 2' <<< "$http_body" > /dev/null

request PATCH "/api/v1/operational/orders/$order_id/status" "$operational_token" \
  "$(jq -nc --argjson version "$served_version" '{status:"CLOSED",expectedVersion:$version}')"
expect_status 200
jq -e '.status == "CLOSED"' <<< "$http_body" > /dev/null

request POST "/api/v1/operational/tables/$table_id/close" "$operational_token"
expect_status 200
jq -e '.status == "CLEANING"' <<< "$http_body" > /dev/null

printf 'Operational HTTP/PostgreSQL flow passed: client ownership, pickup tracking, table, order, replay, kitchen, roles, partial/full payment and zero-balance close.\n'
