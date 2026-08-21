#!/usr/bin/env bash
#
# Stop the throwaway bitcoind regtest node started by start-regtest.sh. The
# chain data is left in place; delete the datadir yourself to wipe it. No-op if
# nothing is running.
#
# Override the datadir with DATADIR (defaults to <repo>/.bitcoin-regtest).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATADIR="${DATADIR:-${REPO_ROOT}/.bitcoin-regtest}"

if ! command -v bitcoin-cli >/dev/null 2>&1; then
  echo "error: bitcoin-cli not found on PATH" >&2
  exit 1
fi

cli() {
  bitcoin-cli -regtest -datadir="$DATADIR" "$@"
}

if ! cli getblockchaininfo >/dev/null 2>&1; then
  echo "no regtest node running (datadir: ${DATADIR})"
  exit 0
fi

cli stop >/dev/null
echo "stopping bitcoind (datadir: ${DATADIR})"

# Wait for the process to actually shut down and release the RPC port.
for _ in $(seq 1 30); do
  if ! cli getblockchaininfo >/dev/null 2>&1; then
    echo "regtest node stopped"
    exit 0
  fi
  sleep 0.5
done

echo "error: node did not stop in time; check ${DATADIR}/regtest/debug.log" >&2
exit 1
