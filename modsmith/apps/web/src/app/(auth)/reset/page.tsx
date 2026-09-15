import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset-form";
import { Spinner } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPage() {
  return <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><ResetForm /></Suspense>;
}
