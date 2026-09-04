import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienTransaction } from "@/components/olien/transaction";
import { accountParam, hashParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string; txHash: string }>;
}

export const metadata: Metadata = { title: "Transaction" };

export default async function OlienTransactionPage({ params }: PageProps) {
  const resolved = await params;
  const address = accountParam(resolved.address);
  const txHash = hashParam(resolved.txHash);
  if (!address || !txHash) notFound();
  return <OlienTransaction address={address} txHash={txHash} />;
}
