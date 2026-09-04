import Link from "next/link";

// What the site's Olien link lands on until the console is finished with the first team.
export function OlienComingSoon() {
  return (
    <main className="olien-soon">
      <div className="olien-soon-card">
        <p className="olien-soon-mark">
          Olien<span aria-hidden="true" />
        </p>
        <h1>Treasuries for teams on Arc.</h1>
        <p className="olien-soon-lead">
          A shared account that nobody but the team controls. Propose, approve and pay in USDC, with time locks and
          vetoes the chain enforces.
        </p>
        <p className="olien-soon-status">Coming soon. We are finishing the console with the first team on testnet.</p>
        <div className="olien-soon-actions">
          <a className="olien-soon-btn" href="mailto:gkenny896@gmail.com?subject=Olien%20early%20access">
            Ask for early access
          </a>
          <Link href="/" className="olien-soon-link">
            Back to Recourse
          </Link>
        </div>
      </div>
    </main>
  );
}
