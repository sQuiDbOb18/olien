import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienSettings } from "@/components/olien/settings";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Settings" };

export default async function OlienSettingsPage({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienSettings address={address} />;
}
