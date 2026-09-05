import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienTransactions } from "@/components/olien/transactions";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Transactions" };

export default async function OlienTransactionsPage({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienTransactions address={address} />;
}
