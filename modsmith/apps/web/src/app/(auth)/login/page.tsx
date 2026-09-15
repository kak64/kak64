import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Spinner } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default function LoginPage() {
  return <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><LoginForm /></Suspense>;
}
