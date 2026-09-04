import type { Metadata, Viewport } from "next";
import "./olien.css";
import "./coming-soon.css";
import { OlienComingSoon } from "@/components/olien/coming-soon";
import { OlienShell } from "@/components/olien/shell";
import { Providers } from "@/components/providers";

// The console ships behind this switch until the first team has run it. Without it,
// every /olien route is the coming-soon page, which is where the site's Olien link lands.
const consoleOn = process.env.NEXT_PUBLIC_OLIEN_CONSOLE === "on";

export const metadata: Metadata = consoleOn
  ? {
      title: { default: "Olien", template: "%s | Olien" },
      description: "Olien is a multisig account on Arc. Members propose, approve and execute USDC payments together.",
    }
  : {
      title: { absolute: "Olien" },
      description: "Treasuries for teams on Arc. Coming soon.",
    };

export const viewport: Viewport = {
  themeColor: consoleOn ? "#0a0a0b" : "#ffffff",
};

export default function OlienLayout({ children }: { children: React.ReactNode }) {
  if (!consoleOn) return <OlienComingSoon />;
  return (
    <Providers>
      <OlienShell>{children}</OlienShell>
    </Providers>
  );
}
