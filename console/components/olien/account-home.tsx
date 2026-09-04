"use client";

import Link from "next/link";
import { durationLabel, formatDay, formatUsdc } from "@/lib/treasury";
import { TransactionsTable } from "./transactions";
import { AddressChip, InlineError, KeyValue, Loading, Note, Panel, Pill, plural } from "./ui";
import { accountError, useOlienAccount, useProposals } from "./use-olien";

export function OlienAccountHome({ address }: { address: string }) {
  const account = useOlienAccount(address);
  const proposals = useProposals(address);

  if (account.isLoading) return <Loading label="Loading the Olien" />;
  if (account.error || !account.data) return <InlineError message={accountError(account.error)} />;

  const view = account.data;
  const recent = [...(proposals.data ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const vetoLabel = view.vetoThreshold === 0 ? `${view.effectiveVetoThreshold} (automatic)` : String(view.vetoThreshold);

  return (
    <div className="olien-page">
      {view.status === "deploying" ? <Note tone="warn">The creation transaction is still pending. The Olien becomes live once the receipt lands.</Note> : null}
      {view.status === "disabled" ? (
        <Note tone="error">The service disabled this Olien after its hash self-check failed, so it accepts no writes here. The account still works on chain with any other client.</Note>
      ) : null}
      <div className="olien-split">
        <div className="olien-col">
          <Panel className="olien-balance">
            <span className="olien-panel-title">Total balance</span>
            <div className="olien-balance-amount">{formatUsdc(view.usdcBalance)}</div>
            <small className="olien-muted">USDC on Arc Testnet</small>
          </Panel>

          <Panel title="Assets" flush>
            <div className="olien-table-wrap">
              <table className="olien-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="num">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="olien-asset">
                        <span className="olien-asset-icon" aria-hidden>
                          $
                        </span>
                        USDC
                      </span>
                    </td>
                    <td className="num">{formatUsdc(view.usdcBalance)}</td>
                    <td className="olien-muted">Gas is paid from this balance</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Recent transactions"
            flush
            action={
              <Link href={`/olien/${address}/transactions`} className="olien-link">
                View all
              </Link>
            }
          >
            <TransactionsTable address={address} rows={recent} loading={proposals.isLoading} error={proposals.error} emptyTitle="No transactions yet" emptyHint="Send creates the first one." />
          </Panel>
        </div>

        <aside className="olien-col olien-col--side">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Threshold", value: `${view.threshold} of ${view.signers.filter((signer) => signer.permissions.includes("approve")).length}` },
                { label: "Members", value: plural(view.signers.length, "member") },
                { label: "Time lock", value: durationLabel(view.configDelay) },
                { label: "Veto threshold", value: vetoLabel },
                { label: "Epoch", value: String(view.epoch) },
                { label: "Status", value: <Pill tone={view.status === "live" ? "green" : view.status === "deploying" ? "amber" : "red"}>{view.status}</Pill> },
                { label: "Created", value: formatDay(view.createdAt) },
                { label: "Address", value: <AddressChip address={view.address} /> },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
