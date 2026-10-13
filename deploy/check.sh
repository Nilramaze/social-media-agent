#!/usr/bin/env bash
# Read-only health check for the VPS deployment: .env completeness, Instagram
# credentials (incl. a live call against the Graph API), containers, item
# statuses and recent worker errors. Changes nothing and never prints a
# secret - only whether it is set, its length and whether it looks plausible.
#
# Usage on the VPS:  bash deploy/check.sh

cd "$(dirname "$0")/.." || exit 1
C="docker compose -f docker-compose.prod.yml"

# Value of a .env key without surrounding quotes; fails if the line is missing.
val() {
  local l
  l=$(grep -E "^$1=" .env | tail -1)
  [ -z "$l" ] && return 1
  l=${l#*=}
  l=${l#[\"\']}
  l=${l%[\"\']}
  printf '%s' "$l"
}

echo "== .env =="
for k in DOMAIN BASIC_AUTH_USER BASIC_AUTH_HASH POSTGRES_PASSWORD \
  S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET S3_REGION \
  ANTHROPIC_API_KEY OPENAI_API_KEY TAVILY_API_KEY ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID \
  INSTAGRAM_APP_ID INSTAGRAM_APP_SECRET INSTAGRAM_USER_ID INSTAGRAM_ACCESS_TOKEN; do
  if ! v=$(val "$k"); then s="FEHLT (Zeile nicht vorhanden)"
  elif [ -z "$v" ]; then s="LEER"
  elif echo "$v" | grep -qiE 'change-me|example\.com|replace-with'; then s="PLATZHALTER"
  else s="ok (${#v} Zeichen)"; fi
  printf '%-24s %s\n' "$k" "$s"
done

echo
echo "== Instagram-Werte plausibel? =="
if v=$(val INSTAGRAM_USER_ID) && [ -n "$v" ]; then
  [[ $v =~ ^[0-9]+$ ]] && echo "USER_ID: Zahl - ok" || echo "USER_ID: KEINE reine Zahl (Username statt Account-ID?)"
fi
if v=$(val INSTAGRAM_APP_ID) && [ -n "$v" ]; then
  [[ $v =~ ^[0-9]+$ ]] && echo "APP_ID: Zahl - ok" || echo "APP_ID: KEINE reine Zahl"
fi
if v=$(val INSTAGRAM_APP_SECRET) && [ -n "$v" ]; then
  [[ $v =~ ^[0-9a-f]{32}$ ]] && echo "APP_SECRET: 32 Hex-Zeichen - ok" || echo "APP_SECRET: sieht nicht wie ein App-Secret aus"
fi
if v=$(val INSTAGRAM_ACCESS_TOKEN) && [ -n "$v" ]; then
  [[ $v == EAA* ]] && echo "ACCESS_TOKEN (.env): beginnt mit EAA - ok" \
    || echo "ACCESS_TOKEN (.env): beginnt NICHT mit EAA (${#v} Zeichen) - falscher Wert?"
fi

echo
echo "== Instagram-Token in der DB (dieser wird tatsaechlich benutzt) =="
tok=$($C exec -T postgres psql -U sma -d sma -tAc "select access_token from social_accounts where platform='instagram'")
igid=$($C exec -T postgres psql -U sma -d sma -tAc "select external_account_id from social_accounts where platform='instagram'")
if [ -z "$tok" ]; then
  echo "kein Token in der DB - der Worker uebernimmt beim naechsten Zugriff den Wert aus .env"
else
  echo "Praefix: ${tok:0:3}   Laenge: ${#tok}"
  echo "Live-Test (Account abrufen):"
  curl -s "https://graph.facebook.com/v23.0/$igid?fields=username&access_token=$tok"
  echo
  if appid=$(val INSTAGRAM_APP_ID) && secret=$(val INSTAGRAM_APP_SECRET) && [ -n "$appid" ] && [ -n "$secret" ]; then
    echo "Token-Details (gueltig? Ablauf? Rechte?):"
    curl -s "https://graph.facebook.com/debug_token?input_token=$tok&access_token=$appid%7C$secret"
    echo
  fi
fi
$C exec -T postgres psql -U sma -d sma -c "select access_token_expires_at, access_token_refreshed_at, token_error from social_accounts where platform='instagram'"

echo
echo "== Container =="
$C ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'

echo
echo "== Content-Items nach Status =="
$C exec -T postgres psql -U sma -d sma -c "select status, count(*) from content_items group by 1 order by 1"

echo
echo "== Worker-Fehler (letzte 24h) =="
$C logs worker --since 24h 2>&1 | grep -iE 'error|failed|skipped' | tail -20
