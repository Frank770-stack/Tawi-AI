import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { OTP_MAX_ATTEMPTS, OTP_RATE_LIMIT, requestOtp, verifyOtp } from "@/lib/otp";
import type { SmsSender } from "@/lib/sms";
import { resetDb } from "./helpers";

const phone = "+254712345678";

/** Fake SMS sender that remembers the last code it "sent". */
function fakeSender() {
  const sent: string[] = [];
  const sender: SmsSender = {
    async send(_to, message) {
      sent.push(message.match(/\d{6}/)![0]);
    },
  };
  return { sender, lastCode: () => sent[sent.length - 1] };
}

beforeEach(resetDb);

describe("OTP", () => {
  it("sends a 6-digit code and accepts it once", async () => {
    const sms = fakeSender();
    expect(await requestOtp(phone, sms.sender)).toEqual({ ok: true });
    expect(sms.lastCode()).toMatch(/^\d{6}$/);

    expect(await verifyOtp(phone, sms.lastCode())).toEqual({ ok: true });
    expect((await verifyOtp(phone, sms.lastCode())).ok).toBe(false); // single use
  });

  it("stores only a hash of the code", async () => {
    const sms = fakeSender();
    await requestOtp(phone, sms.sender);
    const row = await db.otpCode.findFirstOrThrow({ where: { phone } });
    expect(row.codeHash).not.toContain(sms.lastCode());
  });

  it("rejects a wrong code", async () => {
    const sms = fakeSender();
    await requestOtp(phone, sms.sender);
    const wrong = sms.lastCode() === "000000" ? "111111" : "000000";
    expect(await verifyOtp(phone, wrong)).toMatchObject({ ok: false, error: expect.stringMatching(/wrong code/i) });
  });

  it("locks the code after too many wrong attempts, even if the right code comes later", async () => {
    const sms = fakeSender();
    await requestOtp(phone, sms.sender);
    const wrong = sms.lastCode() === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await verifyOtp(phone, wrong);
    expect(await verifyOtp(phone, sms.lastCode())).toMatchObject({ ok: false, error: expect.stringMatching(/too many/i) });
  });

  it("rejects an expired code", async () => {
    const sms = fakeSender();
    await requestOtp(phone, sms.sender);
    await db.otpCode.updateMany({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyOtp(phone, sms.lastCode())).toMatchObject({ ok: false, error: expect.stringMatching(/expired/i) });
  });

  it("only the newest code works after a resend", async () => {
    const sms = fakeSender();
    await requestOtp(phone, sms.sender);
    const first = sms.lastCode();
    await requestOtp(phone, sms.sender);
    const second = sms.lastCode();
    if (first !== second) expect((await verifyOtp(phone, first)).ok).toBe(false);
    expect((await verifyOtp(phone, second)).ok).toBe(true);
  });

  it("rate-limits code requests per phone", async () => {
    const sms = fakeSender();
    for (let i = 0; i < OTP_RATE_LIMIT; i++) expect((await requestOtp(phone, sms.sender)).ok).toBe(true);
    expect(await requestOtp(phone, sms.sender)).toMatchObject({ ok: false, error: expect.stringMatching(/too many/i) });
    // A different phone is not affected.
    expect((await requestOtp("+254722000000", sms.sender)).ok).toBe(true);
  });
});
