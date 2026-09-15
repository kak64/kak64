import { getCurrentUser } from "@/server/session";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader loggedIn={!!user} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
