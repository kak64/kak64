import Link from "next/link";
import { Users as UsersIcon } from "lucide-react";
import { prisma, type Prisma } from "@modsmith/db";
import { PageHeader, Pagination } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { Table, TBody, Td, Th, THead, Tr, TableEmpty, TableWrap, ResultCount } from "@/components/admin/table";
import { hrefWith, pageOf, PAGE_SIZE, skipTake, str, type SearchParams } from "@/components/admin/helpers";
import { requireStaff } from "@/components/admin/guard";
import { formatCredits, formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = str(sp, "q");
  const status = str(sp, "status");
  const role = str(sp, "role");

  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
    ...(status ? { status: status as Prisma.EnumUserStatusFilter["equals"] } : {}),
    ...(role ? { role: role as Prisma.EnumUserRoleFilter["equals"] } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where, orderBy: { createdAt: "desc" }, ...skipTake(page),
      select: { id: true, email: true, username: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, creditAccount: { select: { balance: true } }, discordConnection: { select: { username: true } }, _count: { select: { jobs: true, creations: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Users" description="Search accounts by username, email or id." />
      <FilterBar fields={[
        { type: "search", name: "q", placeholder: "Username, email or id…", label: "Search users" },
        { type: "select", name: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }, { value: "DELETED", label: "Deleted" }] },
        { type: "select", name: "role", label: "Role", options: [{ value: "USER", label: "User" }, { value: "MODERATOR", label: "Moderator" }, { value: "ADMIN", label: "Admin" }] },
      ]} />
      <ResultCount total={total} page={page} pageSize={PAGE_SIZE} />
      <TableWrap>
        <Table minWidth={1040}>
          <THead>
            <Tr><Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Verified</Th><Th className="text-right">Credits</Th><Th>Discord</Th><Th className="text-right">Jobs</Th><Th className="text-right">Creations</Th><Th>Created</Th><Th>Last login</Th></Tr>
          </THead>
          <TBody>
            {users.length === 0 ? (
              <TableEmpty colSpan={10}><span className="flex flex-col items-center gap-2"><UsersIcon className="h-5 w-5 text-fg-subtle" aria-hidden />No users match these filters.</span></TableEmpty>
            ) : users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-accent hover:underline underline-offset-4">{u.username}</Link>
                  <div className="truncate text-xs text-fg-subtle">{u.email}</div>
                </Td>
                <Td><Badge variant={u.role === "ADMIN" ? "accent" : u.role === "MODERATOR" ? "info" : "default"}>{u.role.toLowerCase()}</Badge></Td>
                <Td><StatusBadge status={u.status} /></Td>
                <Td>{u.emailVerifiedAt ? <Badge variant="success">verified</Badge> : <Badge variant="warning">unverified</Badge>}</Td>
                <Td className="text-right tabular-nums">{formatCredits(u.creditAccount?.balance)}</Td>
                <Td className="text-fg-muted">{u.discordConnection?.username ?? "—"}</Td>
                <Td className="text-right tabular-nums">{u._count.jobs}</Td>
                <Td className="text-right tabular-nums">{u._count.creations}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{formatDate(u.createdAt)}</Td>
                <Td className="whitespace-nowrap text-fg-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => hrefWith("/admin/users", sp, { page: p })} />
    </div>
  );
}
