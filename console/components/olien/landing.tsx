import { ArrowDown, ArrowLeftRight, ArrowUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// The console's front door, after app.squads.so: the pitch, one button, and a still
// life of the product underneath so a member sees what they are signing into. The
// figures are a made-up treasury, and say so to screen readers.
export function OlienLanding({ action, note }: { action: ReactNode; note?: string }) {
  return (
    <div className="olien-landing">
      <header className="olien-landing-bar">
        <Link href="/olien" className="olien-wordmark">
          Olien<span className="olien-dot" aria-hidden />
        </Link>
        <div className="olien-landing-bar-right">
          <span className="olien-network-chip">
            Network Status <span className="olien-dot" aria-hidden />
          </span>
          <Link href="/olien" className="olien-landing-back">
            About Olien
          </Link>
        </div>
      </header>

      <section className="olien-landing-hero">
        <span className="olien-landing-glyph" aria-hidden />
        <p className="olien-landing-kicker">Introducing Olien</p>
        <h1>Management of treasury assets for teams on Arc</h1>
        <div className="olien-landing-action">{action}</div>
        {note ? <p className="olien-landing-note">{note}</p> : null}
      </section>

      <StillLife />
    </div>
  );
}

function StillLife() {
  return (
    <div className="olien-still" aria-label="An example treasury: balance, chart, a pending payment, members and roles" role="img">
      <div className="olien-still-col">
        <div className="olien-still-card olien-still-balance">
          <span className="olien-still-label">Total Balance</span>
          <div className="olien-still-amount">
            $118,024.48
            <span className="olien-still-delta">
              <i aria-hidden /> +10,000.00 <em>last month</em>
            </span>
          </div>
          <div className="olien-still-actions">
            <span>
              <ArrowUp size={14} /> Send
            </span>
            <span>
              <ArrowDown size={14} /> Deposit
            </span>
            <span>
              <ArrowLeftRight size={14} /> Convert
            </span>
          </div>
        </div>

        <div className="olien-still-card olien-still-proposal">
          <div className="olien-still-row">
            <span className="olien-still-kind">
              <ArrowUp size={12} />
            </span>
            <strong>Send</strong>
            <span className="olien-still-coin" aria-hidden>
              $
            </span>
            <span className="olien-still-sum">
              5,000.00 <small>USDC</small>
              <b>$5,000.00</b>
            </span>
            <span className="olien-still-to">
              To: <code>@ade</code>
            </span>
            <span className="olien-still-ready">Ready</span>
          </div>
          <div className="olien-still-progress">
            <div className="olien-still-progress-head">
              <span>Progress</span>
              <span>
                Threshold <b>2/3</b>
              </span>
            </div>
            <div className="olien-still-track">
              <i style={{ width: "66%" }} />
            </div>
            <div className="olien-still-votes">
              <div>
                <span>
                  Confirmed <b>2</b>
                </span>
                <span className="olien-still-voter">
                  <i className="a" /> ade.arc
                </span>
                <span className="olien-still-voter">
                  <i className="b" /> 6bsk...26AL
                </span>
              </div>
              <div>
                <span>
                  Rejected <b>1</b>
                </span>
                <span className="olien-still-voter">
                  <i className="c" /> 15Rl...Ou64
                </span>
              </div>
            </div>
            <div className="olien-still-buttons">
              <span>Reject</span>
              <span className="is-primary">Execute</span>
            </div>
          </div>
        </div>
      </div>

      <div className="olien-still-col">
        <div className="olien-still-card olien-still-chart">
          <Chart />
        </div>
        <div className="olien-still-pair">
          <div className="olien-still-card olien-still-members">
            {[
              ["A", "a"],
              ["K", "b"],
              ["R", "c"],
              ["F", "d"],
            ].map(([letter, tone]) => (
              <span key={letter} className={`olien-still-member tone-${tone}`}>
                {letter}
              </span>
            ))}
          </div>
          <div className="olien-still-card olien-still-pro">
            <span className="olien-still-pro-word">Olien PRO</span>
            <div className="olien-still-toggle">
              <span>Privacy</span>
              <i className="on" />
            </div>
            <div className="olien-still-toggle is-off">
              <span>Fee relayer</span>
              <i />
            </div>
            <div className="olien-still-roles">
              <span className="is-on">Proposer</span>
              <span>Voter</span>
              <span>Executor</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// One smooth line over a faint grid, with the month a payroll run went out marked.
function Chart() {
  const ticks = ["$50,000", "$40,000", "$30,000", "$20,000", "$10,000", "$0"];
  const months = ["May", "Jul", "Sep", "Nov", "Jan", "Mar"];
  return (
    <div className="olien-still-chart-inner">
      <div className="olien-still-ticks">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="olien-still-plot">
        <svg viewBox="0 0 320 150" preserveAspectRatio="none" aria-hidden>
          {[0, 30, 60, 90, 120, 150].map((y) => (
            <line key={y} x1="0" x2="320" y1={y} y2={y} className="grid" />
          ))}
          <line x1="64" x2="64" y1="0" y2="150" className="cursor" />
          <path d="M0 120 C 30 122, 50 118, 64 96 S 100 40, 120 44 S 160 110, 190 96 S 240 40, 260 52 S 300 30, 320 26" className="line" />
          <circle cx="64" cy="96" r="3.5" className="point" />
        </svg>
        <div className="olien-still-tip">
          <span>Payroll</span>
          <strong>$27,000.00</strong>
          <small>July 01, 2026</small>
        </div>
        <div className="olien-still-months">
          {months.map((month) => (
            <span key={month} className={month === "Jul" ? "is-on" : undefined}>
              {month}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
