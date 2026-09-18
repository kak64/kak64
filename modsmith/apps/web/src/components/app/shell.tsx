"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { DesktopSidebar, MobileSidebar } from "./sidebar";
import { AppHeader } from "./header";
import { VerifyEmailBanner } from "./verify-banner";

export interface ShellUser { id: string; username: string; email: string; role: "USER" | "MODERATOR" | "ADMIN"; emailVerified: boolean; avatarUrl: string | null }

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => { setOpen(false); }, [pathname]);
  const isAdmin = user.role === "ADMIN" || user.role === "MODERATOR";
  return (
    <div className="flex min-h-screen">
      <DesktopSidebar isAdmin={isAdmin} />
      <MobileSidebar isAdmin={isAdmin} open={open} onOpenChange={setOpen} />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <AppHeader user={user} onMenu={() => setOpen(true)} />
        {!user.emailVerified ? <VerifyEmailBanner /> : null}
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
