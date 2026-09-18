import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ms_session";

/** Edge middleware: cheap cookie-presence redirects. Real session validation happens in server layouts/routes. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if ((pathname.startsWith("/app") || pathname.startsWith("/admin")) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);
  return res;
}

export const config = { matcher: ["/app/:path*", "/admin/:path*", "/login", "/register"] };
