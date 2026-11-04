import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isActiveCounselor } from "@/lib/auth/counselor";

const PROTECTED_PAGES = ["/input", "/analysis"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const authorized = !error && isActiveCounselor(user);
  const isProtectedPage = PROTECTED_PAGES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (!authorized && isProtectedPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  if (isProtectedPage || path.startsWith("/auth/") || path === "/login") {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  // API handlers independently authorize every request, including service jobs.
  matcher: ["/input/:path*", "/analysis/:path*", "/login", "/auth/:path*"],
};
