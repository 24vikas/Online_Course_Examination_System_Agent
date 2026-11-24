import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, handleCorsPreflight } from "./lib/cors";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/proctor")) {
    if (req.method === "OPTIONS") {
      return handleCorsPreflight();
    }
    const response = NextResponse.next();
    Object.entries(CORS_HEADERS).forEach(([key, val]) => {
      response.headers.set(key, val);
    });
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/proctor/:path*",
};
