import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienPayroll } from "@/components/olien/payroll";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Payroll" };

export default async function OlienPayrollPage({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienPayroll address={address} />;
}
