"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { isValidAddress, parseUsdc, shortAddress, type AddressBookEntry, type RecipientInput } from "@/lib/treasury";
import { Button, cx, Field } from "./ui";

// The list of people and amounts, shared by a one-off payment and a payroll run so
// the two never drift apart in what they accept.

export interface RecipientDraft {
  key: number;
  to: string;
  amount: string;
  label: string;
  memo: string;
}

let sequence = 0;
export function newRecipient(seed?: Partial<RecipientDraft>): RecipientDraft {
  sequence += 1;
  return { key: sequence, to: "", amount: "", label: "", memo: "", ...seed };
}

// A saved run comes back in the token's smallest unit; the editor shows decimals.
export function draftsFrom(recipients: RecipientInput[]): RecipientDraft[] {
  return recipients.map((r) =>
    newRecipient({
      to: r.to,
      amount: unitsToDecimal(r.amount),
      label: r.label ?? "",
      memo: r.memo ?? "",
    }),
  );
}

function unitsToDecimal(units: string): string {
  const n = BigInt(units || "0");
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Everything the service will refuse, refused here first with the row named.
export function validateRecipients(recipients: RecipientDraft[]): RecipientInput[] | string {
  if (recipients.length === 0) return "Add at least one recipient.";
  const list: RecipientInput[] = [];
  for (const [index, row] of recipients.entries()) {
    if (!isValidAddress(row.to)) return `Recipient ${index + 1} needs a valid address.`;
    const units = parseUsdc(row.amount);
    if (!units) return `Recipient ${index + 1} needs an amount in USDC with at most 6 decimals.`;
    const entry: RecipientInput = { to: row.to.toLowerCase(), amount: units };
    if (row.label.trim()) entry.label = row.label.trim();
    if (row.memo.trim()) entry.memo = row.memo.trim();
    list.push(entry);
  }
  return list;
}

export function recipientsTotal(recipients: RecipientDraft[]): bigint {
  return recipients.reduce((sum, row) => {
    const units = parseUsdc(row.amount);
    return sum + (units ? BigInt(units) : 0n);
  }, 0n);
}

// An address input that offers the address book as you type, Squads style.
export function AddressInput({ value, book, onChange, onPick, disabled }: { value: string; book: AddressBookEntry[]; onChange: (value: string) => void; onPick: (entry: AddressBookEntry) => void; disabled?: boolean }) {
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

export function RecipientsEditor({
  recipients,
  onChange,
  book,
  disabled,
}: {
  recipients: RecipientDraft[];
  onChange: (next: RecipientDraft[]) => void;
  book: AddressBookEntry[];
  disabled?: boolean;
}) {
  function patch(key: number, change: Partial<RecipientDraft>) {
    onChange(recipients.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  return (
    <div className="olien-recipients">
      {recipients.map((row, index) => (
        <div key={row.key} className={cx("olien-recipient", recipients.length > 1 && "has-index")}>
          {recipients.length > 1 ? <span className="olien-call-index">{index + 1}</span> : null}
          <div className="olien-recipient-grid">
            <Field label="Recipient" className="olien-field--wide">
              <AddressInput value={row.to} book={book} disabled={disabled} onChange={(value) => patch(row.key, { to: value.trim() })} onPick={(entry) => patch(row.key, { to: entry.address, label: entry.label })} />
            </Field>
            <Field label="Amount (USDC)">
              <input className="olien-input num" value={row.amount} inputMode="decimal" placeholder="250.00" disabled={disabled} onChange={(event) => patch(row.key, { amount: event.target.value })} />
            </Field>
            <Field label="Label (optional)">
              <input className="olien-input" value={row.label} placeholder="Acme Ltd" disabled={disabled} onChange={(event) => patch(row.key, { label: event.target.value })} />
            </Field>
            <Field label="Memo (optional)" className="olien-field--wide">
              <input className="olien-input" value={row.memo} placeholder="Invoice 1042" disabled={disabled} onChange={(event) => patch(row.key, { memo: event.target.value })} />
            </Field>
          </div>
          {recipients.length > 1 ? (
            <button type="button" className="olien-icon-btn olien-recipient-remove" aria-label={`Remove recipient ${index + 1}`} disabled={disabled} onClick={() => onChange(recipients.filter((item) => item.key !== row.key))}>
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AddRecipientButton({ recipients, onChange, disabled }: { recipients: RecipientDraft[]; onChange: (next: RecipientDraft[]) => void; disabled?: boolean }) {
  return (
    <Button size="sm" icon={<Plus size={13} />} disabled={disabled} onClick={() => onChange([...recipients, newRecipient()])}>
      Add another recipient
    </Button>
  );
}
