"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAccount, durationLabel, errorMessage, isValidAddress, shortAddress, type CreateAccountBody, type Permission } from "@/lib/treasury";
import { AddressChip, Button, cx, Disclosure, DurationInput, Field, InlineError, Note, Panel, PermissionTags, Spinner, Table } from "./ui";
import { olienKeys, rememberAccount } from "./use-olien";
import { useWalletSession } from "./wallet";

const HOUR = 3_600;
const DAY = 86_400;
const MAX_DELAY = 30 * DAY;

export interface MemberDraft {
  key: number;
  address: string;
  label: string;
  approve: boolean;
  veto: boolean;
  recover: boolean;
}

let draftSequence = 0;

export function newMember(partial: Partial<MemberDraft> = {}): MemberDraft {
  draftSequence += 1;
  return { key: draftSequence, address: "", label: "", approve: true, veto: true, recover: false, ...partial };
}

export function permissionsOf(draft: MemberDraft): Permission[] {
  const list: Permission[] = [];
  if (draft.approve) list.push("approve");
  if (draft.veto) list.push("veto");
  if (draft.recover) list.push("recover");
  return list;
}

export function PermissionToggles({ draft, onChange, disabled }: { draft: MemberDraft; onChange: (change: Partial<MemberDraft>) => void; disabled?: boolean }) {
  const items: { key: "approve" | "veto" | "recover"; label: string }[] = [
    { key: "approve", label: "Approve" },
    { key: "veto", label: "Veto" },
    { key: "recover", label: "Recover" },
  ];
  return (
    <span className="olien-toggles" role="group" aria-label="Permissions">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cx("olien-toggle", draft[item.key] && "is-on")}
          aria-pressed={draft[item.key]}
          disabled={disabled}
          onClick={() => onChange({ [item.key]: !draft[item.key] })}
        >
          {draft[item.key] ? <Check size={12} /> : null}
          {item.label}
        </button>
      ))}
    </span>
  );
}

export function MemberRows({
  rows,
  onChange,
  onRemove,
  disabled,
}: {
  rows: MemberDraft[];
  onChange: (key: number, change: Partial<MemberDraft>) => void;
  onRemove: (key: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="olien-member-rows">
      {rows.map((row, index) => (
        <div className="olien-member-row" key={row.key}>
          <Field label={`Address ${index + 1}`}>
            <input className="olien-input olien-input--mono" value={row.address} placeholder="0x" spellCheck={false} disabled={disabled} onChange={(event) => onChange(row.key, { address: event.target.value.trim() })} />
          </Field>
          <Field label="Label">
            <input className="olien-input" value={row.label} placeholder={`Member ${index + 1}`} disabled={disabled} onChange={(event) => onChange(row.key, { label: event.target.value })} />
          </Field>
          <div className="olien-field">
            <span className="olien-field-label">Permissions</span>
            <PermissionToggles draft={row} disabled={disabled} onChange={(change) => onChange(row.key, change)} />
          </div>
          <button type="button" className="olien-icon-btn olien-member-remove" aria-label={`Remove member ${index + 1}`} disabled={disabled || rows.length === 1} onClick={() => onRemove(row.key)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Validates one draft list the way the contract will: valid, unique addresses, a
// permission each, at least one approver.
export function validateMembers(rows: MemberDraft[], taken: Set<string> = new Set()): string | null {
  if (rows.length === 0) return "Add at least one member.";
  const seen = new Set(taken);
  for (const [index, row] of rows.entries()) {
    if (!isValidAddress(row.address)) return `Member ${index + 1} needs a valid address.`;
    const lower = row.address.toLowerCase();
    if (seen.has(lower)) return `Member ${index + 1} repeats an address already in the list.`;
    seen.add(lower);
    if (!row.approve && !row.veto && !row.recover) return `Member ${index + 1} needs at least one permission.`;
  }
  return null;
}

type Step = "name" | "members" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "members", label: "Members" },
  { id: "review", label: "Review" },
];

export function OlienNewAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address: walletAddress } = useWalletSession();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>(() => [newMember({ address: walletAddress ?? "", label: "Me" })]);
  const [threshold, setThreshold] = useState(1);
  const [vetoThreshold, setVetoThreshold] = useState(0);
  const [configDelay, setConfigDelay] = useState(DAY);
  const [recoveryDelay, setRecoveryDelay] = useState(2 * DAY);
  const [recoveryCoSignDelay, setRecoveryCoSignDelay] = useState(HOUR);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const approvers = members.filter((row) => row.approve).length;
  const vetoers = members.filter((row) => row.veto).length;
  const recoverers = members.filter((row) => row.recover).length;
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  function patch(key: number, change: Partial<MemberDraft>) {
    setMembers((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function next() {
    setError(null);
    if (step === "name") {
      if (!name.trim()) return setError("Give the Olien a name.");
      if (name.trim().length > 80) return setError("Keep the name under 80 characters.");
      setStep("members");
    } else if (step === "members") {
      const problem = validateMembers(members);
      if (problem) return setError(problem);
      if (approvers === 0) return setError("At least one member must be able to approve.");
      if (threshold < 1 || threshold > approvers) return setError(`The threshold must be between 1 and ${approvers}, the number of members that can approve.`);
      setStep("review");
    }
  }

  function body(): CreateAccountBody | string {
    if (vetoThreshold < 0 || (vetoThreshold > 0 && vetoThreshold > vetoers)) return `The veto threshold must be automatic or at most ${vetoers}, the number of members that can veto.`;
    for (const [label, seconds] of [
      ["config delay", configDelay],
      ["recovery delay", recoveryDelay],
      ["recovery co-sign delay", recoveryCoSignDelay],
    ] as const) {
      if (seconds > MAX_DELAY) return `The ${label} cannot exceed 30 days.`;
    }
    if (recoverers > 0 && recoveryDelay < HOUR) return "With a recover member the recovery delay must be at least 1 hour.";
    return {
      name: name.trim(),
      signers: members.map((row, index) => ({
        kind: "ecdsa",
        address: row.address.toLowerCase(),
        label: row.label.trim() || `Member ${index + 1}`,
        permissions: permissionsOf(row),
      })),
      threshold,
      vetoThreshold,
      configDelay,
      recoveryDelay,
      recoveryCoSignDelay,
    };
  }

  async function create() {
    const payload = body();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const view = await createAccount(payload);
      rememberAccount(view.address);
      await queryClient.invalidateQueries({ queryKey: olienKeys.accounts });
      router.push(`/olien/${view.address}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setCreating(false);
    }
  }

  return (
    <div className="olien-page olien-wizard">
      <ol className="olien-steps" aria-label="Steps">
        {STEPS.map((entry, index) => {
          const done = index < stepIndex;
          return (
            <li key={entry.id} className={cx("olien-step", entry.id === step && "is-active", done && "is-done")} aria-current={entry.id === step ? "step" : undefined}>
              <span className="olien-step-number">{done ? <Check size={12} /> : index + 1}</span>
              {entry.label}
            </li>
          );
        })}
      </ol>

      <div className="olien-wizard-body">
        {step === "name" ? (
          <Panel title="Name your Olien">
            <Field label="Name" hint="What members see in the switcher and in notifications.">
              <input className="olien-input" value={name} placeholder="Northwind treasury" autoFocus disabled={creating} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && next()} />
            </Field>
            <InlineError message={error} />
            <div className="olien-wizard-actions">
              <Button variant="primary" onClick={next}>
                Continue
              </Button>
            </div>
          </Panel>
        ) : null}

        {step === "members" ? (
          <>
            <Panel
              title="Members"
              action={
                <Button size="sm" icon={<Plus size={13} />} onClick={() => setMembers((current) => [...current, newMember()])}>
                  Add member
                </Button>
              }
            >
              <p className="olien-panel-lead">Approve signs transactions and counts toward the threshold. Veto stops a scheduled change during the time lock. Recover can replace a lost key after the recovery delay.</p>
              <MemberRows rows={members} onChange={patch} onRemove={(key) => setMembers((current) => current.filter((row) => row.key !== key))} />
            </Panel>
            <Panel title="Threshold">
              <Field label="Approvals needed" hint={`${threshold} of ${approvers} ${approvers === 1 ? "member" : "members"} with approve must sign before a transaction runs.`}>
                <select className="olien-input olien-input--short" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>
                  {Array.from({ length: Math.max(1, approvers) }, (_, index) => index + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} of {approvers}
                    </option>
                  ))}
                </select>
              </Field>
              <InlineError message={error} />
              <div className="olien-wizard-actions">
                <Button onClick={() => setStep("name")}>Back</Button>
                <Button variant="primary" onClick={next}>
                  Continue
                </Button>
              </div>
            </Panel>
          </>
        ) : null}

        {step === "review" ? (
          <>
            {creating ? (
              <Note tone="info" icon={<Spinner />}>
                Creating on Arc, the relayer pays. This takes 10 to 30 seconds; the page moves to the new Olien when the receipt lands.
              </Note>
            ) : null}
            <Panel title="Review">
              <dl className="olien-kv">
                <div>
                  <dt>Name</dt>
                  <dd>{name.trim()}</dd>
                </div>
                <div>
                  <dt>Threshold</dt>
                  <dd>
                    {threshold} of {approvers}
                  </dd>
                </div>
                <div>
                  <dt>Time lock</dt>
                  <dd>{durationLabel(configDelay)}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Members" flush>
              <Table head={["Member", "Address", "Permissions"]}>
                {members.map((row, index) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.label.trim() || `Member ${index + 1}`}</strong>
                      {walletAddress && row.address.toLowerCase() === walletAddress.toLowerCase() ? <span className="olien-tag olien-tag--accent">You</span> : null}
                    </td>
                    <td>
                      <AddressChip address={row.address} />
                    </td>
                    <td>
                      <PermissionTags permissions={permissionsOf(row)} />
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
            <Panel>
              <Disclosure summary="Advanced">
                <div className="olien-form-grid">
                  <Field label="Veto threshold" hint="Automatic derives it from the threshold: the fewest members holding approve and veto whose refusal makes the threshold unreachable.">
                    <select className="olien-input olien-input--short" value={vetoThreshold} disabled={creating} onChange={(event) => setVetoThreshold(Number(event.target.value))}>
                      <option value={0}>Automatic</option>
                      {Array.from({ length: vetoers }, (_, index) => index + 1).map((n) => (
                        <option key={n} value={n}>
                          {n} of {vetoers}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Config delay" hint={`Member, threshold and time lock changes wait ${durationLabel(configDelay)} after execution and can be vetoed meanwhile.`}>
                    <DurationInput value={configDelay} disabled={creating} onChange={setConfigDelay} />
                  </Field>
                  <Field label="Recovery delay" hint={`A recovery by a recover member alone waits ${durationLabel(recoveryDelay)}. At least 1 hour when a recover member exists.`}>
                    <DurationInput value={recoveryDelay} disabled={creating} onChange={setRecoveryDelay} />
                  </Field>
                  <Field label="Recovery co-sign delay" hint={`A recovery co-signed by an approver waits ${durationLabel(recoveryCoSignDelay)}.`}>
                    <DurationInput value={recoveryCoSignDelay} disabled={creating} onChange={setRecoveryCoSignDelay} />
                  </Field>
                </div>
              </Disclosure>
              <InlineError message={error} />
              <div className="olien-wizard-actions">
                <Button disabled={creating} onClick={() => setStep("members")}>
                  Back
                </Button>
                <Button variant="primary" busy={creating} onClick={() => void create()}>
                  {creating ? "Creating on Arc" : "Create"}
                </Button>
              </div>
              <p className="olien-field-hint">
                The address is predicted from the members and a random salt; the relayer pays the deployment. Signing in as {walletAddress ? shortAddress(walletAddress) : "your wallet"} makes it visible to you at once.
              </p>
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  );
}
