Phone OTP authentication trades the password-reuse and phishing vulnerabilities of passwords for a possession factor — the user proves they hold the phone number — but only works securely if the code is short-lived, rate-limited, and single-use.

## The core

The flow has two phases:

**Phase 1 — Request:** user submits phone number → server generates a cryptographically random 6-digit code, stores it with an expiry (60–180 seconds), sends it via SMS (Twilio, MSG91, Gupshup).

**Phase 2 — Verify:** user submits the code → server looks up the stored code, checks: (a) the code matches, (b) it hasn't expired, (c) the attempt count is under the limit. If all pass, invalidate the code, issue session/JWT.

**Storage:** the code must be hashed at rest (SHA-256 is fine — it's short-lived and the search space is only 10^6, so bcrypt's cost isn't the point; the expiry is). Store: `{ phone, codeHash, expiresAt, attempts, verified }`.

**Rate limiting** is the critical security control. Without it, an attacker can brute-force all 1,000,000 combinations in minutes.

```ts
import { createHash, randomInt } from 'node:crypto';
import { db } from '../db'; // any ORM
import { smsClient } from '../sms';

const OTP_EXPIRY_SECONDS = 120;
const MAX_ATTEMPTS = 3;
const REQUEST_WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 3;

// --- Helpers ---
function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateOtp(): string {
  // randomInt is cryptographically random — never use Math.random()
  return String(randomInt(100_000, 999_999));
}

// --- Request OTP ---
export async function requestOtp(phone: string): Promise<void> {
  // 1. Rate limit: max 3 requests per 60s per phone
  const recentCount = await db.otpRequest.count({
    where: {
      phone,
      createdAt: { gte: new Date(Date.now() - REQUEST_WINDOW_SECONDS * 1000) },
    },
  });
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    throw Object.assign(new Error('TOO_MANY_REQUESTS'), { status: 429 });
  }

  // 2. Invalidate any existing unverified OTP for this phone
  await db.otpRequest.updateMany({
    where: { phone, verified: false },
    data: { expiresAt: new Date(0) }, // expire immediately
  });

  // 3. Generate and store
  const code = generateOtp();
  await db.otpRequest.create({
    data: {
      phone,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000),
      attempts: 0,
      verified: false,
    },
  });

  // 4. Send — fire-and-forget is wrong; await and handle failure
  await smsClient.send({
    to: phone,
    body: `Your gharKa verification code is ${code}. Valid for ${OTP_EXPIRY_SECONDS}s. Do not share it.`,
  });
}

// --- Verify OTP ---
export async function verifyOtp(phone: string, submittedCode: string): Promise<void> {
  const record = await db.otpRequest.findFirst({
    where: {
      phone,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw Object.assign(new Error('OTP_EXPIRED_OR_NOT_FOUND'), { status: 400 });
  }

  // Increment attempt count before checking — prevents timing attacks via early return
  const updated = await db.otpRequest.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  if (updated.attempts > MAX_ATTEMPTS) {
    throw Object.assign(new Error('TOO_MANY_ATTEMPTS'), { status: 429 });
  }

  if (updated.codeHash !== hashOtp(submittedCode)) {
    throw Object.assign(new Error('INVALID_OTP'), { status: 400 });
  }

  // Mark verified — cannot be reused
  await db.otpRequest.update({
    where: { id: record.id },
    data: { verified: true },
  });
}
```

## In your project

gharKa uses phone OTP as the sole authentication mechanism — no passwords. This is appropriate for a food marketplace where the user base is mobile-first and may not have email addresses. The Prisma `otpRequest` model stores the hash + expiry; the Twilio client sends the SMS. The attempt limit of 3 is intentional: after 3 failures the code is locked, forcing a new request (which is itself rate-limited to 3 per 60 seconds), making brute force computationally costly without causing excessive friction for real users.

## Tradeoffs & pitfalls

- 4-digit codes are too short for SMS OTP (10,000 combinations). Use 6 digits minimum.
- Never log the plaintext OTP. Log the phone + a redacted indicator only.
- "Do not share this code" in the SMS is standard practice to reduce social-engineering attacks (SIM swap fraud + phishing).
- Timing attacks: check attempt count before comparing codes. An attacker who measures response time can determine if a phone number has a valid record.
- SMS delivery is not guaranteed. Implement a "resend" UI that respects the rate limit and shows a countdown timer, rather than letting users spam the send button.

## Top-1% insight

The subtlest security control is invalidating all previous unverified OTPs when a new one is requested. Without this, an attacker who triggers 10 OTP requests accumulates 10 valid codes (all within their expiry window), giving them a brute-force window 10× larger. By expiring previous codes on each new request, only the most recent code is ever valid — the attack surface stays bounded at exactly 10^6 regardless of how many resend requests were made. This is the detail that separates a production OTP implementation from a tutorial one.
