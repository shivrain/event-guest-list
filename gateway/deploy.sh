#!/usr/bin/env bash
# Deploys the gateway to Cloudflare Workers. Safe to run again later.
#   ./deploy.sh            - full deploy (login, KV, secrets, deploy, write config.js)
#   ./deploy.sh --key      - only (re)enter the Claude API key
#   ./deploy.sh --code     - only set or change the optional access code
set -euo pipefail
cd "$(dirname "$0")"

W="npx --yes wrangler@4"

if [ "${1:-}" = "--key" ]; then $W secret put ANTHROPIC_API_KEY; exit 0; fi
if [ "${1:-}" = "--code" ]; then $W secret put ACCESS_CODE; exit 0; fi

[ -d node_modules ] || npm install --no-audit --no-fund

echo "▸ Cloudflare login"
if ! $W whoami >/dev/null 2>&1; then $W login; fi

echo "▸ Spend counter (KV)"
if grep -q KV_ID_PLACEHOLDER wrangler.jsonc; then
  ID=$($W kv namespace create SPEND 2>&1 | grep -oE '"id": *"[0-9a-f]+"' | grep -oE '[0-9a-f]{32}' | head -1 || true)
  if [ -z "$ID" ]; then
    # Namespace may exist from an earlier run.
    ID=$($W kv namespace list | python3 -c 'import sys,json; ns=[n for n in json.load(sys.stdin) if n["title"].endswith("SPEND")]; print(ns[0]["id"] if ns else "")')
  fi
  [ -n "$ID" ] || { echo "Could not create the KV namespace"; exit 1; }
  sed -i '' "s/KV_ID_PLACEHOLDER/$ID/" wrangler.jsonc
fi

echo "▸ Claude API key (paste it; it is sent to Cloudflare only)"
if ! $W secret list 2>/dev/null | grep -q ANTHROPIC_API_KEY; then $W secret put ANTHROPIC_API_KEY; fi

echo "▸ Deploy"
OUT=$($W deploy 2>&1 | tee /dev/stderr)
URL=$(echo "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || { echo "Deployed, but could not read the URL from the output. Run: $W deployments list"; exit 1; }

echo "▸ Pointing the page at $URL"
printf '// Set by gateway/deploy.sh. Empty string = Claude features off.\nwindow.GATEWAY_URL = "%s";\n' "$URL" > ../config.js
echo
echo "Done. Commit and push config.js to switch the Claude features on:"
echo "  git add config.js gateway/wrangler.jsonc && git commit -m 'Point page at gateway' && git push"
