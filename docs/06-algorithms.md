# Algorithms

The procedures the service and the clients run. Each one names where it already
exists in the repository when it does. Pseudocode is language-neutral; the Swift and
Rust are the same steps.

## 1. Safe transaction hash

Safe 1.4.1, EIP-712 with a two-field domain.

```
DOMAIN_TYPEHASH = keccak("EIP712Domain(uint256 chainId,address verifyingContract)")
SAFE_TX_TYPEHASH = keccak("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")

domain(safe)   = keccak(DOMAIN_TYPEHASH ‖ pad32(chainId) ‖ pad32(safe))
structHash     = keccak(SAFE_TX_TYPEHASH ‖ pad32(to) ‖ pad32(value) ‖ keccak(data) ‖ pad32(operation)
                        ‖ pad32(safeTxGas) ‖ pad32(baseGas) ‖ pad32(gasPrice) ‖ pad32(gasToken)
                        ‖ pad32(refundReceiver) ‖ pad32(nonce))
txBytes        = 0x1901 ‖ domain(safe) ‖ structHash        # what encodeTransactionData returns
safeTxHash     = keccak(txBytes)
```

Exists: `SafeHashing.transactionHash` (Swift, `mobile/.../SafeSigning.swift`), and the
backend asks the Safe itself (`getTransactionHash`) in `services/safe.rs`. Rule: the
service computes locally and, once per Safe, compares against the chain's answer for
a fixed sample; a mismatch disables the Safe rather than risking a wrong hash.

## 2. Safe message hash (what a contract owner signs)

```
SAFE_MSG_TYPEHASH = keccak("SafeMessage(bytes message)")
messageHash(safe, message) = keccak(0x1901 ‖ domain(safe) ‖ keccak(SAFE_MSG_TYPEHASH ‖ keccak(message)))
```

Two uses:

- **A Safe signs an EIP-712 digest for a third contract** (a cheque for USDC):
  `message = abi.encode(digest)` = the 32 bytes of the digest.
- **A Safe signs another Safe's transaction** (a member account approving a team
  transaction): `message = txBytes` of the outer transaction, the full pre-image, not
  its hash, because Safe 1.4.1 calls the owner's legacy `isValidSignature(bytes data,
  bytes signature)` with `data = txBytes`.

Verified against `getMessageHash` on the live Safe for both shapes. Exists:
`SafeHashing.messageHash` (32-byte message form); the general form is the same
function with the message bytes in place of the digest.

## 3. Signature packing

Safe reads `signatures` as `n` static parts of 65 bytes, sorted by owner address
ascending, followed by a dynamic tail for contract signatures.

```
pack(entries):                                   # entries: (owner, kind, bytes)
  sort entries by owner ascending
  static = ""; dynamic = ""
  staticLen = 65 * len(entries)
  for (owner, kind, sig) in entries:
    if kind == ECDSA:                            # 65 bytes, v in {27, 28}
      static += liftV(sig)
    elif kind == CONTRACT:
      static += pad32(owner) ‖ pad32(staticLen + len(dynamic)) ‖ 0x00
      dynamic += pad32(len(sig)) ‖ sig ‖ zeroPadTo32(sig)
    elif kind == APPROVED_HASH:                  # owner called approveHash(hash) on-chain
      static += pad32(owner) ‖ pad32(0) ‖ 0x01
    elif kind == ETH_SIGN:                       # signature over "\x19Ethereum Signed Message:\n32" ‖ hash
      static += sig with v += 4                  # v in {31, 32}
  return static ‖ dynamic
```

Nested: the inner Safe's packed bytes are simply the `sig` of a `CONTRACT` entry in
the outer pack. Exists: `SafeSignatures.pack` (Swift, ECDSA and CONTRACT); Rust
`pack_signatures` (ECDSA only, extend with the same rule).

Contract signatures make `execTransaction` cost more (the outer Safe calls the inner
one, which runs its own `checkSignatures`); measured 155,851 gas for one nested
2-of-3 signature versus about 112k for two EOAs.

## 4. Verifying a confirmation before storing it

```
verify(proposal, owner, kind, sig):
  assert owner in proposal.safe.owners (as of latest indexed state)
  h = proposal.safeTxHash
  if kind == ECDSA:     assert ecrecover(h, sig) == owner
  if kind == ETH_SIGN:  assert ecrecover(prefixed(h), sig) == owner
  if kind == CONTRACT:  assert eth_call(owner, isValidSignature(txBytes, sig)) == 0x20c13b0b
                        # the legacy selector, because that is what the Safe will call
  if kind == APPROVED:  assert eth_call(safe, approvedHashes(owner, h)) == 1
  store; if count(distinct owners) >= threshold: mark ready (subject to §6, §7)
```

For a Recourse account the `CONTRACT` check is an `eth_call` that costs nothing and
exercises exactly the path the chain will take.

## 5. The nonce queue

Safe executes nonces strictly in order. Everything about "pending" follows from that.

- **Assign** `nonce = max(chainNonce, highestQueuedNonce + 1)` unless the proposer
  asks for a specific slot (to compete with an existing proposal).
- **Ready** means: threshold met, hard policies pass, and `nonce == chainNonce`.
  A proposal with a higher nonce is `blocked` by the ones before it and says so.
- **Conflict**: two proposals at one nonce. Both can collect signatures; the first to
  execute wins; the indexer sees `ExecutionSuccess` for one `safeTxHash` and marks
  every other proposal at that nonce `replaced`.
- **Cancel** an open proposal that already has signatures: propose a zero-value call
  to the Safe itself at the same nonce (Safe's convention); executing it burns the
  slot. A proposal with no signatures is simply deleted.
- **Reorder**: not possible on-chain. The service offers "move up" by cloning the
  proposal at a lower free nonce and cancelling the original, and says which
  signatures need to be collected again.
- **Batch**: several transfers in one slot through `MultiSendCallOnly` (delegatecall,
  operation 1) so one approval round covers a payroll run. Encoding:
  `multiSend(bytes)` where the bytes are `operation(1) ‖ to(20) ‖ value(32) ‖ dataLen(32) ‖ data` repeated.

Reconciliation runs on every indexed block: `chainNonce = Safe.nonce()`; any open
proposal with `nonce < chainNonce` is `executed` (if its hash appears in the logs) or
`replaced`.

- **Expiry.** A proposal lapses at `expires_at` (default 7 days) and its signatures
  with it; the service will not relay them afterwards and the client asks for fresh
  ones. A signature over `safeTxHash` stays valid on-chain until the nonce moves, so
  this is a service rule, not a chain rule; what makes it matter is that a phished or
  stockpiled approval is not silently executable months later (the Drift treasury
  lost about 285M USD in April 2026 to approvals collected early and executed late).
  On-chain expiry needs a deadline inside the transaction; see `09-open-questions.md`.
- **Stale after a rule change.** When owners, threshold, modules or the guard change,
  every open proposal is marked `stale` and must be re-approved; Squads does the same
  with its stale transaction index. The signatures may still be valid on-chain, so
  the client says so and offers to cancel the slot.

## 6. Policy evaluation

Hard policies are on-chain and the service only predicts them (so a member is not
asked to sign something that will revert). Soft policies gate the transition to
`ready`.

```
evaluate(proposal):
  hard = []
  if delayModule enabled and proposal touches owners/threshold/modules/guard:
      hard += DELAY(cooldown)                    # execution goes through the Delay queue, §9
  if guard set: hard += GUARD(simulate checkTransaction)   # eth_call the guard's check
  soft = []
  tier = approvalTierFor(sum of outgoing amounts in intent)   # e.g. <1k: 1 sig, <25k: 2, else 3
  if confirmations < max(threshold, tier.required): soft += NEEDS(tier.required - confirmations)
  if destination not in address book and policy.requireKnownDestination: soft += UNKNOWN_DESTINATION
  if schedule.windowClosed(now): soft += OUT_OF_HOURS
  return hard, soft
```

Soft rules can require **more** signatures than the Safe's threshold, never fewer:
the Safe threshold is the floor the chain enforces. A soft rule is shown as
"Treasury policy" and a hard one as "On-chain rule" so nobody mistakes the first for
the second.

Spending limits with one signature are the exception: they are hard (the Allowance
module executes without the threshold) and the service only mirrors their state
(`allowances(safe, delegate, token)`: amount, spent, resetTimeMin, lastResetMin).

## 7. Execution and gas on Arc

Two ways, same result.

**Relay** (`execTransaction`, the treasury default):

```
gasPrice      = current base fee + priority (from the RPC), as the cap the Safe will refund at
safeTxGas     = estimate via Safe's requiredTxGas simulation, or eth_estimateGas of the inner call + 10%
baseGas       = 21000 + calldata cost + signature check cost (about 8k per EOA sig, 40k+ per contract sig)
refundReceiver= relayer
gasToken      = address(0)    # native = USDC on Arc
```

Safe 1.4.1 pays `(gasUsed + baseGas) * min(gasPrice, tx.gasprice)` of the native
token, USDC on Arc, to `refundReceiver` (or `tx.origin` when zero) inside the same
transaction, so the relayer's balance only drifts by the difference between the cap
and the actual price. With `gasPrice > 0`, `safeTxGas` is a strict limit on the inner
call, so estimate it and add a margin. Alarm when the relayer key falls below a day
of expected executions. For scale: Safe's own benchmarks put a 2-of-2 ERC-20
transfer at about 90k gas and each extra ECDSA signature at about 7k.

**User operation** (the consumer path, also fine for a team):
`executeUserOp(to, value, data, operation)` through the 4337 module, priced with
`pimlico_getUserOperationGasPrice`, estimated with `eth_estimateUserOperationGas`
using a placeholder signature of the right shape, signed over the `SafeOp` hash in the
module's domain (`SafeHashing.operationHash`), sent with 12 zero bytes of validity
window ahead of the packed signatures. Exists: `SafeSubmitter` (Swift). Unused
prefund stays as the Safe's deposit at the EntryPoint; the indexer shows it.

## 8. Indexing a Safe from events

No tracing API; events only, which is Safe's own L2 mode.

```
watch(safe, fromBlock):
  for block in fromBlock..head:
    logs = eth_getLogs(address in {safe, USDC, EURC, EntryPoint}, block)
    for log in logs:
      match topic0:
        ExecutionSuccess(txHash, payment)  -> proposals[txHash].executed(block, gasPaid=payment)
        ExecutionFailure(txHash, payment)  -> proposals[txHash].failed
        AddedOwner / RemovedOwner / ChangedThreshold -> refresh owners from Safe.getOwners()
        EnabledModule / DisabledModule / ChangedGuard -> refresh modules
        ExecutionFromModuleSuccess(module) -> ledger entry tagged with the module (allowance spend)
        Transfer(from, to, value) on USDC/EURC where from==safe or to==safe -> ledger entry
        UserOperationEvent(hash, sender==safe, ...) -> link to the proposal if we sent it
    chainNonce = Safe.nonce()   # cheap; reconciles the queue, §5
  backfill history older than the watch from Arcscan's account API (tokentx), the
  way the consumer app already does for balance charts
```

`eth_getLogs` on drpc is capped at 10k results per call (known from the consumer
history work); page by block range.

## 9. Time lock through the Delay modifier

Zodiac Delay sits between a Safe and a module (or the Safe as its own executor):
`execTransactionFromModule` queues the call with a timestamp; after `txCooldown`
seconds anyone may `executeNextTx`; after `txExpiration` it lapses; the Safe's owners
can `skipExpired` or set the nonce forward to cancel. For a treasury:

- Owner and threshold changes, module and guard changes, policy changes: through the
  Delay with a 24 hour cooldown (the same window the consumer design wants for device
  swaps).
- Ordinary transfers: direct, no delay.
- The queue is visible in the client as "takes effect at", with a cancel button that
  only the Safe (threshold) can press.

## 10. Payroll runs

A payroll run is a template plus a schedule that produces proposals.

```
run(template, at):
  recipients = template.recipients (address, amount, token, memo, invoiceId?)
  calls = [transfer(token, r.address, r.amount) for r in recipients]
  data = MultiSendCallOnly.multiSend(encode(calls))
  proposal = propose(to=MultiSendCallOnly, data, operation=DELEGATECALL, kind=payroll, intent=recipients)
  if template.autoApproveUnderLimit and total <= allowance for the payroll delegate:
      execute via Allowance module with the delegate's single signature   # hard policy
  else:
      notify approvers; normal queue
```

Every payout carries a **payment reference** so accounting tools reconcile by event
rather than by amount: an 8-byte reference derived Request-style from the invoice or
run id, a salt and the payee, emitted by a small fee-proxy contract of ours
(`transferWithReference(token, to, amount, reference)` that forwards the transfer and
emits `TransferWithReference(token, to, amount, reference)`) when the payout goes
through a transfer; for cheques, the reference is the invoice id the recipient
already holds. The ledger stores the reference on the entry either way.

A recipient with no wallet gets a Recourse account: the invite is an @handle claim,
the account is a Safe, and the first payout lands there. Recipients that must be
screened go through Circle's Compliance Engine before the run is proposed, and a
REVIEW or DENIED decision removes the row and says so. Tax documents are not in the
first version; the ledger keeps what a Toku or Rise integration would need later.

Two USDC-native options a payroll product elsewhere cannot offer:

- **Cheques as payables.** A run can issue EIP-3009 authorizations signed by the
  treasury Safe (verified: USDC accepts a Safe's signature) instead of pushing
  transfers; recipients cash when they want, the treasury sees committed versus
  cashed, and an uncashed cheque can be voided. This is the consumer app's cheque
  feature with a Safe as the writer.
- **Invoices.** A contractor's invoice (`backend/src/services/invoices.rs`) fixes the
  nonce and terms; the treasury's approval produces the authorization; collection is
  the contractor's transaction. Reconciliation is exact because the invoice id is
  known before any money moves.

## 11. Simulation before signing

Safe reverts with `GS020` when fewer than `threshold` signatures are supplied, so a
proposal is simulated as the inner call rather than as `execTransaction`:

```
simulate(proposal):
  if rpc supports eth_simulateV1 (drpc does; the official RPC does not, checked 2026-09-03):
      result = eth_simulateV1({ blockStateCalls: [{ calls: [{ from: safe, to, value, data }] }],
                                traceTransfers: true, validation: false })
      deltas = transfers in result.logs (USDC/EURC Transfer events and traced native moves)
      status = result.calls[0].status; revert reason decoded if any
  else:
      status = eth_call({ from: safe, to, data }, latest, stateOverride: { safe: { balance: enough for gas } })
      deltas = decoded from calldata; labelled "expected", not "simulated"
  if guard set: eth_call(guard.checkTransaction(...)) with the same fields
  if delay applies: note "queued for <cooldown>, executes after <time>"
```

State overrides work on both public RPCs (verified with a balance override on a
Safe), which is what lets the simulation run "as the Safe" without funding anything.
The client shows: status, decoded intent, simulated deltas for the Safe and each
counterparty, gas, and the `safeTxHash` for hardware comparison.

## 12. Decoding calldata for people

Known selectors first (`transfer`, `transferWithAuthorization`, `approve`,
`multiSend`, `addOwnerWithThreshold`, `swapOwner`, `changeThreshold`, `enableModule`,
`setGuard`, the Allowance and Delay ABIs), then any ABI the treasury has registered
for a contract it interacts with, then raw. A proposal whose calldata cannot be
decoded is labelled "unreadable" and soft policy can forbid signing those, which is
the lesson of the February 2025 Safe front-end incident: never let a member approve a
hash they cannot read.
