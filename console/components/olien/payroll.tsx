"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createPayroll,
  deletePayroll,
  errorMessage,
  formatDay,
  formatTime,
  formatUsdc,
  runPayroll,
  updatePayroll,
  type PayrollPeriod,
  type PayrollRun,
} from "@/lib/treasury";
import { AddRecipientButton, draftsFrom, newRecipient, recipientsTotal, RecipientsEditor, validateRecipients, type RecipientDraft } from "./recipients";
import { Button, Dialog, EmptyState, Field, InlineError, Loading, Note, Panel, Pill, plural, Table } from "./ui";
import { accountError, applyProposal, olienKeys, useAddressBook, useOlienAccount, usePayrolls } from "./use-olien";

const PERIODS: { id: PayrollPeriod; label: string }[] = [
  { id: "none", label: "Run by hand" },
  { id: "weekly", label: "Every week" },
  { id: "fortnightly", label: "Every two weeks" },
  { id: "monthly", label: "Every month" },
];

function periodLabel(period: PayrollPeriod): string {
  return PERIODS.find((p) => p.id === period)?.label ?? period;
}

// The first run's date as the date input wants it, in the viewer's own calendar.
function dateInputValue(unix: number | null): string {
  const d = unix ? new Date(unix * 1000) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Nine in the morning local time: payday, not midnight.
function unixFromDateInput(value: string): number | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(new Date(y, m - 1, d, 9, 0, 0).getTime() / 1000);
}

function PayrollEditor({ address, existing, onClose }: { address: string; existing: PayrollRun | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const book = useAddressBook(address);
  const [name, setName] = useState(existing?.name ?? "");
  const [period, setPeriod] = useState<PayrollPeriod>(existing?.period ?? "none");
  const [firstRun, setFirstRun] = useState(dateInputValue(existing?.nextRunAt ?? null));
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => (existing ? draftsFrom(existing.recipients) : [newRecipient()]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = recipientsTotal(recipients);

  async function save() {
    if (!name.trim()) {
      setError("Give the run a name.");
      return;
    }
    const list = validateRecipients(recipients);
    if (typeof list === "string") {
      setError(list);
      return;
    }
    const nextRunAt = period === "none" ? null : unixFromDateInput(firstRun);
    if (period !== "none" && !nextRunAt) {
      setError("Pick the first payday.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const body = { name: name.trim(), recipients: list, period, nextRunAt };
      if (existing) await updatePayroll(address, existing.id, body);
      else await createPayroll(address, body);
      await queryClient.invalidateQueries({ queryKey: olienKeys.payrolls(address) });
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={existing ? "Edit payroll run" : "New payroll run"}>
      <div className="olien-dialog-body olien-stack">
        <div className="olien-form-grid">
          <Field label="Name">
            <input className="olien-input" value={name} placeholder="Monthly salaries" maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Schedule" hint={period === "none" ? "Nothing runs until a member presses Run." : "On the day, the run appears in the queue for members to sign."}>
            <select className="olien-input" value={period} disabled={busy} onChange={(event) => setPeriod(event.target.value as PayrollPeriod)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          {period !== "none" ? (
            <Field label="First payday">
              <input className="olien-input" type="date" value={firstRun} disabled={busy} onChange={(event) => setFirstRun(event.target.value)} />
            </Field>
          ) : null}
        </div>
        <div className="olien-payroll-people">
          <div className="olien-payroll-people-head">
            <strong>{plural(recipients.length, "person", "people")}</strong>
            <span className="olien-muted num">{formatUsdc(total)}</span>
            <AddRecipientButton recipients={recipients} onChange={setRecipients} disabled={busy} />
          </div>
          <RecipientsEditor recipients={recipients} onChange={setRecipients} book={book.data ?? []} disabled={busy} />
        </div>
        <InlineError message={error} />
        <div className="olien-dialog-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            {existing ? "Save" : "Create run"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PayrollRow({ address, run, onEdit }: { address: string; run: PayrollRun; onEdit: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"run" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runNow() {
    if (!window.confirm(`Open "${run.name}" for ${formatUsdc(run.total)} now? Members will be asked to sign it.`)) return;
    setBusy("run");
    setError(null);
    try {
      const created = await runPayroll(address, run.id);
      applyProposal(queryClient, address, created);
      await queryClient.invalidateQueries({ queryKey: olienKeys.payrolls(address) });
      router.push(`/olien/${address}/transactions/${created.txHash}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${run.name}"? Proposals it already opened are not affected.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await deletePayroll(address, run.id);
      await queryClient.invalidateQueries({ queryKey: olienKeys.payrolls(address) });
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(null);
    }
  }

  return (
    <tr>
      <td>
        <strong>{run.name}</strong>
        <div className="olien-muted">{plural(run.recipients.length, "person", "people")}</div>
        {run.lastError ? <InlineError message={run.lastError} /> : null}
        {error ? <InlineError message={error} /> : null}
      </td>
      <td className="num">{formatUsdc(run.total)}</td>
      <td>
        <Pill tone={run.period === "none" ? "gray" : "green"}>{periodLabel(run.period)}</Pill>
        {run.nextRunAt ? <div className="olien-muted">Next {formatDay(run.nextRunAt)}</div> : null}
      </td>
      <td className="olien-muted">
        {run.lastRunAt ? (
          run.lastRunTxHash ? (
            <Link href={`/olien/${address}/transactions/${run.lastRunTxHash}`} className="olien-link">
              {formatTime(run.lastRunAt)}
            </Link>
          ) : (
            formatTime(run.lastRunAt)
          )
        ) : (
          "Never"
        )}
      </td>
      <td className="num">
        <div className="olien-actions">
          <Button size="sm" variant="primary" icon={<Play size={12} />} busy={busy === "run"} disabled={busy != null} onClick={() => void runNow()}>
            Run
          </Button>
          <Button size="sm" icon={<Pencil size={12} />} disabled={busy != null} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" icon={<Trash2 size={12} />} busy={busy === "delete"} disabled={busy != null} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function OlienPayroll({ address }: { address: string }) {
  const account = useOlienAccount(address);
  const payrolls = usePayrolls(address);
  const [editing, setEditing] = useState<PayrollRun | null | "new">(null);

  if (account.isLoading) return <Loading label="Loading the Olien" />;
  if (account.error || !account.data) return <InlineError message={accountError(account.error)} />;

  const runs = payrolls.data ?? [];
  return (
    <div className="olien-page olien-stack">
      <Panel
        title="Payroll runs"
        action={
          <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing("new")}>
            New run
          </Button>
        }
      >
        <p className="olien-muted olien-section-lede">
          A run is the people you pay and what you pay them, saved once. Running it puts the whole list in the queue as one transaction that needs the
          usual signatures. With a schedule, the service opens it on the day and members find it waiting.
        </p>
        {payrolls.isLoading ? (
          <Loading label="Loading runs" />
        ) : payrolls.error ? (
          <InlineError message={errorMessage(payrolls.error)} />
        ) : runs.length === 0 ? (
          <EmptyState icon={<CalendarClock size={18} />} title="No runs yet" hint="Save salaries, contractor retainers, or anything you pay more than once." />
        ) : (
          <Table head={["Run", "Total", "Schedule", "Last run", ""]}>
            {runs.map((run) => (
              <PayrollRow key={run.id} address={address} run={run} onEdit={() => setEditing(run)} />
            ))}
          </Table>
        )}
        {runs.some((run) => run.period !== "none") ? (
          <Note tone="info" icon={<CalendarClock size={14} />}>
            Scheduled runs open as the member who saved them. If that member leaves the Olien, the run stops and says so here; editing it makes you its
            member.
          </Note>
        ) : null}
      </Panel>
      {editing ? <PayrollEditor address={address} existing={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
