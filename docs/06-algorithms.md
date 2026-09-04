# Algorithms

The procedures the service and the clients run. Each one names where it already
exists in the repository when it does, and where the contract defines the rule
(`10-account-spec.md`, "spec" below). Pseudocode is language-neutral; the Swift,
Rust and Solidity are the same steps.

## 1. Transaction hash

EIP-712 with the four-field domain (spec §4).

```
DOMAIN_TYPEHASH = keccak("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
CALL_TYPEHASH   = keccak("Call(address to,uint256 value,bytes data)")
TX_TYPEHASH     = keccak("Transaction(uint256 nonce,uint64 epoch,Call[] calls,uint48 validAfter,uint48 validUntil)")

domain(account) = keccak(DOMAIN_TYPEHASH ‖ keccak("Olien") ‖ keccak("1") ‖ pad32(chainId) ‖ pad32(account))
callHash(c)     = keccak(CALL_TYPEHASH ‖ pad32(c.to) ‖ pad32(c.value) ‖ keccak(c.data))
callsHash       = keccak(callHash(calls[0]) ‖ callHash(calls[1]) ‖ ...)     # per EIP-712; empty array hashes the empty string
nonce           = (nonceKey << 64) | sequence                               # sequence = nonces[nonceKey] at execution
structHash      = keccak(TX_TYPEHASH ‖ pad32(nonce) ‖ pad32(epoch) ‖ callsHash ‖ pad32(validAfter) ‖ pad32(validUntil))
txHash          = keccak(0x1901 ‖ domain(account) ‖ structHash)
```

`epoch` and `sequence` are read from the chain when the proposal is made; a client
puts the same values in the typed data it asks a wallet to sign. If either moves
before execution, the signature matches nothing (spec §4, §7.1). That is how
"stale" and "replaced" are chain rules rather than service rules.

The name `"Olien"` is part of every hash and is final since 2026-09-04
(`09-open-questions.md` item 1); clients hard-code that exact string.

Exists: `SafeHashing.transactionHash` (Swift, `mobile/.../SafeSigning.swift`) is the
Safe shape; the Olien version is the same layout with the fields above and is
pending. Rule: the service computes locally and, once per account, compares against
the contract's own answer for a fixed sample (`getTransactionHash`,
`getMessageHash`; the operation hash has no view and is pinned by the tests
instead); a mismatch disables the account rather than risking a wrong hash.

## 2. Message hash (what a CONTRACT signer signs, and what a cheque signs)

```
MESSAGE_TYPEHASH        = keccak("Message(bytes32 hash)")
messageHash(account, h) = keccak(0x1901 ‖ domain(account) ‖ keccak(MESSAGE_TYPEHASH ‖ h))
```

One shape, two uses:

- **An account signs an EIP-712 digest for a third contract** (a USDC cheque, an
  invoice): `h` is the token's digest. USDC calls `isValidSignature(bytes32, bytes)`
  on the account, which checks `threshold` approvers over `messageHash(account, h)`
  (spec §9). Verified for a Safe on Arc through the same `bytes` overload
  (`02-arc-facts.md`); the Olien proof is pending.
- **An account signs another account's transaction** (a member account approving a
  team transaction): `h` is the outer `txHash` from §1. The outer account calls
  `isValidSignature(h, innerPacked)` on the inner one. There is no pre-image to
  carry (spec §9); this replaces the legacy `isValidSignature(bytes,bytes)` detour
  Safe 1.4.1 needed.

The legacy overload (`0x20c13b0b`) still exists on an Olien, over `keccak256(data)`,
for the case where an Olien is an owner of a Safe 1.4.1.

Exists: `SafeHashing.messageHash` (32-byte form) is the Safe shape; the Olien form
is the same function with the typehash above and the four-field domain.

## 3. Signature packing

One format for every path (spec §5.1): entries sorted by `signerId` strictly
ascending, each length-prefixed. No offsets, no dynamic tail.

```
pack(entries):                                   # entries: (signerId, kind, bytes)
  sort entries by signerId ascending; reject duplicates
  out = ""
  for (id, kind, sig) in entries:
    if kind == ONCHAIN:                          # the signer called approve(hash) on the account (spec §11)
      out += id ‖ uint16(0)
    elif kind == ECDSA:                          # 65 bytes r ‖ s ‖ v; v in {27, 28}, or {31, 32} for eth_sign
      out += id ‖ uint16(65) ‖ sig
    elif kind == P256:                           # 64 bytes r ‖ s, s normalised low (s' = n - s)
      out += id ‖ uint16(64) ‖ sig
    elif kind == WEBAUTHN:                       # abi.encode(authenticatorData, clientDataFields, r, s), s normalised low
      out += id ‖ uint16(len(sig)) ‖ sig
    elif kind == CONTRACT:                       # whatever the signer's isValidSignature expects
      out += id ‖ uint16(len(sig)) ‖ sig
  return out
```

`signerId` is `bytes32(uint256(uint160(address)))` for ECDSA and CONTRACT signers and
`keccak(abi.encode(x, y))` for P256 and WEBAUTHN (spec §3.1). A single entry longer
than 65,535 bytes cannot be expressed; nothing needs one.

Nested: the inner account's packed bytes are simply the `sig` of a `CONTRACT` entry
in the outer pack, and the inner entries were made over `Message(outerHash)` (§2).
Exists: `SafeSignatures.pack` (Swift) and Rust `pack_signatures` produce the Safe
layout; the Olien packer replaces the 65-byte static parts and the dynamic tail
with the loop above. `DeviceKey.swift` already produces the 64-byte P-256 signature
with `s` normalised (`05-onchain-design.md`).

Cost: a P256 entry is one call to `OlienVerifier`, which calls the precompile at
`0x100` (about 6,900 gas, measured, `02-arc-facts.md`); a CONTRACT entry is one
external call plus the inner account's own checks. Spec §16, measured in forge:
`execute` with one ERC-20 transfer and two ECDSA entries 88k (median of the
suite); the same with one P256 entry in place of one ECDSA, 406k with the Solidity
stand-in the tests use for the precompile, about 95k expected on Arc; an outer
2-of-2 where one signer is a 2-of-2 Olien, 88k. Arc's own numbers are pending.
The Safe baseline was 44k more per P-256 owner through `P256Owner` and 155,851 gas
for one nested 2-of-3 signature.

## 4. Verifying a confirmation before storing it

Per kind, exactly as the contract will (spec §5.2).

```
verify(proposal, signerId, sig):
  s = proposal.account.signers[signerId] (as of latest indexed state); reject if none
  h = proposal.txHash
  if sig is empty:
      assert indexer saw Approved(h, signerId), or isApproved(h, signerId) on the account reads true
  elif s.kind == ECDSA:
      v = sig[64]
      if v in {31, 32}: h = keccak("\x19Ethereum Signed Message:\n32" ‖ h); v -= 4
      assert lowS(sig) and ecrecover(h, sig) == address(signerId)
  elif s.kind == P256:
      assert lowS(sig) and p256Verify(h, r, s, x, y)            # locally, or eth_call the precompile at 0x100
  elif s.kind == WEBAUTHN:
      (authData, clientDataFields, r, sv) = abi.decode(sig)
      assert len(authData) >= 37 and authData.flags & 0x01      # user present
      if s.flags & UV_REQUIRED: assert authData.flags & 0x04    # user verified
      clientDataJSON = '{"type":"webauthn.get","challenge":"' ‖ base64url(h, no padding) ‖ '",' ‖ clientDataFields ‖ '}'
      assert lowS(sv) and p256Verify(sha256(authData ‖ sha256(clientDataJSON)), r, sv, x, y)
  elif s.kind == CONTRACT:
      assert eth_call(address(signerId), isValidSignature(bytes32 h, bytes sig)) == 0x1626ba7e
  store
  if count(distinct stored signers with APPROVE) >= threshold: mark ready (subject to §5, §6)
```

The client data JSON is rebuilt around the challenge, not searched, so the type
and the challenge are exactly what the authenticator signed; `clientDataFields` is
the rest of the browser's serialisation (`origin`, `crossOrigin`, and so on).
Origin, rpIdHash and the counter are left unchecked on purpose (spec §5.2). ECDSA
and P-256 signatures alike must have low `s`.

Only signers with APPROVE count toward the threshold. A confirmation from a
VETO-only or RECOVER-only signer is stored and shown but does not advance the
proposal, and the client says so before asking for it. For a Recourse account the
`CONTRACT` check is an `eth_call` that costs nothing and exercises exactly the path
the chain will take.

## 5. The queue: lanes, sequences, veto, expiry, epoch

Nonces are two-dimensional (spec §4): a `nonceKey` names a lane, and sequences are
strict within a lane. Lanes do not block each other. The default lane is key 0; the
service opens another lane for work that should not wait behind the main queue
(payroll, a recurring vendor) and shows which lane a proposal is in.

- **Assign** `sequence = max(chainSequence(key), highestQueued(key) + 1)` unless the
  proposer asks for a specific slot (to compete with an existing proposal).
- **Ready** means: threshold met, hard policies predicted to pass, soft policies
  pass, `validAfter <= now <= validUntil`, and `sequence == chainSequence(key)`. A proposal further down its lane is `blocked`
  by the ones before it and says so.
- **Conflict**: two proposals at one `(key, sequence)`. Both can collect signatures;
  the first to execute wins. The indexer sees `Executed` or `Scheduled` for one hash
  and marks every other proposal at that slot `replaced`.
- **Cancel** is on-chain and belongs to the threshold. A one-call proposal
  `cancel(hash)` runs at once (an immediate self call: no delay, no epoch change),
  sets `dead[hash]`, deletes any schedule and emits `Cancelled`. The hash can never
  execute, however many valid signatures exist for it (spec §8.4). This is the
  answer to a harvested approval; the other answer is `validUntil`, which the
  contract requires and caps at 30 days. A proposal with no signatures is simply
  deleted from the service.
- **Veto** is for scheduled changes only (`NothingScheduled` otherwise, spec §8.3);
  see §9. It is not the way to kill a pending payment.
- **Burn a slot**: execute an empty transaction (`calls = []`) at that sequence with
  `threshold` signatures. The sequence moves and every competing proposal at it is
  `replaced`. Needed only when a lane must move on past proposals whose hashes are
  not worth cancelling one by one.
- **Reorder**: not possible within a lane. The service offers "move up" by cloning
  the proposal at a lower free sequence, or into another lane, and says which
  signatures need to be collected again.
- **Batch**: `calls[]` is native to the account (spec §6.4). One approval round
  covers a payroll run with no MultiSend and no delegatecall.

Reconciliation runs on every indexed block: `chainSequence(key) = nonces(key)` for
each lane in use; any open proposal with `sequence < chainSequence` is `executed` or
`scheduled` (if its hash appears in the logs) or `replaced`.

- **Expiry is on-chain.** `validUntil` is in the hash and the contract refuses the
  transaction after it (spec §6.1). The service defaults `validUntil` to 7 days from
  proposal and the client asks for fresh signatures after that. What makes it
  matter is that a phished or stockpiled approval is not silently executable months
  later (the Drift treasury lost about 285M USD in April 2026 to approvals collected
  early and executed late). The first draft could only do this in the service. The
  contract requires `validUntil` to be set and no more than 30 days ahead
  (`MAX_VALIDITY`, spec §6.1), so no approval outlives a month whatever the
  service does.
- **Stale is on-chain.** `epoch` is in the hash and every change of who decides
  advances it (spec §7.1). When signers, the threshold, the veto threshold, the
  delays or the implementation change, every open proposal is `stale` and its
  signatures verify nothing; so are other scheduled changes. Spending-limit changes
  and cancellations do not move the epoch: they change what one key may do alone,
  not what the threshold agreed to, so a batch mid-collection survives a payroll
  adjustment. Squads does the same with its stale transaction index. The client
  re-proposes under the new epoch and asks again.

## 6. Policy evaluation

Hard policies are inside the account and the service only predicts them, so a
member is not asked to sign something that will revert, or that will be scheduled
when they expected it to run. Soft policies gate the transition to `ready`.

```
evaluate(proposal):
  hard = []
  if any call to the account has a selector outside CONFIG_SELECTORS ∪ {cancel, removeSpendingLimit}: hard += REVERTS   # spec §6.2
  if touchesConfig(proposal.calls):                        # a call to the account with a CONFIG selector; cancel and removeSpendingLimit run at once
      hard += DELAY(configDelay)                           # scheduled, executable after readyAt, vetoable; §9
  if proposal.path == recovery:                            # exactly one standard-encoded replaceSigner with equal permissions
      hard += DELAY(plainApprovers >= 1 ? recoveryCoSignDelay : recoveryDelay)   # plainApprovers: APPROVE without RECOVER; recoveryDelay is never under 1 hour
  if proposal.validUntil < now: hard += EXPIRED             # validUntil is required and at most 30 days ahead (spec §6.1)
  if proposal.epoch != account.epoch: hard += STALE
  if dead[hash]: hard += VETOED
  soft = []
  tier = approvalTierFor(sum of outgoing amounts in intent)   # e.g. <1k: 1 sig, <25k: 2, else 3
  if approvers < max(threshold, tier.required): soft += NEEDS(tier.required - approvers)
  if destination not in address book and policy.requireKnownDestination: soft += UNKNOWN_DESTINATION
  if schedule.windowClosed(now): soft += OUT_OF_HOURS
  return hard, soft
```

Soft rules can require **more** signatures than the account's threshold, never
fewer: the threshold is the floor the chain enforces. A soft rule is shown as
"Treasury policy" and a hard one as "On-chain rule" so nobody mistakes the first for
the second.

Spending limits with one signature are hard and bypass the queue. The named signer
calls `spend(id, to, amount)`: from its own address if it is an ECDSA or CONTRACT
signer, or as the one self call of a user operation validated for it if it is P256
or WEBAUTHN (spec §10, §11). The account checks the budget, the period, the
destination list and the signer list itself (spec §7.6, §11); both lists belong to
the limit's current `generation`, so replacing a limit retires every signer and
destination it had, and a signer added after the limit was set is not its signer.
The service mirrors limit state from `SpendingLimitSet`, `LimitSignerAllowed`,
`LimitDestinationAllowed`, `SpendingLimitRemoved` and `Spent`, shows `remaining`
and `resetAt` (`getLimitBudget`), and shows a spend the chain would refuse as such
before the signer tries.

## 7. Execution and gas on Arc

Two ways, same result. There is no refund in the contract: whoever calls `execute`
pays (spec §6.1). The account pays only through the EntryPoint.

**`execute`** (the treasury default, sent by the relayer):

```
tx         = { nonceKey, calls, validAfter, validUntil }        # the calldata struct; the hash adds nonce and epoch
signatures = pack(entries)                                      # §3
gas        = eth_estimateGas({ from: relayer, to: account, data: execute(tx, signatures) }) + 10%
send from the relayer key at the RPC's base fee + priority; gas is USDC
```

The relayer's balance goes down by the gas used; alarm when it falls below a day of
expected executions. Measured in forge (spec §16): 88k for a one-transfer,
two-ECDSA `execute` (median of the suite); 406k with one P256 entry in place of one
ECDSA, using the Solidity stand-in the tests have for the precompile, about 95k
expected on Arc; 88k for a nested 2-of-2 whose one signer is a 2-of-2 Olien; 33k
for `spend`; 34k for `veto` (median). Arc's numbers are pending.

**User operation** (the consumer path, also fine for a team, and the only path for a
`spend`, `veto` or `approve` by a P256 or WEBAUTHN signer):

```
op.sender    = account
op.nonce     = EntryPoint.getNonce(account, key)                  # the EntryPoint's 2D nonce, not the account's
op.callData  = IAccountExecute.executeUserOp(calls)               # always; anything else is BadCallData (spec §10)
               # calls = the batch; or exactly one self call spend(...) | veto(...) | approve(...) for one signer;
               # or one self call executeScheduled(...) | createSubAccount(...), which carry their own authority
op.signature = validAfter (6 bytes) ‖ validUntil (6 bytes) ‖ pack(entries)          # validUntil != 0 (spec §10)
hash         = UserOperation typed hash (spec §4) over op's fields, validAfter, validUntil, epoch, ENTRY_POINT
               # computed by the client with the same library; there is no view for it; the tests pin it
gas          = eth_estimateUserOperationGas with a placeholder signature of the right shape
price        = pimlico_getUserOperationGasPrice, or the RPC's fee when the relayer sends handleOps itself
```

Submitted through Pimlico's bundler (`BundlerClient.swift`), or by the relayer
calling `EntryPoint.handleOps` from any EOA; the second needs no bundler service.
Either way the EntryPoint repays the submitter from the account's deposit. The
account pays `missingAccountFunds` from its own USDC during validation, always,
even when the signatures fail, so estimation with a dummy signature reports a
signature failure rather than an unpaid prefund; there is no paymaster and no token
approval (spec §10). Because the selector is `IAccountExecute`'s, the EntryPoint
hands the whole operation and its hash to `executeUserOp(op, userOpHash)`, which
reads what validation decided from transient storage under that hash and rechecks
the epoch and `dead` before running; a configuration batch sent this way is
scheduled at execution, exactly as `execute` would schedule it (spec §10).
Deposits and stake need no function on the account: `EntryPoint.depositTo(account)`
is payable by anyone, and a threshold batch calls `depositTo`, `withdrawTo` or
`addStake` on the EntryPoint like any other contract (spec §6.2). Unused prefund
stays as the account's deposit and the indexer shows it. An operation with a
nested signer touches storage the bundler rules do not associate with the sender,
so it goes through our `handleOps` call, not the public mempool (spec §9). Exists:
`SafeSubmitter` (Swift) has the shape; `OlienSubmitter` is the same steps with
the hash above, pending.

## 8. Indexing an account from events

No tracing API; events only (spec §14 says nothing else is needed).

```
watch(account, fromBlock):
  for block in fromBlock..head:
    logs = eth_getLogs(address in {account, subAccounts(account)..., USDC, EURC, EntryPoint}, block)
    for log in logs:
      match topic0:
        Executed(hash, nonce, path)            -> proposals[hash].executed(block); from execute: lane[nonce >> 64] = (nonce & 2^64-1) + 1
                                                  from a user operation (a UserOperationEvent in the same receipt): nonce is the EntryPoint's, lanes untouched;
                                                  path 3 is a single-signer self call (spend, veto, approve)
        Scheduled(hash, readyAt, path, excluded) -> proposals[hash].scheduled(readyAt, readyAt + 7 days, path, excluded); slot consumed
        ScheduledExecuted(hash)                -> proposals[hash].executed
        Approved(hash, signerId)               -> confirmations[hash][signerId] = onchain
        Vetoed(hash, signerId, count)          -> vetoes[hash] += signerId
        Cancelled(hash)                        -> proposals[hash].vetoed; schedule cleared
        SignerAdded / SignerRemoved / ThresholdChanged / VetoThresholdChanged / DelaysChanged
                                               -> signers and rules, from the event fields
        EpochAdvanced(epoch)                   -> accounts[account].epoch = epoch; every open proposal -> stale
        SpendingLimitSet(id, generation, ...)  -> limits table: a new generation with empty signer and destination sets
        LimitSignerAllowed / LimitDestinationAllowed (id, generation, ...)
                                               -> the sets of that generation
        SpendingLimitRemoved / Spent           -> limits table; Spent also makes a ledger entry tagged with the limit
        ImplementationChanged / ImplementationFrozen, and the proxy's Upgraded
                                               -> accounts[account].implementation, frozen
        SubAccountCreated(index, addr)         -> sub_accounts; add addr to the watched set
        AccountCreated(account, salt) on the factory -> a new account to watch
        Transfer(from, to, value) on USDC/EURC where either side is the account or a sub-account -> ledger entry
        UserOperationEvent(hash, sender == account, ...) -> link to the proposal if we sent it; gas paid from the deposit
    for key in lanesInUse: chainSequence(key) = nonces(key)    # reconciles the queue, §5
  backfill history older than the watch from Arcscan's account API (tokentx), the
  way the consumer app already does for balance charts
```

`eth_getLogs` on drpc is capped at 10k results per call (known from the consumer
history work); page by block range. Accounts the service did not create are found
by the factory's `AccountCreated`, or by `Initialized` (five fields, spec §14)
filtered on topic alone, then checked to be a `OlienProxy` pointing at a known
implementation (`eth_getCode` and the ERC-1967 slot). Lanes reconcile from
`getNonce(key)`.

## 9. Time lock: scheduled execution and veto

The account schedules its own rule changes (spec §8); there is no separate modifier.

- A threshold execution whose calls touch configuration (signers, threshold, veto
  threshold, delays, a spending limit and its signer and destination lists,
  implementation; spec §6.2) is not run. The account stores `ScheduleEntry(readyAt
  = now + configDelay, epoch, path, excluded, callsHash)`, consumes the slot and
  emits `Scheduled(hash, readyAt, path, excluded)`; `excluded` is the one signer
  the change removes or replaces, when it is exactly one. A configuration batch
  sent as a user operation is scheduled the same way at execution (spec §10). A
  recovery execution is scheduled with `recoveryDelay`, which is never under one
  hour (`MIN_RECOVERY_DELAY`), or `recoveryCoSignDelay` when an approver holding
  no RECOVER bit co-signed; recovery is exactly one standard-encoded
  `replaceSigner` with equal permissions (spec §6.2, §6.3). Removing a limit and
  cancelling a hash are not scheduled: they run at once (spec §6.2).
- After `readyAt`, anyone calls `executeScheduled(hash, calls)`; the relayer does it
  by default and a member can from any client. The window is 7 days
  (`SCHEDULE_WINDOW`); after that the entry is gone and must be proposed again. The
  epoch must still be the one at scheduling, so two scheduled changes cannot both
  run: the first advances the epoch and the second must be proposed again.
- During the wait, signers with VETO call `veto(hash)`, from their own address
  (ECDSA, CONTRACT) or through a user operation (P256, WEBAUTHN; spec §11); at the
  effective veto threshold the hash is dead. The automatic threshold is `max(1,
  approverVetoerCount - threshold + 1)`, counting signers that hold both APPROVE
  and VETO; an explicit value must not exceed the number of VETO signers (spec
  §7.4, §7.5). On the threshold path the `excluded` signer cannot veto: the quorum
  removing a member is not stopped by that member. On the recovery path the
  replaced signer can, which is what protects a consumer against a stolen mailbox
  (spec §8.3). The client shows "takes effect at", the vetoes so far, and a veto
  button for every VETO signer that may still use it; the iOS app pushes on
  `Scheduled` for accounts the user is a signer of.
- Ordinary transfers: direct, no delay.
- Default `configDelay = 24h` for treasuries and consumer accounts
  (`05-onchain-design.md`), the same window the consumer design wants for device
  swaps.

## 10. Payroll runs

A payroll run is a template plus a schedule that produces proposals, or spends.

```
run(template, at):
  recipients = template.recipients (address, amount, token, memo, invoiceId?)
  if template.payrollKey and total <= remaining(limit named for payrollKey):
      for r in recipients:
          spend(limit.id, r.address, r.amount)                  # signed by payrollKey; hard policy; one user operation per recipient, paid from the payroll sub-account
  else:
      calls = [Call(token, 0, transfer(r.address, r.amount)) for r in recipients]   # native Call[], spec §6.4
      proposal = propose(calls, nonceKey = PAYROLL_LANE, kind = payroll, intent = recipients)
      notify approvers; normal queue
```

The payroll key is a signer with **no permission bits**, named (`allowLimitSigner`)
on a spending limit whose `subAccount` is the payroll sub-account (spec §7.6, §12). It can spend up to the
limit, to the listed destinations, and do nothing else: it cannot approve, veto or
recover. The month's budget moves to the sub-account by one threshold transfer. The
sub-account's address is a pure function of the account and the index, so the
budget can be sent before `createSubAccount` has run.

Every payout carries a **payment reference** so accounting tools reconcile by event
rather than by amount: an 8-byte reference derived Request-style from the invoice or
run id, a salt and the payee, emitted by a small fee-proxy contract of ours
(`transferWithReference(token, to, amount, reference)` that forwards the transfer and
emits `TransferWithReference(token, to, amount, reference)`) when the payout goes
through a transfer; for cheques, the reference is the invoice id the recipient
already holds. The ledger stores the reference on the entry either way.

A recipient with no wallet gets a Recourse account: the invite is an @handle claim,
the account is an Olien account, and the first payout lands there. Recipients that
must be screened go through Circle's Compliance Engine before the run is proposed,
and a REVIEW or DENIED decision removes the row and says so. Tax documents are not
in the first version; the ledger keeps what a Toku or Rise integration would need
later.

Two USDC-native options a payroll product elsewhere cannot offer:

- **Cheques as payables.** A run can issue EIP-3009 authorizations signed by the
  treasury account instead of pushing transfers. The signature is the account's
  EIP-1271 answer: `threshold` approvers over `Message(digest)` (§2, spec §9);
  there is no on-chain `signMessage` in v1 (spec §17), so a cheque always travels
  with its packed signatures. The treasury voids an uncashed cheque on the token
  with `cancelAuthorization`, or on the account with `cancel` over the wrapped
  message hash (spec §8.4). Verified on Arc for a Safe (USDC accepts the `bytes`
  overload, `02-arc-facts.md`); the Olien proof is pending. Recipients cash when they want, the treasury sees committed
  versus cashed, and an uncashed cheque can be voided. This is the consumer app's
  cheque feature with a treasury as the writer.
- **Invoices.** A contractor's invoice (`backend/src/services/invoices.rs`) fixes the
  nonce and terms; the treasury's approval produces the authorization; collection is
  the contractor's transaction. Reconciliation is exact because the invoice id is
  known before any money moves.

## 11. Simulation before signing

The contract reverts `Unauthorized` when fewer than `threshold` valid entries are
supplied, so a proposal is simulated as its calls, from the account, rather than as
`execute`:

```
simulate(proposal):
  if rpc supports eth_simulateV1 (drpc does; the official RPC does not, checked 2026-09-03):
      result = eth_simulateV1({ blockStateCalls: [{ calls: [{ from: account, to: c.to, value: c.value, data: c.data } for c in calls] }],
                                traceTransfers: true, validation: false })
      deltas = transfers in result.logs (USDC/EURC Transfer events and traced native moves)
      status = every call's status; revert reason decoded if any
  else:
      status = eth_call per call with { from: account }, latest, stateOverride: { account: { balance: enough for gas } }
      deltas = decoded from calldata; labelled "expected", not "simulated"
  if touchesConfig(calls): note "scheduled for <configDelay>, executes after <time>, vetoable by <effective veto threshold> VETO signers, not by the one it removes"
  if via userop: also estimate executeUserOp(calls) through eth_estimateUserOperationGas with a placeholder signature
```

Calls from the account to itself simulate the config functions under
`msg.sender == account`, which is what the real execution does after the delay.
State overrides work on both public RPCs (verified with a balance override on a
Safe), which is what lets the simulation run "as the account" without funding
anything. The client shows: status, decoded calls, simulated deltas for the account
and each counterparty, gas, and the `txHash` for hardware comparison.

## 12. Decoding calldata for people

Known selectors first: the token's (`transfer`, `transferWithAuthorization`,
`approve`), the account's own (`addSigner`, `removeSigner`, `replaceSigner`,
`setThreshold`, `setVetoThreshold`, `setDelays`, `setSpendingLimit`,
`allowLimitSigner`, `allowLimitDestination`, `removeSpendingLimit`, `cancel`,
`setImplementation`, `freezeImplementation`), the EntryPoint's (`depositTo`,
`withdrawTo`, `addStake`, `unlockStake`, `withdrawStake`), then any ABI the
treasury has registered for a contract it interacts with, then raw. A
`setImplementation` is shown with the target's `OLIEN_VERSION()` and whether it
is a deployment listed in spec §18. A call to the account itself with a selector
outside spec §6.2's lists reverts on-chain (`SelfCallRefused`) and is refused by
the client first. A proposal whose calldata
cannot be decoded is labelled "unreadable" and soft policy can forbid signing those,
which is the lesson of the February 2025 Safe front-end incident: never let a member
approve a hash they cannot read.
