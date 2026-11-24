/**
 * Rate Limiting and Concurrency Governance
 * Course: 26ECAC401 (Agentic AI) — KLE Technological University
 * Team: Team AURA
 * 
 * Provides:
 * 1. Sliding window rate limiting per tenant/actor
 * 2. Concurrency limiting for expensive vector RAG and agent workflow endpoints
 * 3. Graceful degradation and retry-after header calculation
 */

import { NextResponse } from "next/server";
import { logEvent } from "./logger";

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const activeConcurrentRequests = new Map<string, number>();

export interface RateLimitOptions {
  capacity?: number;       // Max tokens in bucket (default: 60)
  refillRatePerSec?: number; // Tokens added per second (default: 10)
  maxConcurrent?: number;  // Max simultaneous in-flight operations (default: 5)
}

/**
 * Checks token bucket rate limit and concurrency bounds for a given identifier (tenantId/actorId/endpoint).
 * Returns null if allowed, or NextResponse with 429 if rate limit exceeded or 503 if concurrency saturated.
 */
export function checkRateLimitAndConcurrency(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; errorResponse?: NextResponse; remaining?: number; resetSec?: number } {
  const capacity = options.capacity ?? 60;
  const refillRate = options.refillRatePerSec ?? 10;
  const maxConcurrent = options.maxConcurrent ?? 5;
  const now = Date.now();

  // 1. Check Concurrency
  const inFlight = activeConcurrentRequests.get(key) || 0;
  if (inFlight >= maxConcurrent) {
    logEvent("warn", "Concurrency saturated for key", { key, inFlight, maxConcurrent });
    return {
      allowed: false,
      errorResponse: NextResponse.json(
        {
          error: "CONCURRENCY_LIMIT_EXCEEDED",
          message: `Too many concurrent operations for ${key}. Current in-flight: ${inFlight}/${maxConcurrent}. Please retry shortly.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": "2",
          },
        }
      ),
    };
  }

  // 2. Token Bucket Rate Limiting
  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    rateLimitBuckets.set(key, bucket);
  } else {
    // Refill tokens based on elapsed time
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillRate);
    bucket.lastRefill = now;
  }

  if (bucket.tokens < 1) {
    const waitSec = Math.ceil((1 - bucket.tokens) / refillRate);
    logEvent("warn", "Rate limit exceeded for key", { key, tokens: bucket.tokens, waitSec });
    return {
      allowed: false,
      remaining: 0,
      resetSec: waitSec,
      errorResponse: NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded for ${key}. Please retry after ${waitSec} seconds.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(waitSec),
            "X-RateLimit-Limit": String(capacity),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(waitSec),
          },
        }
      ),
    };
  }

  // Consume 1 token
  bucket.tokens -= 1;
  activeConcurrentRequests.set(key, inFlight + 1);

  return {
    allowed: true,
    remaining: Math.floor(bucket.tokens),
    resetSec: Math.ceil((capacity - bucket.tokens) / refillRate),
  };
}

/**
 * Releases the active concurrent request lock once an operation finishes.
 */
export function releaseConcurrency(key: string): void {
  const current = activeConcurrentRequests.get(key) || 0;
  if (current <= 1) {
    activeConcurrentRequests.delete(key);
  } else {
    activeConcurrentRequests.set(key, current - 1);
  }
}
