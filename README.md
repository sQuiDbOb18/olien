# Olien

A team account for stablecoins. Members approve together, spend under a limit, and
sign with a passkey rather than a seed phrase.

Ethereum has Safe and Solana has Squads. Olien is the account protocol for chains that
have neither, with a transaction service and a console on top of it.

## Live on Monad testnet, chain 10143

Deployed 2026-09-16 through the Arachnid CREATE2 deployer, so every address is a pure
function of a fixed salt and the creation code.

| Contract | Address |
| --- | --- |
| OlienFactory | `0xaF8c108D09E6A159D4dcE0919Ca6A81d6019f131` |
| Olien implementation | `0x8BFf8CCe4edbE882a21197D3942978CCd06fA427` |
| SubAccount implementation | `0xDfc576536187eF72689c514f8c7ea6487960a637` |
| OlienVerifier | `0xE196558Ce080229B256dDE6e62CDA2B051B882fC` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

The same four addresses hold on Arc testnet, and the deployed bytecode was read off both
chains and hashed to confirm it: identical.

## Layout

| Path | What it is |
| --- | --- |
| `contracts/` | The account: the verifier, the sub-account, the account and its factory |
| `service/` | The transaction service and the chain indexer |
| `console/` | The web console, one deployment per chain |
| `docs/` | The research and the design, including the account specification |
| `deployments/` | One address book per chain, named by chain id |
| `ops/` | Chain readiness checks and deploy scripts |

## Running it

```sh
# contracts
cd contracts && forge test

# console, one chain per build
cd console && npm install
NEXT_PUBLIC_OLIEN_CHAIN=monad-testnet NEXT_PUBLIC_OLIEN_CONSOLE=on npm run build
```

Check a chain before deploying to it, which reads the chain and writes nothing:

```sh
ops/monad-check.sh              # testnet, 10143
ops/monad-check.sh --mainnet    # mainnet, 143
```

## Notes

Gas on Monad is MON, not the stablecoin. `eth_getLogs` is capped at 100 blocks on every
public Monad testnet endpoint tested, so the indexer takes its chunk size from the chain
rather than a constant.

`docs/10-account-spec.md` is the contract, normatively. `docs/12-metropolis.md` records
what has been proved on chain, with transaction hashes.
