import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienSend } from "@/components/olien/send";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Send" };

export default async function OlienSendPage({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienSend address={address} />;
}
