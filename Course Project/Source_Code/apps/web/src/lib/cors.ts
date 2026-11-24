import { NextResponse } from "next/server";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-session-token, x-tenant-id",
  "Access-Control-Max-Age": "86400",
};

export function handleCorsPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export function jsonWithCors(data: any, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  Object.entries(CORS_HEADERS).forEach(([key, val]) => {
    res.headers.set(key, val);
  });
  return res;
}
