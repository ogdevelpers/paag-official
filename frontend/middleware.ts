import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const studioSessionCookie = "paag_studio_session";

function isStudioProtectedPath(pathname: string) {
  return pathname.startsWith("/studio") && !pathname.startsWith("/studio/sign-in");
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasStudioSession = Boolean(request.cookies.get(studioSessionCookie)?.value);

  if (isStudioProtectedPath(pathname) && !hasStudioSession) {
    const signInUrl = new URL("/studio/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith("/studio/sign-in") && hasStudioSession) {
    return NextResponse.redirect(new URL("/studio", request.url));
  }

  const response = NextResponse.next();
  const isApi = pathname.startsWith("/api/");

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (isApi && !response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};
