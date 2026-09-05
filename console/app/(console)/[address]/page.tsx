import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienAccountHome } from "@/components/olien/account-home";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Home" };

export default async function OlienAccount({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienAccountHome address={address} />;
}
