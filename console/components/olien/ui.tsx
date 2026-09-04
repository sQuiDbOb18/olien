"use client";

import { ArrowUpRight, Check, ChevronDown, Copy, Loader2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/contracts";
import { countdownLabel, shortAddress, shortHash, statusLabel, type Permission, type ProposalStatus } from "@/lib/treasury";
import { useNow } from "./use-olien";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="olien-spin" aria-hidden />;
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  busy?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", busy, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("olien-btn", `olien-btn--${variant}`, size === "sm" && "olien-btn--sm", className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx("olien-btn", `olien-btn--${variant}`, size === "sm" && "olien-btn--sm", className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  id,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx("olien-panel", flush && "olien-panel--flush", className)} id={id}>
      {title || action ? (
        <header className="olien-panel-head">
          {title ? <h2 className="olien-panel-title">{title}</h2> : <span />}
          {action ? <div className="olien-panel-action">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type Tone = "green" | "amber" | "blue" | "red" | "gray";

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("olien-pill", `olien-pill--${tone}`, className)}>{children}</span>;
}

// Squads' status colours: green for done or ready, amber while waiting on people,
// blue while the time lock runs, red when something stopped it, gray when superseded.
export function statusPillTone(status: ProposalStatus): Tone {
  switch (status) {
    case "ready":
    case "executed":
      return "green";
    case "open":
    case "blocked":
    case "executing":
      return "amber";
    case "scheduled":
      return "blue";
    case "vetoed":
    case "failed":
    case "expired":
      return "red";
    default:
      return "gray";
  }
}

export function StatusPill({ status }: { status: ProposalStatus }) {
  return <Pill tone={statusPillTone(status)}>{statusLabel(status)}</Pill>;
}

export function Tag({ children, tone = "gray" }: { children: ReactNode; tone?: Tone | "accent" }) {
  return <span className={cx("olien-tag", `olien-tag--${tone}`)}>{children}</span>;
}

export function PermissionTags({ permissions }: { permissions: Permission[] }) {
  const labels: Record<Permission, string> = { approve: "Approve", veto: "Veto", recover: "Recover" };
  if (permissions.length === 0) return <span className="olien-muted">none</span>;
  return (
    <span className="olien-tags">
      {permissions.map((permission) => (
        <Tag key={permission}>{labels[permission] ?? permission}</Tag>
      ))}
    </span>
  );
}

export function CopyButton({ value, title = "Copy", size = 13 }: { value: string; title?: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="olien-icon-btn"
      title={copied ? "Copied" : title}
      aria-label={copied ? "Copied" : title}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}

// Every address in the console reads the same way: short form in mono, copy, explorer.
export function AddressChip({ address, label, full }: { address: string; label?: string | null; full?: boolean }) {
  return (
    <span className="olien-chip">
      {label ? <span className="olien-chip-label">{label}</span> : null}
      <code title={address}>{full ? address : shortAddress(address)}</code>
      <CopyButton value={address} title="Copy address" />
      <a
        className="olien-icon-btn"
        href={explorerAddressUrl(address)}
        target="_blank"
        rel="noreferrer"
        title="Open in ArcScan"
        aria-label="Open in ArcScan"
        onClick={(event) => event.stopPropagation()}
      >
        <ArrowUpRight size={13} />
      </a>
    </span>
  );
}

export function TxChip({ hash }: { hash: string }) {
  return (
    <span className="olien-chip">
      <code title={hash}>{shortHash(hash)}</code>
      <CopyButton value={hash} title="Copy transaction hash" />
      <a
        className="olien-icon-btn"
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noreferrer"
        title="Open in ArcScan"
        aria-label="Open in ArcScan"
        onClick={(event) => event.stopPropagation()}
      >
        <ArrowUpRight size={13} />
      </a>
    </span>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="olien-kv">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="olien-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="olien-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="olien-dialog-head">
          <h2>{title}</h2>
          <button ref={closeRef} type="button" className="olien-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="olien-dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="olien-empty">
      {icon ? <span className="olien-empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
      {action ? <div className="olien-empty-action">{action}</div> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="olien-error" role="alert">
      <TriangleAlert size={14} />
      <span>{message}</span>
    </p>
  );
}

export function Note({ tone = "info", icon, children }: { tone?: "info" | "warn" | "error" | "ok"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("olien-note", `olien-note--${tone}`)}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function Countdown({ target }: { target: number }) {
  const now = useNow();
  const label = countdownLabel(target, now);
  return <span className={cx("olien-countdown", label === "ready" && "is-ready")}>{label}</span>;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="olien-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={cx("olien-tab", item.id === value && "is-active")}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            const index = items.findIndex((entry) => entry.id === value);
            const next = items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
            if (next) onChange(next.id);
          }}
        >
          {item.label}
          {item.count != null ? <span className="olien-tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className="olien-table-wrap">
      <table className={cx("olien-table", className)}>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("olien-field", className)}>
      <span className="olien-field-label">{label}</span>
      {children}
      {hint ? <span className="olien-field-hint">{hint}</span> : null}
      {error ? <span className="olien-field-error">{error}</span> : null}
    </label>
  );
}

// A delay typed in hours or days and held in seconds, which is what the contract
// takes and what the request body sends.
export function DurationInput({ value, onChange, disabled }: { value: number; onChange: (seconds: number) => void; disabled?: boolean }) {
  const [unit, setUnit] = useState<"hours" | "days">(value > 0 && value % 86_400 === 0 ? "days" : "hours");
  const factor = unit === "days" ? 86_400 : 3_600;
  const shown = Math.round((value / factor) * 1000) / 1000;
  return (
    <span className="olien-duration">
      <input
        className="olien-input"
        type="number"
        min={0}
        step="any"
        value={String(shown)}
        disabled={disabled}
        onChange={(event) => {
          const n = Number(event.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? Math.round(n * factor) : 0);
        }}
      />
      <select className="olien-input" value={unit} disabled={disabled} onChange={(event) => setUnit(event.target.value === "days" ? "days" : "hours")}>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
    </span>
  );
}

export function Initials({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="olien-initials" title={names.join(", ")}>
      {shown.map((name, index) => (
        <span key={`${name}-${index}`}>{initialsOf(name)}</span>
      ))}
      {rest > 0 ? <span>+{rest}</span> : null}
    </span>
  );
}

export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (/^0x[0-9a-f]{40}$/i.test(trimmed)) return trimmed.slice(2, 4).toUpperCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="olien-loading" role="status">
      <Spinner size={16} />
      <span>{label}</span>
    </div>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx("olien-disclosure", open && "is-open")}>
      <button type="button" className="olien-disclosure-summary" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ChevronDown size={14} className="olien-disclosure-chevron" />
        {summary}
      </button>
      {open ? <div className="olien-disclosure-body">{children}</div> : null}
    </div>
  );
}

// A name for a proposer or a signer that might be a bare address.
export function personLabel(name: string | null | undefined): string {
  if (!name) return "Unknown";
  return /^0x[0-9a-f]{40}$/i.test(name) ? shortAddress(name) : name;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
