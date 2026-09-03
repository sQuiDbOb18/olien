# Product

A bank account for a team, on Arc, that nobody but the team controls. Squads is the
reference for what that means on Solana; this is what it means here, and what is
different because the chain's money is USDC and the members can be Recourse
accounts.

## Who

| Persona | Situation | What they need on day one |
| --- | --- | --- |
| A founder with two co-founders | company money on Arc, nobody wants to be the one holding the key | a 2-of-3, deposits in, pay a contractor, see the ledger |
| A finance lead at a payment company piloting Arc | needs approvals by amount, an audit trail, exports the accountant can use | roles, approval tiers, labels, CSV, hardware wallet support |
| A contractor or employee paid by such a team | wants to get paid without a wallet lesson | a Recourse account that receives, and an invoice that gets approved |
| A DAO or a fund moving to Arc for USDC and EURC | many signers on many devices, slow decisions, large amounts | proposals that wait, notifications, time locks, nested Safes for sub-treasuries |

## What it does

**Open a treasury.** Name it, add members (an address, a hardware wallet, a passkey,
or a Recourse account by @handle), set the threshold, and it exists on Arc in a
few seconds at a predictable address. Deposits can arrive before that; the address
is known from the members.

**Propose, approve, execute.** Any member (or a proposer role) drafts a payment or a
change. The others see it wherever they are, read it in plain terms, see a simulation,
and approve. When enough have, anyone executes and the treasury pays its own gas in
USDC. The queue shows what is waiting on whom.

**Rules.** Two kinds, labelled honestly: on-chain rules the chain enforces (spending
allowances with one signature, a 24 hour delay on changing members or rules, an
allowlist of destinations for teams that want one), and treasury policies the
service applies (more approvals above an amount, known destinations only, working
hours, notes). See `07-security-model.md`.

**Payroll and payouts.** A run is a list of people and amounts on a schedule. One
approval round pays everyone in one transaction. Or the treasury writes cheques,
which recipients cash when they like and the team can void while uncashed; or it
approves invoices that contractors issued. Both are USDC's own signed-authorization
feature, which the chain verifies for a Safe.

**Ledger and reports.** Every movement labelled, categorised, tied to the proposal
that caused it and the invoice or payroll run it belonged to. Exports for the
accountant. Balances in USDC and EURC, and conversion between them through Arc's FX
when a team holds both.

**Members that are people, not keys.** A Recourse account is a member like any
other. Its owner approves with Face ID; if they lose the phone, their own recovery
brings them back without the treasury changing anything.

## What it deliberately does not do

- Hold any key that can spend from a treasury.
- Offer a one-signature treasury.
- Bank rails, cards, off-ramp: not in the first version. They are a later layer, and
  the reason to keep the ledger clean now.
- Custom account contracts. It is canonical Safe, so a team can leave with their
  keys and use any Safe tooling that supports the chain.

## The screens

1. **Treasuries** (list): balance, pending count, last activity.
2. **Treasury home**: balance, members with their kind and status, the queue ("2 of
   3 approved, waiting for Ade"), recent ledger.
3. **New payment**: recipient (address book, @handle, address), amount, token, memo,
   invoice; shows the policy it will meet and who must approve.
4. **Proposal**: decoded intent, raw calldata on demand, simulation, `safeTxHash`
   shown for hardware comparison, approvals, execute button when ready, cancel.
5. **Payroll**: runs, schedule, recipients, next run, history.
6. **Rules**: members and threshold (through the delay), allowances, allowlist,
   approval tiers, working hours; each labelled on-chain or policy.
7. **Ledger**: filters, labels, categories, export.
8. **Settings**: name, notifications, API keys, integrations.

The iOS app shows 2 and 4 for treasuries the signed-in account belongs to, with
approve and execute, and pushes on new proposals.

## What makes it Arc's

- Gas is the money. A treasury never holds a second asset to pay fees.
- Signed authorizations (cheques, invoices) are native to USDC and verified for
  Safes on this chain; payroll can be pull-based.
- StableFX for USDC and EURC treasuries in one place.
- The consumer app is the on-ramp for members: a contractor with a Recourse
  account is already a valid signer and payee.

## Why non-custodial, in one paragraph

Besides security, it is the regulatory line. FinCEN's 2019 guidance says a provider
whose role is limited to creating unhosted wallets that require a second
authorization key alongside the owner's is not a money transmitter; the GENIUS Act
excludes software for a customer's own custody from its service-provider
definitions. The product never holds a key that can spend from a treasury, and says
so in Squads' words: the team owns it. The one nuance is the consumer account's
sealed Recovery Key, which cannot spend; the public wording gets legal review.

## Pricing (to validate)

Free for a treasury with up to three members and manual payments. Paid tiers for
payroll runs, approval policies, exports and API access, priced per treasury per
month. Benchmarks: Squads charges 49 USD a month for Pro (sub-accounts, fee relayer,
permissions) and lets the treasury pay it through a monthly spending limit drawn from
its own vault; its developer product starts at 499 USD a month. The same trick works
here: the subscription is an Allowance the treasury grants to the service, visible
and revocable like any other rule. FX spread on conversions. No AUM fee.
