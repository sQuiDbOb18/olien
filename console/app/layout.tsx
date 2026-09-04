import type { Metadata, Viewport } from "next";
import "./olien.css";
import { OlienShell } from "@/components/olien/shell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Olien", template: "%s | Olien" },
  description: "Olien is a multisig account on Arc. Members propose, approve and execute USDC payments together.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function OlienLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <OlienShell>{children}</OlienShell>
    </Providers>
  );
}
