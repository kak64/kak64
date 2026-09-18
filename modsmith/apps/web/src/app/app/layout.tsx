import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { AppShell } from "@/components/app/shell";

export const dynamic = "force-dynamic";

export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={{ id: user.id, username: user.username, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt, avatarUrl: user.avatarUrl }}>
      {children}
    </AppShell>
  );
}
