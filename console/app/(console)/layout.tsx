import type { Metadata, Viewport } from "next";
import "./olien.css";
import { OlienLanding } from "@/components/olien/landing";
import { OlienShell } from "@/components/olien/shell";
import { Providers } from "@/components/providers";

// The console ships behind this switch until the first team has run it. Without it,
// the door still opens on the landing, but its only action is asking for access.
const consoleOn = process.env.NEXT_PUBLIC_OLIEN_CONSOLE === "on";

export const metadata: Metadata = {
  title: { default: "Olien", template: "%s | Olien" },
  description: "Olien is a multisig account on Arc. Members propose, approve and execute USDC payments together.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function OlienConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!consoleOn) {
    return (
      <div className="olien">
        <OlienLanding
          action={
            <a className="olien-btn olien-btn--primary olien-landing-cta" href="mailto:gkenny896@gmail.com?subject=Olien%20early%20access">
              Ask for early access
            </a>
          }
          note="The console is opening with the first team on testnet."
        />
      </div>
    );
  }
  return (
    <Providers>
      <OlienShell>{children}</OlienShell>
    </Providers>
  );
}
