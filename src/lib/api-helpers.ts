/**
 * NEXUS BANK — API route helpers: uniform JSON envelope, error mapping,
 * body validation, rate-limit wiring.
 */
import { NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

/** Convert thrown errors into the JSON envelope. Never leaks internals. */
export function mapError(err: unknown): NextResponse {
  if (err instanceof HttpError) return fail(err.status, err.message);
  if (err instanceof SyntaxError) return fail(400, "Request body must be valid JSON");
  console.error("[api]", err);
  return fail(500, "Unexpected server error");
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".") || "body";
    throw new HttpError(400, `${field}: ${first?.message ?? "invalid input"}`);
  }
  return parsed.data;
}

export function enforceRateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  identity?: string,
): void {
  const res = rateLimit(`${bucket}|${identity ?? clientIp(req)}`, limit, windowMs);
  if (!res.ok) {
    throw new HttpError(429, `Too many requests. Try again in ${res.retryAfterSec}s.`);
  }
}

/** Parse comma-separated query params safely. */
export function queryParam(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  return v && v.length > 0 && v !== "all" ? v : null;
}
