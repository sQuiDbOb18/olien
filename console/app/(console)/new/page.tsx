import type { Metadata } from "next";
import { OlienNewAccount } from "@/components/olien/new-account";

export const metadata: Metadata = { title: "Create an Olien" };

export default function NewOlien() {
  return <OlienNewAccount />;
}
