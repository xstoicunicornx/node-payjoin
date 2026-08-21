#!/usr/bin/env bash
#
# Create and fund the `sender` and `receiver` regtest wallets the demo expects.
# Assumes a bitcoind regtest node is already running (see the README for how to
# start one). Idempotent: existing wallets are loaded and topped up with more
# blocks rather than recreated.
#
# Connection defaults match the demo wallet client in src/utils.ts. Override
# with env vars:
#   BITCOIN_RPC_HOST (127.0.0.1)  BITCOIN_RPC_PORT (18443)
#   BITCOIN_RPC_USER (admin1)     BITCOIN_RPC_PASS (123)
#   BLOCKS (101)  number of blocks to mine to each wallet
#
set -euo pipefail

RPC_HOST="${BITCOIN_RPC_HOST:-127.0.0.1}"
RPC_PORT="${BITCOIN_RPC_PORT:-18443}"
RPC_USER="${BITCOIN_RPC_USER:-admin1}"
RPC_PASS="${BITCOIN_RPC_PASS:-123}"
# Coinbase outputs need 100 confirmations to mature, so 101 blocks yields at
# least one spendable UTXO per wallet.
BLOCKS="${BLOCKS:-101}"

cli() {
  bitcoin-cli -regtest \
    -rpcconnect="$RPC_HOST" -rpcport="$RPC_PORT" \
    -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASS" "$@"
}

if ! command -v bitcoin-cli >/dev/null 2>&1; then
  echo "error: bitcoin-cli not found on PATH" >&2
  exit 1
fi

if ! cli getblockchaininfo >/dev/null 2>&1; then
  echo "error: can't reach the regtest node at ${RPC_HOST}:${RPC_PORT}." >&2
  echo "       Start bitcoind on regtest first (see the README)." >&2
  exit 1
fi

ensure_wallet() {
  local w="$1"
  if cli listwallets | grep -q "\"${w}\""; then
    echo "wallet '${w}' already loaded"
  elif cli loadwallet "$w" >/dev/null 2>&1; then
    echo "loaded existing wallet '${w}'"
  else
    cli createwallet "$w" >/dev/null
    echo "created wallet '${w}'"
  fi
}

fund() {
  local w="$1"
  local addr
  addr=$(cli -rpcwallet="$w" getnewaddress)
  cli -rpcwallet="$w" generatetoaddress "$BLOCKS" "$addr" >/dev/null
  echo "mined ${BLOCKS} blocks to '${w}' (${addr})"
}

for w in sender receiver; do
  ensure_wallet "$w"
  fund "$w"
done

echo
echo "balances:"
for w in sender receiver; do
  printf '  %-9s %s BTC\n' "$w" "$(cli -rpcwallet="$w" getbalance)"
done
