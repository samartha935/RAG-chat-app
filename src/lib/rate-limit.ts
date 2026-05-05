import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatRateLimitState } from "@/db/schema";

function parsePositiveInt(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getChatRateLimits() {
  return {
    rpm: parsePositiveInt(process.env.RATE_LIMIT_CHAT_RPM_PER_USER, 3),
    rpd: parsePositiveInt(process.env.RATE_LIMIT_CHAT_RPD_PER_USER, 40),
  };
}

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMinuteFloor(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      0,
      0,
    ),
  );
}

export type ChatRateLimitResult =
  | { ok: true }
  | { ok: false; reason: "rpm" | "rpd"; retryAfterSec?: number };

/**
 * Atomically checks per-user chat limits (UTC minute + UTC calendar day) and increments counters.
 */
export async function checkAndConsumeChatRateLimit(userId: string): Promise<ChatRateLimitResult> {
  const { rpm, rpd } = getChatRateLimits();
  const now = new Date();
  const day = utcDayString(now);
  const minuteStart = utcMinuteFloor(now);

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(chatRateLimitState)
      .where(eq(chatRateLimitState.userId, userId));

    if (!row) {
      await tx.insert(chatRateLimitState).values({
        userId,
        minuteBucketStart: minuteStart,
        minuteCount: 1,
        dayUtc: day,
        dayCount: 1,
      });
      return { ok: true };
    }

    let nextMinuteBucket = row.minuteBucketStart;
    let nextMinuteCount = row.minuteCount;
    let nextDayUtc = row.dayUtc;
    let nextDayCount = row.dayCount;

    if (nextMinuteBucket.getTime() !== minuteStart.getTime()) {
      nextMinuteBucket = minuteStart;
      nextMinuteCount = 0;
    }
    if (nextDayUtc !== day) {
      nextDayUtc = day;
      nextDayCount = 0;
    }

    if (nextMinuteCount >= rpm) {
      const retryAfterSec = Math.ceil(
        (nextMinuteBucket.getTime() + 60_000 - now.getTime()) / 1000,
      );
      return {
        ok: false,
        reason: "rpm",
        retryAfterSec: Math.max(1, retryAfterSec),
      };
    }
    if (nextDayCount >= rpd) {
      return { ok: false, reason: "rpd" };
    }

    nextMinuteCount += 1;
    nextDayCount += 1;

    await tx
      .update(chatRateLimitState)
      .set({
        minuteBucketStart: nextMinuteBucket,
        minuteCount: nextMinuteCount,
        dayUtc: nextDayUtc,
        dayCount: nextDayCount,
      })
      .where(eq(chatRateLimitState.userId, userId));

    return { ok: true };
  });
}
