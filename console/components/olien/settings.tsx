"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Download, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usdcAddress } from "@/lib/contracts";
import {
  addAddressBookEntry,
  durationLabel,
  errorMessage,
  formatNative,
  formatTime,
  formatUsdc,
  getLedger,
  isValidAddress,
  ledgerCsv,
  parseUsdc,
  proposeLimit,
  proposeRemoveLimit,
  proposeSigners,
  shortAddress,
  type AccountView,
  type ProposalView,
  type SpendingLimit,
} from "@/lib/treasury";
import { AddressChip, Button, cx, DurationInput, EmptyState, Field, InlineError, KeyValue, Loading, Note, Panel, Pill, plural, Table, TxChip } from "./ui";
import { accountError, applyProposal, olienKeys, useAddressBook, useLedger, useOlienAccount } from "./use-olien";

const HOUR = 3_600;
const DAY = 86_400;
const MAX_DELAY = 30 * DAY;

function useRouteToProposal(address: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (view: ProposalView) => {
    applyProposal(queryClient, address, view);
    router.push(`/olien/${address}/transactions/${view.txHash}`);
  };
}

function TimeLockNote({ account }: { account: AccountView }) {
  return (
    <Note tone="info" icon={<Lock size={14} />}>
      This change waits {durationLabel(account.configDelay)} after execution and {plural(account.effectiveVetoThreshold, "veto", "vetoes")} stop it.
    </Note>
  );
}

function AddressesSection({ account }: { account: AccountView }) {
  return (
    <Panel title="Name and addresses">
      <KeyValue
        items={[
          { label: "Name", value: account.name },
          { label: "Olien address", value: <AddressChip address={account.address} /> },
          {
            label: "Implementation",
            value: (
              <span className="olien-inline">
                <AddressChip address={account.implementation} />
                <Pill tone={account.implementationFrozen ? "gray" : "blue"}>{account.implementationFrozen ? "Frozen" : "Upgradable"}</Pill>
              </span>
            ),
          },
          { label: "Epoch", value: String(account.epoch) },
          { label: "Entry point deposit", value: formatNative(BigInt(account.entryPointDeposit || "0")) },
          { label: "Chain", value: `Arc Testnet (${account.chainId})` },
          { label: "Created", value: account.createTx ? <TxChip hash={account.createTx} /> : formatTime(account.createdAt) },
        ]}
      />
      <p className="olien-field-hint">Renaming is not available yet; the name lives in the service, not on chain.</p>
    </Panel>
  );
}

function TimeLockSection({ address, account }: { address: string; account: AccountView }) {
  const go = useRouteToProposal(address);
  const [editing, setEditing] = useState(false);
  const [configDelay, setConfigDelay] = useState(account.configDelay);
  const [recoveryDelay, setRecoveryDelay] = useState(account.recoveryDelay);
  const [recoveryCoSignDelay, setRecoveryCoSignDelay] = useState(account.recoveryCoSignDelay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoverers = account.signers.filter((signer) => signer.permissions.includes("recover")).length;

  async function submit() {
    setError(null);
    if (configDelay === account.configDelay && recoveryDelay === account.recoveryDelay && recoveryCoSignDelay === account.recoveryCoSignDelay) return setError("Nothing has changed yet.");
    if ([configDelay, recoveryDelay, recoveryCoSignDelay].some((seconds) => seconds > MAX_DELAY)) return setError("A delay cannot exceed 30 days.");
    if (recoverers > 0 && recoveryDelay < HOUR) return setError("With a recover member the recovery delay must be at least 1 hour.");
    setBusy(true);
    try {
      go(await proposeSigners(address, { add: [], remove: [], replace: [], delays: { configDelay, recoveryDelay, recoveryCoSignDelay } }));
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Time lock"
      action={
        !editing ? (
          <Button size="sm" disabled={account.status !== "live"} onClick={() => setEditing(true)}>
            Change
          </Button>
        ) : null
      }
    >
      {!editing ? (
        <KeyValue
          items={[
            { label: "Config delay", value: durationLabel(account.configDelay) },
            { label: "Recovery delay", value: durationLabel(account.recoveryDelay) },
            { label: "Recovery co-sign delay", value: durationLabel(account.recoveryCoSignDelay) },
          ]}
        />
      ) : (
        <>
          <div className="olien-form-grid">
            <Field label="Config delay" hint="Member, threshold and time lock changes wait this long after execution.">
              <DurationInput value={configDelay} disabled={busy} onChange={setConfigDelay} />
            </Field>
            <Field label="Recovery delay" hint="A recovery by a recover member alone waits this long. At least 1 hour when a recover member exists.">
              <DurationInput value={recoveryDelay} disabled={busy} onChange={setRecoveryDelay} />
            </Field>
            <Field label="Recovery co-sign delay" hint="A recovery co-signed by an approver waits this long.">
              <DurationInput value={recoveryCoSignDelay} disabled={busy} onChange={setRecoveryCoSignDelay} />
            </Field>
          </div>
          <TimeLockNote account={account} />
          <InlineError message={error} />
          <div className="olien-actions">
            <Button variant="primary" busy={busy} onClick={() => void submit()}>
              Create transaction
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}

const PERIODS: { seconds: number; label: string }[] = [
  { seconds: DAY, label: "Every day" },
  { seconds: 7 * DAY, label: "Every week" },
  { seconds: 30 * DAY, label: "Every 30 days" },
  { seconds: 0, label: "One time, no reset" },
];

function periodLabel(seconds: number): string {
  if (seconds === 0) return "one time";
  return `per ${durationLabel(seconds)}`;
}

function LimitForm({ address, account, onClose }: { address: string; account: AccountView; onClose: () => void }) {
  const go = useRouteToProposal(address);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(DAY);
  const [signers, setSigners] = useState<string[]>([]);
  const [anyDestination, setAnyDestination] = useState(true);
  const [destinations, setDestinations] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const units = parseUsdc(amount);
    if (!units) return setError("Enter an amount in USDC with at most 6 decimals.");
    if (signers.length === 0) return setError("Pick at least one member who may spend under this limit.");
    const list = destinations.map((value) => value.trim()).filter(Boolean);
    if (!anyDestination) {
      if (list.length === 0) return setError("Add at least one destination, or allow any destination.");
      for (const [index, value] of list.entries()) if (!isValidAddress(value)) return setError(`Destination ${index + 1} needs a valid address.`);
    }
    setBusy(true);
    try {
      go(await proposeLimit(address, { token: usdcAddress, amount: units, period, anyDestination, signers, destinations: anyDestination ? [] : list.map((value) => value.toLowerCase()) }));
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div className="olien-subform">
      <div className="olien-form-grid">
        <Field label="Amount (USDC)">
          <input className="olien-input num" value={amount} inputMode="decimal" placeholder="500.00" disabled={busy} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Period">
          <select className="olien-input" value={period} disabled={busy} onChange={(event) => setPeriod(Number(event.target.value))}>
            {PERIODS.map((entry) => (
              <option key={entry.seconds} value={entry.seconds}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="olien-field">
        <span className="olien-field-label">Who may spend alone</span>
        <div className="olien-checks">
          {account.signers.map((signer) => (
            <label key={signer.signerId} className="olien-check">
              <input
                type="checkbox"
                checked={signers.includes(signer.signerId)}
                disabled={busy}
                onChange={(event) => setSigners((current) => (event.target.checked ? [...current, signer.signerId] : current.filter((id) => id !== signer.signerId)))}
              />
              {signer.label} {signer.address ? <code className="olien-muted">{shortAddress(signer.address)}</code> : null}
            </label>
          ))}
        </div>
      </div>
      <div className="olien-field">
        <span className="olien-field-label">Destinations</span>
        <div className="olien-checks">
          <label className="olien-check">
            <input type="radio" name="olien-limit-destinations" checked={anyDestination} disabled={busy} onChange={() => setAnyDestination(true)} /> Any destination
          </label>
          <label className="olien-check">
            <input type="radio" name="olien-limit-destinations" checked={!anyDestination} disabled={busy} onChange={() => setAnyDestination(false)} /> Only these addresses
          </label>
        </div>
        {!anyDestination ? (
          <div className="olien-address-rows">
            {destinations.map((value, index) => (
              <div key={index} className="olien-address-row">
                <input className="olien-input olien-input--mono" value={value} placeholder="0x" spellCheck={false} disabled={busy} onChange={(event) => setDestinations((current) => current.map((entry, i) => (i === index ? event.target.value.trim() : entry)))} />
                <button type="button" className="olien-icon-btn" aria-label={`Remove destination ${index + 1}`} disabled={busy || destinations.length === 1} onClick={() => setDestinations((current) => current.filter((_, i) => i !== index))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={13} />} disabled={busy} onClick={() => setDestinations((current) => [...current, ""])}>
              Add destination
            </Button>
          </div>
        ) : null}
      </div>
      <TimeLockNote account={account} />
      <InlineError message={error} />
      <div className="olien-actions">
        <Button variant="primary" busy={busy} onClick={() => void submit()}>
          Create transaction
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LimitRow({ address, account, limit }: { address: string; account: AccountView; limit: SpendingLimit }) {
  const go = useRouteToProposal(address);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelOf = (signerId: string) => account.signers.find((signer) => signer.signerId.toLowerCase() === signerId.toLowerCase())?.label ?? shortAddress(signerId);
  const from = limit.from && limit.from !== "0x0000000000000000000000000000000000000000" && limit.from.toLowerCase() !== account.address.toLowerCase() ? account.subAccounts.find((sub) => sub.address.toLowerCase() === limit.from.toLowerCase())?.label ?? shortAddress(limit.from) : null;

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      go(await proposeRemoveLimit(address, { id: limit.id }));
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <li className="olien-limit">
      <div className="olien-limit-main">
        <strong className="num">
          {formatUsdc(limit.amount)} {periodLabel(limit.period)}
        </strong>
        <span className="olien-muted num">
          {formatUsdc(limit.remaining)} left{limit.period > 0 ? `, resets ${formatTime(limit.resetAt)}` : ""}
        </span>
        <span>
          Spenders: {limit.signers.length ? limit.signers.map(labelOf).join(", ") : "none"}
          {from ? ` from ${from}` : ""}
        </span>
        <span className="olien-inline">
          Destinations: {limit.anyDestination ? "any" : limit.destinations.length ? limit.destinations.map((to) => <AddressChip key={to} address={to} />) : "none yet"}
        </span>
        <small className="olien-muted">Limit {limit.id}, generation {limit.generation}</small>
        <InlineError message={error} />
      </div>
      <div className="olien-limit-actions">
        {!confirm ? (
          <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} disabled={account.status !== "live"} onClick={() => setConfirm(true)}>
            Remove
          </Button>
        ) : (
          <div className="olien-confirm">
            <span>Remove this limit? It takes effect as soon as the threshold approves, with no delay.</span>
            <Button variant="danger" size="sm" busy={busy} onClick={() => void remove()}>
              Create transaction
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function LimitsSection({ address, account }: { address: string; account: AccountView }) {
  const [creating, setCreating] = useState(false);
  return (
    <Panel
      title="Spending limits"
      action={
        !creating ? (
          <Button size="sm" icon={<Plus size={13} />} disabled={account.status !== "live"} onClick={() => setCreating(true)}>
            Create spending limit
          </Button>
        ) : null
      }
    >
      <p className="olien-panel-lead">A named member pays alone up to the amount per period, without the threshold. Creating one is a configuration change behind the time lock; removing one runs at once.</p>
      {creating ? <LimitForm address={address} account={account} onClose={() => setCreating(false)} /> : null}
      {account.limits.length === 0 ? (
        <EmptyState title="No spending limits" hint="Every payment needs the threshold until a limit names a member." />
      ) : (
        <ul className="olien-limits">
          {account.limits.map((limit) => (
            <LimitRow key={`${limit.id}-${limit.generation}`} address={address} account={account} limit={limit} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AddressBookSection({ address }: { address: string }) {
  const book = useAddressBook(address);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [entryAddress, setEntryAddress] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!isValidAddress(entryAddress)) return setError("Enter a valid address.");
    if (!label.trim()) return setError("Give the address a label.");
    setBusy(true);
    try {
      await addAddressBookEntry(address, { address: entryAddress.toLowerCase(), label: label.trim(), ...(category.trim() ? { category: category.trim() } : {}) });
      await queryClient.invalidateQueries({ queryKey: olienKeys.addressBook(address) });
      setEntryAddress("");
      setLabel("");
      setCategory("");
      setAdding(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const entries = book.data ?? [];

  return (
    <Panel
      title="Address book"
      action={
        !adding ? (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)}>
            Add address
          </Button>
        ) : null
      }
    >
      {adding ? (
        <div className="olien-subform">
          <div className="olien-form-grid olien-form-grid--3">
            <Field label="Address">
              <input className="olien-input olien-input--mono" value={entryAddress} placeholder="0x" spellCheck={false} disabled={busy} onChange={(event) => setEntryAddress(event.target.value.trim())} />
            </Field>
            <Field label="Label">
              <input className="olien-input" value={label} placeholder="Acme Ltd" disabled={busy} onChange={(event) => setLabel(event.target.value)} />
            </Field>
            <Field label="Category (optional)">
              <input className="olien-input" value={category} placeholder="Supplier" disabled={busy} onChange={(event) => setCategory(event.target.value)} />
            </Field>
          </div>
          <InlineError message={error} />
          <div className="olien-actions">
            <Button variant="primary" busy={busy} onClick={() => void submit()}>
              Save
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {book.isLoading ? (
        <Loading label="Loading the address book" />
      ) : book.error ? (
        <InlineError message={errorMessage(book.error)} />
      ) : entries.length === 0 ? (
        <EmptyState title="No saved addresses" hint="Labels show in the ledger and as suggestions when you send." />
      ) : (
        <Table head={["Label", "Address", "Category"]}>
          {entries.map((entry) => (
            <tr key={entry.address}>
              <td>
                <strong>{entry.label}</strong>
              </td>
              <td>
                <AddressChip address={entry.address} />
              </td>
              <td className="olien-muted">{entry.category || ""}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function SubAccountsSection({ account }: { account: AccountView }) {
  return (
    <Panel title="Sub-accounts">
      {account.subAccounts.length === 0 ? (
        <EmptyState title="None yet" hint="A sub-account is a separate address only this Olien can operate; a spending limit can draw from one." />
      ) : (
        <Table head={["Index", "Label", "Address"]}>
          {account.subAccounts.map((sub) => (
            <tr key={sub.address}>
              <td className="num">{sub.index}</td>
              <td>{sub.label ?? ""}</td>
              <td>
                <AddressChip address={sub.address} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function LedgerSection({ address }: { address: string }) {
  const ledger = useLedger(address, 100);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setError(null);
    setExporting(true);
    try {
      const rows = await getLedger(address, 1000);
      const blob = new Blob([ledgerCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `olien-${address.slice(2, 10)}-ledger.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  const entries = ledger.data ?? [];

  return (
    <Panel
      title="Ledger"
      flush
      action={
        <Button size="sm" icon={<Download size={13} />} busy={exporting} disabled={entries.length === 0} onClick={() => void exportCsv()}>
          Export CSV
        </Button>
      }
    >
      {error ? (
        <div className="olien-panel-pad">
          <InlineError message={error} />
        </div>
      ) : null}
      {ledger.isLoading ? (
        <Loading label="Loading the ledger" />
      ) : ledger.error ? (
        <InlineError message={errorMessage(ledger.error)} />
      ) : entries.length === 0 ? (
        <EmptyState title="No movements yet" hint="Deposit USDC to the Olien address to fund it." />
      ) : (
        <Table head={["Time", "", "Counterparty", "Amount", "Memo", "Tx"]}>
          {entries.map((entry) => (
            <tr key={`${entry.tx}-${entry.logIndex}`}>
              <td className="num olien-muted">{formatTime(entry.blockTime)}</td>
              <td>
                <span className={cx("olien-direction", entry.direction === "in" ? "is-in" : "is-out")} title={entry.direction === "in" ? "Received" : "Sent"}>
                  {entry.direction === "in" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </span>
              </td>
              <td>
                <AddressChip address={entry.counterparty} label={entry.counterpartyLabel} />
              </td>
              <td className={cx("num", entry.direction === "in" ? "olien-ok" : "")}>
                {entry.direction === "in" ? "+" : "-"}
                {formatUsdc(entry.amount)}
              </td>
              <td className="olien-muted">
                {entry.memo ? <span>{entry.memo} </span> : null}
                {entry.proposalTxHash ? (
                  <Link href={`/olien/${address}/transactions/${entry.proposalTxHash}`} className="olien-link">
                    {entry.memo ? "transaction" : "Transaction"}
                  </Link>
                ) : entry.limitId != null ? (
                  `Limit ${entry.limitId}`
                ) : null}
              </td>
              <td>
                <TxChip hash={entry.tx} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export function OlienSettings({ address }: { address: string }) {
  const account = useOlienAccount(address);
  if (account.isLoading) return <Loading label="Loading settings" />;
  if (account.error || !account.data) return <InlineError message={accountError(account.error)} />;
  const view = account.data;
  return (
    <div className="olien-page olien-stack">
      <AddressesSection account={view} />
      <TimeLockSection address={address} account={view} />
      <LimitsSection address={address} account={view} />
      <AddressBookSection address={address} />
      <SubAccountsSection account={view} />
      <LedgerSection address={address} />
    </div>
  );
}
