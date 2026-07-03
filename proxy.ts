import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/zap", "/studio", "/runs", "/api/providers", "/eve"];

export function proxy(request: NextRequest) {
  if (!protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (isLocal(request) || hasBasicAuth(request)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    headers: {
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="Zap"',
    },
    status: 401,
  });
}

function isLocal(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function hasBasicAuth(request: NextRequest) {
  const expectedUser = process.env.ZAP_BASIC_USER ?? "zap";
  const expectedPassword = process.env.ZAP_BASIC_PASSWORD ?? "";
  if (!expectedPassword) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  const decoded = atob(header.slice("Basic ".length));
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  return decoded.slice(0, separator) === expectedUser && decoded.slice(separator + 1) === expectedPassword;
}

export const config = {
  matcher: ["/zap/:path*", "/studio/:path*", "/runs/:path*", "/api/providers/:path*", "/eve/:path*"],
};
