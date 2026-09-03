# On-chain design

Rule one: write as little Solidity as possible. Safe 1.4.1 and its module ecosystem
are audited and deployed everywhere; the product's value is off-chain. What follows is
what is used, what is deployed, and the small amount that is written.

## The account

**Safe 1.4.1 (SafeL2 singleton)** through `SafeProxyFactory.createProxyWithNonce`, with
`CompatibilityFallbackHandler` for treasuries (EIP-1271 messages, `getMessageHash`)
or `Safe4337Module` as fallback handler when a treasury wants to send user operations
too. Both handlers support 1271, so a treasury Safe can always be an owner of another
Safe and can always write cheques.

Owners are any of:

| Owner kind | What signs | On-chain shape |
| --- | --- | --- |
| EOA (browser wallet, hardware wallet) | secp256k1 over `safeTxHash` or `eth_sign` | 65-byte signature |
| Passkey signer | WebAuthn P-256 | `SafeWebAuthnSignerFactory` proxy (to deploy) or our `P256Owner` for raw P-256 |
| Recourse consumer account | its own two keys | nested contract signature (proven) |
| Another treasury Safe (a subsidiary, a DAO) | its owners | nested contract signature |

Threshold is the chain's floor. Everything richer is a module, a guard, or the
service.

## Modules and guards, and what each is for

| Need | Mechanism | Status on Arc | Action |
| --- | --- | --- | --- |
| One-signature spending under a cap, per member, per period | Safe **Allowance module** v0.1.1 (`allowances[safe][delegate][token]`: amount, spent, resetTimeMin, lastResetMin; `executeAllowanceTransfer` with the delegate's signature; **no destination check**, so pair it with the service's allowlist or the guard) | **present** at `0xAA46724893dedD72658219405185Fb0Fc91e091C`, registered for mainnet 5042 too | use; pin the bytecode hash |
| Time lock on member, threshold, module and policy changes | **Zodiac Delay** modifier (mastercopy + EIP-1167 proxy per Safe via `ModuleProxyFactory`; `txCooldown`, `txExpiration`, queue with `executeNextTx`, `skipExpired`) | absent | deploy `ModuleProxyFactory` and the Delay mastercopy at canonical addresses; the Safe enables the Delay as a module and the service submits owner changes through it |
| Deny unreadable or disallowed calls at execution | **Guard** (`checkTransaction` before, `checkAfterExecution` after) | none | write `TreasuryGuard` (below) only if a hard allowlist is demanded; otherwise none, because a guard that reverts can also brick a Safe if it is buggy |
| Lost-key recovery for treasuries whose members are EOAs | **Candide social recovery** (guardians, threshold, grace period) or the Recourse pattern (a Recourse account as member already has recovery) | absent | later; a treasury of Recourse accounts needs nothing here |
| Batch many transfers in one approval | `MultiSendCallOnly` (delegatecall) | present | use |
| Gas paid by the Safe | native refund in `execTransaction`, or the 4337 module | present | use |
| Cheques and invoices from the treasury | USDC EIP-3009 with 1271 | present, verified | use the consumer app's cheque code with the treasury as writer |

Deployment of absent modules: the Safe singleton factory (`0x914d7F…`) and the
Arachnid proxy are both on Arc, so `forge script` with the release bytecode and the
release salt reproduces the canonical address. The deploy script records addresses in
`deployments/arc-testnet.json` under `safe.modules`, and the backend refuses to enable
a module whose runtime bytecode hash differs from the pinned one.

## What is written

Two small contracts, both optional at launch.

### `TreasuryGuard` (optional, hard destination policy)

For teams that want "this Safe can only ever pay these addresses and these contracts"
enforced by the chain. A guard on a Safe runs on every `execTransaction`:

```solidity
contract TreasuryGuard is BaseGuard {
    // safe => (target => allowed), and safe => (selector => allowed) for contract calls
    mapping(address => mapping(address => bool)) public allowedTarget;
    mapping(address => mapping(bytes4 => bool)) public allowedSelector;
    mapping(address => bool) public unrestricted;   // a Safe can switch the guard off for itself, through the Delay

    function checkTransaction(address to, uint256 value, bytes calldata data, Enum.Operation op, ..., address) external view {
        address safe = msg.sender;
        if (unrestricted[safe]) return;
        require(op == Enum.Operation.Call || to == MULTISEND_CALL_ONLY, "delegatecall");
        if (to == MULTISEND_CALL_ONLY) { _checkEach(safe, data); return; }
        _check(safe, to, data);
    }
    function _check(address safe, address to, bytes calldata data) internal view {
        if (to == USDC || to == EURC) {                 // token transfers: check the recipient, not the token
            (bytes4 sel, address recipient) = _decodeTransfer(data);
            require(sel == IERC20.transfer.selector && allowedTarget[safe][recipient], "recipient");
            return;
        }
        require(allowedTarget[safe][to] && (data.length < 4 || allowedSelector[safe][bytes4(data[:4])]), "target");
    }
    function checkAfterExecution(bytes32, bool) external {}
}
```

Changes to the allowlist are calls from the Safe to the guard, so they go through the
threshold and, when the Delay is enabled, through the time lock. The guard must never
be able to revert on its own state change (Safe's "guard can brick" hazard): the
`unrestricted` switch is checked first and set through the same path.

### `PayrollAllowance` (optional, later)

The Allowance module is per delegate, per token, one budget. Payroll wants "this
run, these recipients, this total, once", executable by one operator after the
threshold approved the template. That can be built as a proposal that funds an
allowance for a payroll delegate, or as a small module that stores a Merkle root of
`(recipient, amount)` approved by the Safe and lets anyone execute the leaves.
Deferred until a customer asks; MultiSend under the threshold covers launch.

## Nested accounts: the Recourse member

A Recourse account is a Safe with owners [Cloud Key EOA, `P256Owner`, Recovery EOA],
threshold 2. As a member of a team Safe it signs like this:

1. The team Safe's `txBytes` (from `encodeTransactionData`) are the message.
2. The account's message hash is `keccak(0x1901 ‖ domain(account) ‖ keccak(SAFE_MSG_TYPEHASH ‖ keccak(txBytes)))`.
3. The Cloud Key signs it with ECDSA; the Device Key signs it with P-256 behind Face
   ID; the pair is packed in owner order (226 bytes with the P-256 dynamic part).
4. That packed blob is the contract signature of the account inside the team Safe's
   signatures (418 bytes total with one EOA co-signer).

Verified in `0x242880bba98c628f8bfe1dcf18bd7ab63bc66a66d8d51c5a29f34a1d43044fce`.
Cost: about 44k gas more than an EOA signature. The Recovery Key never takes part:
it can only sign owner swaps on the account itself, so a compromised Recourse cannot
vote in anyone's treasury.

## Sub-accounts

Squads gives a treasury numbered vaults under one member set. The Safe equivalent
is a child Safe whose single owner is the parent Safe (threshold 1): the parent's
members approve as usual, the child holds a budget, an allowance or a guard scoped to
its purpose (payroll, a vendor programme, a card), and the ledger shows both. A child
executes through the parent's signature, which is one nested contract signature,
the same shape as a Recourse member. Nothing to write.

## Deploying a treasury

```
1. owners, threshold chosen; the service predicts the address (createProxyWithNonce eth_call)
2. optional modules chosen; the initializer's `to`/`data` enables them in setup
   (SafeModuleSetup.enableModules([...])), fallbackHandler = CompatibilityFallbackHandler
3. anyone pays the deployment (the service does, ~0.008 USDC), or the first deposit
   arrives at the predicted address and the first execution's relayer deploys first
4. the indexer confirms owners == expected, threshold == expected, modules == expected
   before the treasury is shown as live (the consumer provisioning already does this)
```

## Audits and pinning

- Safe 1.4.1 contracts: audited (Ackee, Certora), formally verified in parts; bytecode
  on Arc matches canonical (code sizes match and the deployments file lists the chain).
- Safe4337Module v0.3.0: audited (Ackee); on Arc.
- Allowance module, Zodiac Delay, Roles: audited by G0 Group / Ackee; to deploy.
- `P256Owner`, `TreasuryGuard`: ours, small, tested; a third-party review before
  mainnet is a line item in `08-roadmap-and-grants.md`.
