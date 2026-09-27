import { createHash, randomInt, timingSafeEqual } from "crypto";
import { db } from "./db";
import { getSmsSender, type SmsSender } from "./sms";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RATE_LIMIT = 3; // codes per phone...
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000; // ...per 15 minutes

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export type RequestOtpResult = { ok: true } | { ok: false; error: string };

/** `phone` must already be normalised to +254. */
export async function requestOtp(
  phone: string,
  sender: SmsSender = getSmsSender(),
): Promise<RequestOtpResult> {
  const since = new Date(Date.now() - OTP_RATE_WINDOW_MS);
  const recent = await db.otpCode.count({ where: { phone, createdAt: { gte: since } } });
  if (recent >= OTP_RATE_LIMIT) {
    return { ok: false, error: "Too many codes requested. Please wait 15 minutes and try again." };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.otpCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      consumedAt: null, // explicit: see the note in db.ts
    },
  });
  await sender.send(phone, `Your Tawi login code is ${code}. It expires in 5 minutes.`);
  return { ok: true };
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string };

/** Checks the most recent unused code for this phone. Each code is single-use. */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  const otp = await db.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) {
    return { ok: false, error: "This code has expired. Request a new one." };
  }
  // Count the attempt atomically so parallel guesses can't exceed the limit.
  const counted = await db.otpCode.updateMany({
    where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) {
    return { ok: false, error: "Too many wrong attempts. Request a new code." };
  }

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(phone, code.trim()), "hex");
  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, error: "Wrong code. Check the SMS and try again." };
  }

  // Consume atomically so the same code can't log in twice.
  const consumed = await db.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    return { ok: false, error: "This code was already used. Request a new one." };
  }
  return { ok: true };
}
