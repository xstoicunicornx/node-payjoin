#!/usr/bin/env bash
#
# Start a throwaway bitcoind regtest node for local payjoin testing. Chain data
# lives in a datadir inside the repo so it's easy to delete later (just remove
# the directory). Re-running is a no-op if the node is already up.
#
# Connection defaults match the demo wallet client in src/utils.ts. Override
# with env vars:
#   BITCOIN_RPC_PORT (18443)  BITCOIN_RPC_USER (admin1)  BITCOIN_RPC_PASS (123)
#   DATADIR (<repo>/.bitcoin-regtest)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATADIR="${DATADIR:-${REPO_ROOT}/.bitcoin-regtest}"
RPC_PORT="${BITCOIN_RPC_PORT:-18443}"
RPC_USER="${BITCOIN_RPC_USER:-admin1}"
RPC_PASS="${BITCOIN_RPC_PASS:-123}"

for bin in bitcoind bitcoin-cli; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "error: ${bin} not found on PATH" >&2
    exit 1
  fi
done

cli() {
  bitcoin-cli -regtest -datadir="$DATADIR" "$@"
}

if cli getblockchaininfo >/dev/null 2>&1; then
  echo "regtest node already running (datadir: ${DATADIR})"
  exit 0
fi

mkdir -p "$DATADIR"
cat > "${DATADIR}/bitcoin.conf" <<EOF
regtest=1
server=1
fallbackfee=0.00001000
rpcuser=${RPC_USER}
rpcpassword=${RPC_PASS}

[regtest]
rpcport=${RPC_PORT}
EOF

echo "starting bitcoind (datadir: ${DATADIR})"
bitcoind -regtest -datadir="$DATADIR" -daemon >/dev/null

# Wait for the RPC to accept connections before returning.
for _ in $(seq 1 30); do
  if cli getblockchaininfo >/dev/null 2>&1; then
    echo "regtest node ready on port ${RPC_PORT}"
    exit 0
  fi
  sleep 0.5
done

echo "error: node did not become ready in time; check ${DATADIR}/regtest/debug.log" >&2
exit 1
