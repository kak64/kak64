import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { requireStaff } from "@/components/admin/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <AdminShell user={{ id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl }}>
      {children}
    </AdminShell>
  );
}
