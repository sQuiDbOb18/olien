import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OlienMembers } from "@/components/olien/members";
import { accountParam } from "@/lib/treasury";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const metadata: Metadata = { title: "Members" };

export default async function OlienMembersPage({ params }: PageProps) {
  const address = accountParam((await params).address);
  if (!address) notFound();
  return <OlienMembers address={address} />;
}
