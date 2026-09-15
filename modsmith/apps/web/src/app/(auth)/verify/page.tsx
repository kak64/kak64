import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyClient } from "@/components/auth/verify-client";
import { Spinner } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default function VerifyPage() {
  return <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><VerifyClient /></Suspense>;
}
