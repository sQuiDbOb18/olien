"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, formatDay, formatUsdc, isValidAddress, nowSeconds, parseUsdc, proposeTransfer, shortAddress, type AddressBookEntry, type RecipientInput } from "@/lib/treasury";
import { Button, cx, Disclosure, Field, InlineError, Loading, Note, Panel } from "./ui";
import { accountError, applyProposal, useAddressBook, useOlienAccount } from "./use-olien";

interface RecipientDraft {
  key: number;
  to: string;
  amount: string;
  label: string;
  memo: string;
}

let sequence = 0;
function newRecipient(): RecipientDraft {
  sequence += 1;
  return { key: sequence, to: "", amount: "", label: "", memo: "" };
}

const DAY = 86_400;

// An address input that offers the address book as you type, Squads style.
function AddressInput({ value, book, onChange, onPick, disabled }: { value: string; book: AddressBookEntry[]; onChange: (value: string) => void; onPick: (entry: AddressBookEntry) => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const query = value.trim().toLowerCase();
  const matches = book.filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.address.toLowerCase().startsWith(query)).slice(0, 6);
  const show = focused && matches.length > 0 && !(matches.length === 1 && matches[0].address.toLowerCase() === query);
  return (
    <span className="olien-suggest">
      <input
        className="olien-input olien-input--mono"
        value={value}
        placeholder="0x or a saved name"
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
      />
      {show ? (
        <ul className="olien-suggest-list" role="listbox">
          {matches.map((entry) => (
            <li key={entry.address}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(entry)}>
                <strong>{entry.label}</strong>
                <code>{shortAddress(entry.address)}</code>
                {entry.category ? <small>{entry.category}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}

export function OlienSend({ address }: { address: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const account = useOlienAccount(address);
  const book = useAddressBook(address);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => [newRecipient()]);
  const [lane, setLane] = useState("0");
  const [validDays, setValidDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (account.isLoading) return <Loading label="Loading the Olien" />;
  if (account.error || !account.data) return <InlineError message={accountError(account.error)} />;

  const view = account.data;
  const approvers = view.signers.filter((signer) => signer.permissions.includes("approve"));
  const parsed = recipients.map((row) => parseUsdc(row.amount));
  const total = parsed.reduce((sum, units) => sum + (units ? BigInt(units) : 0n), 0n);
  const balance = BigInt(view.usdcBalance || "0");
  const overBalance = total > balance;
  const entries = book.data ?? [];

  function patch(key: number, change: Partial<RecipientDraft>) {
    setRecipients((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function validate(): RecipientInput[] | string {
    if (recipients.length === 0) return "Add at least one recipient.";
    if (!/^\d+$/.test(lane)) return "The lane is a whole number, 0 by default.";
    if (validDays < 1 || validDays > 30) return "A transaction can stay valid for 1 to 30 days.";
    const list: RecipientInput[] = [];
    for (const [index, row] of recipients.entries()) {
      if (!isValidAddress(row.to)) return `Recipient ${index + 1} needs a valid address.`;
      const units = parsed[index];
      if (!units) return `Recipient ${index + 1} needs an amount in USDC with at most 6 decimals.`;
      const entry: RecipientInput = { to: row.to.toLowerCase(), amount: units };
      if (row.label.trim()) entry.label = row.label.trim();
      if (row.memo.trim()) entry.memo = row.memo.trim();
      list.push(entry);
    }
    return list;
  }

  async function submit() {
    const list = validate();
    if (typeof list === "string") {
      setError(list);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await proposeTransfer(address, { recipients: list, nonceKey: lane, validUntil: nowSeconds() + validDays * DAY });
      applyProposal(queryClient, address, created);
      router.push(`/olien/${address}/transactions/${created.txHash}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="olien-page">
      <div className="olien-split">
        <div className="olien-col">
          <Panel
            title="Recipients"
            action={
              <Button size="sm" icon={<Plus size={13} />} disabled={submitting} onClick={() => setRecipients((current) => [...current, newRecipient()])}>
                Add another recipient
              </Button>
            }
          >
            <div className="olien-recipients">
              {recipients.map((row, index) => (
                <div key={row.key} className={cx("olien-recipient", recipients.length > 1 && "has-index")}>
                  {recipients.length > 1 ? <span className="olien-call-index">{index + 1}</span> : null}
                  <div className="olien-recipient-grid">
                    <Field label="Recipient" className="olien-field--wide">
                      <AddressInput
                        value={row.to}
                        book={entries}
                        disabled={submitting}
                        onChange={(value) => patch(row.key, { to: value.trim() })}
                        onPick={(entry) => patch(row.key, { to: entry.address, label: entry.label })}
                      />
                    </Field>
                    <Field label="Amount (USDC)">
                      <input className="olien-input num" value={row.amount} inputMode="decimal" placeholder="250.00" disabled={submitting} onChange={(event) => patch(row.key, { amount: event.target.value })} />
                    </Field>
                    <Field label="Label (optional)">
                      <input className="olien-input" value={row.label} placeholder="Acme Ltd" disabled={submitting} onChange={(event) => patch(row.key, { label: event.target.value })} />
                    </Field>
                    <Field label="Memo (optional)" className="olien-field--wide">
                      <input className="olien-input" value={row.memo} placeholder="Invoice 1042" disabled={submitting} onChange={(event) => patch(row.key, { memo: event.target.value })} />
                    </Field>
                  </div>
                  {recipients.length > 1 ? (
                    <button type="button" className="olien-icon-btn olien-recipient-remove" aria-label={`Remove recipient ${index + 1}`} disabled={submitting} onClick={() => setRecipients((current) => current.filter((item) => item.key !== row.key))}>
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <Disclosure summary="Advanced">
              <div className="olien-form-grid">
                <Field label="Lane" hint="Transactions in one lane run in order. Use another lane for a payment that must not wait behind this one.">
                  <input className="olien-input olien-input--short num" value={lane} inputMode="numeric" disabled={submitting} onChange={(event) => setLane(event.target.value.trim())} />
                </Field>
                <Field label="Valid for (days)" hint={`Expires on ${formatDay(nowSeconds() + validDays * DAY)} if not executed by then.`}>
                  <input className="olien-input olien-input--short num" type="number" min={1} max={30} value={validDays} disabled={submitting} onChange={(event) => setValidDays(Math.max(1, Math.min(30, Math.floor(Number(event.target.value) || 1))))} />
                </Field>
              </div>
            </Disclosure>
          </Panel>
        </div>

        <aside className="olien-col olien-col--side">
          <Panel title="Summary">
            <dl className="olien-kv">
              <div>
                <dt>Total</dt>
                <dd className="num">{formatUsdc(total)}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd className="num">{formatUsdc(balance)}</dd>
              </div>
              <div>
                <dt>Needs</dt>
                <dd>
                  {view.threshold} of {approvers.length} approvals
                </dd>
              </div>
            </dl>
            <ul className="olien-approver-list">
              {approvers.map((signer) => (
                <li key={signer.signerId}>
                  {signer.label}
                  {signer.mine ? <span className="olien-tag olien-tag--accent">You</span> : null}
                </li>
              ))}
            </ul>
            {overBalance ? <Note tone="warn">The total exceeds the balance. Members can still approve, but it will not execute until the Olien is funded.</Note> : null}
            <InlineError message={error} />
            <Button variant="primary" className="olien-btn--block" busy={submitting} onClick={() => void submit()}>
              {submitting ? "Creating" : "Create transaction"}
            </Button>
            <p className="olien-field-hint">Creating it costs nothing. Members approve, then anyone executes and the Olien pays its own gas in USDC.</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
