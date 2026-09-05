import type { Metadata, Viewport } from "next";
import "./olien-site.css";

export const metadata: Metadata = {
  title: { absolute: "Olien Multisig" },
  description: "The multisig platform to secure and manage USDC on Arc. Propose, approve and pay together, with rules the chain enforces.",
  openGraph: {
    title: "Olien Multisig",
    description: "The multisig platform to secure and manage USDC on Arc.",
    url: "/olien",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f6f4",
};

export default function OlienSiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="osite">{children}</div>;
}
