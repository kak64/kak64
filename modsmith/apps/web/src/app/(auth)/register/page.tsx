import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { Spinner } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function RegisterPage() {
  return <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><RegisterForm /></Suspense>;
}
