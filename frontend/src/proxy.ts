import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { isValidCsrfToken } from "@/lib/csrf";
import { CSRF_FIELD, CSRF_HEADER } from "@/lib/csrf-names";

const LOGOUT = "/auth/logout";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";

  if (!SAFE_METHODS.has(request.method)) {
    // Every state-changing request needs a valid token, including future routes.
    if (!(await passesCsrfCheck(request))) {
      return new NextResponse("Invalid or missing CSRF token", { status: 403 });
    }
    if (path === LOGOUT) return logout(request);
  } else if (path === LOGOUT) {
    // The SDK logs out on GET, which any other site could trigger.
    return new NextResponse("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const response = await auth0.middleware(request);
  if (!path.startsWith("/auth/")) await refreshTokens(request, response);
  return response;
}

async function passesCsrfCheck(request: NextRequest) {
  const appOrigin = new URL(process.env.APP_BASE_URL || request.nextUrl.origin).origin;
  if (request.headers.get("origin") !== appOrigin) return false;

  const session = await auth0.getSession(request);
  if (!session) return false;

  let token: unknown = request.headers.get(CSRF_HEADER);
  if (token === null) {
    try {
      token = (await request.clone().formData()).get(CSRF_FIELD);
    } catch {
      return false;
    }
  }
  return isValidCsrfToken(token, session.internal.sid);
}

async function logout(request: NextRequest) {
  // Query parameters are dropped so a caller cannot choose where logout lands.
  const url = new URL(LOGOUT, request.url);
  const response = await auth0.middleware(
    new NextRequest(url, { headers: request.headers }),
  );
  // 303 makes the browser follow the redirect with GET instead of re-posting.
  if (response.status >= 300 && response.status < 400) {
    return new NextResponse(null, { status: 303, headers: response.headers });
  }
  return response;
}

// Refresh here because Server Components cannot write the renewed session cookie.
async function refreshTokens(request: NextRequest, response: NextResponse) {
  if (!(await auth0.getSession(request))) return;
  try {
    await auth0.getAccessToken(request, response);
  } catch (error) {
    // The page shows "session ended" when it cannot get a token.
    console.error("Token refresh failed:", (error as Error).message);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
