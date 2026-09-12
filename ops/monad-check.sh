#!/bin/zsh
# Monad readiness, the sibling of arc-mainnet-check.sh.
#
#   ops/monad-check.sh              testnet, chain 10143
#   ops/monad-check.sh --mainnet    mainnet, chain 143
#
# It deploys nothing and signs nothing. Olien's four contracts are pure functions of a
# fixed salt and their creation code through the Arachnid deployer, so they land on the
# same addresses on every chain that has that deployer and the v0.7 EntryPoint. This
# answers whether Monad is such a chain, and whether those addresses are still ours to
# take.
#
# The hashes below were read off Arc testnet on 2026-09-12. Identical bytecode is the
# check that matters for the two canonical pieces, because they are other people's.
# For our four, absent is the expected answer before a deploy and fine; present with
# our hash means the deploy already ran and is fine; a different hash at one of those
# addresses is the one answer that stops everything.
#
# Gas here is MON, not USDC, so the relayer's balance is part of readiness rather than
# a detail: a funded deployer is the difference between the 17th being execution and
# the 17th being a faucet queue.
set -u
export PATH="/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin:$HOME/.foundry/bin:$PATH"

if [ "${1:-}" = "--mainnet" ]; then
  EXPECTED_CHAIN=143
  RPC="${MONAD_RPC:-https://rpc.monad.xyz}"
  USDC=0x754704Bc059F8C67012fEd69BC8A327a5aafb603
  LABEL="Monad mainnet"
else
  EXPECTED_CHAIN=10143
  RPC="${MONAD_RPC:-https://testnet-rpc.monad.xyz}"
  USDC=0x534b2f3A21130d7a60830c2Df862319e593943A3
  LABEL="Monad testnet"
fi
FAILED=0

echo "$LABEL check, $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "RPC $RPC"
echo

CHAIN=$(cast chain-id --rpc-url "$RPC" 2>/dev/null || echo "")
if [ -z "$CHAIN" ]; then
  echo "The RPC does not answer. Set MONAD_RPC if the endpoint above is not the one to use."
  exit 1
fi
if [ "$CHAIN" != "$EXPECTED_CHAIN" ]; then
  echo "Wrong chain: the RPC says $CHAIN, this run expects $EXPECTED_CHAIN."
  exit 1
fi
echo "chain $CHAIN, head $(cast block-number --rpc-url "$RPC")"
echo

echo "Canonical pieces, which must be present and byte for byte the ones Arc proved:"
while read -r NAME ADDRESS EXPECTED; do
  [ -z "$NAME" ] && continue
  CODE=$(cast code "$ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "0x")
  if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
    printf "  %-22s MISSING   %s\n" "$NAME" "$ADDRESS"
    FAILED=1
    continue
  fi
  ACTUAL=$(cast keccak "$CODE")
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    printf "  %-22s ok        %s\n" "$NAME" "$ADDRESS"
  else
    printf "  %-22s DIFFERENT %s\n" "$NAME" "$ADDRESS"
    printf "  %-22s           Arc   %s\n" "" "$EXPECTED"
    printf "  %-22s           Monad %s\n" "" "$ACTUAL"
    FAILED=1
  fi
done <<'EOF'
create2Deployer 0x4e59b44847b379578588920cA78FbF26c0B4956C 0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989
entryPointV07 0x0000000071727De22E5E9d8BAf0edAc6f37da032 0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58
EOF

echo
echo "Olien's four, free before the deploy and ours after it:"
DEPLOYED=0
while read -r NAME ADDRESS EXPECTED; do
  [ -z "$NAME" ] && continue
  CODE=$(cast code "$ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "0x")
  if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
    printf "  %-24s free      %s\n" "$NAME" "$ADDRESS"
    continue
  fi
  ACTUAL=$(cast keccak "$CODE")
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    printf "  %-24s ours      %s\n" "$NAME" "$ADDRESS"
    DEPLOYED=$((DEPLOYED + 1))
  else
    printf "  %-24s OCCUPIED by other code, stop and work out why\n" "$NAME"
    FAILED=1
  fi
done <<'EOF'
olien.verifier 0xE196558Ce080229B256dDE6e62CDA2B051B882fC 0xe41738bb73343ceee06a521cc23c8e189f2ed47126eade22bdd0c1257ee95b6f
olien.subAccount 0xDfc576536187eF72689c514f8c7ea6487960a637 0x4290a97245250de75b279290a9f5009115e5861e8d3f0a85e21c55098258c818
olien.implementation 0x8BFf8CCe4edbE882a21197D3942978CCd06fA427 0x7d546243e9c3e421834ed83525c19845c333664ec6128b86abbc3f4b8679b9fc
olien.factory 0xaF8c108D09E6A159D4dcE0919Ca6A81d6019f131 0x39b4f3ea2723b5cec45c3a114036fba72f5f745b81a6012ca797574d4fb69f6b
EOF
echo "  $DEPLOYED of 4 deployed"

echo
echo "The dollar:"
SYMBOL=$(cast call $USDC "symbol()(string)" --rpc-url "$RPC" 2>/dev/null || echo "unreadable")
DECIMALS=$(cast call $USDC "decimals()(uint8)" --rpc-url "$RPC" 2>/dev/null || echo "?")
echo "  $USDC answers $SYMBOL with $DECIMALS decimals"

# Gas is MON here. A deployer with none is the most likely reason a deploy day stalls,
# and it is the one thing on this list that a faucet fixes in a minute.
echo
echo "Gas, which is MON and not USDC:"
if [ -n "${RELAYER_ADDRESS:-}" ]; then
  BAL=$(cast balance "$RELAYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "")
  if [ -z "$BAL" ]; then
    echo "  could not read a balance for $RELAYER_ADDRESS"
    FAILED=1
  else
    echo "  $RELAYER_ADDRESS holds $(cast from-wei "$BAL") MON"
    if [ "$BAL" = "0" ]; then
      echo "  that is nothing, so no deploy will land. Faucet MON before the 17th."
      FAILED=1
    fi
  fi
else
  echo "  set RELAYER_ADDRESS to have this checked"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "Ready. Nothing was deployed, which is the point."
else
  echo "Not ready. Something above is missing, occupied, or unfunded."
fi
exit $FAILED
