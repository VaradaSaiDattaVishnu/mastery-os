JWTs let a server verify identity without a database lookup — the token is self-contained; the tradeoff is that you cannot revoke a valid token before it expires unless you add infrastructure to do so.

## The core

**JWT structure:** three base64url-encoded parts separated by dots: `header.payload.signature`. The header declares the algorithm (`RS256` or `HS256`). The payload carries claims: `sub` (subject/user id), `iat` (issued at), `exp` (expires). The signature is `HMAC(header + "." + payload, secret)` or an RSA/ECDSA signature. Verification: re-compute the signature and compare — if it matches and `exp` is in the future, the token is valid. No database round-trip.

**Stateless tokens vs sessions:**
- JWT: server is stateless; any replica can verify. Revocation requires a blocklist (denylist), which re-introduces state.
- Sessions: a session ID cookie; the server stores session data. Revocation is instant (`DELETE sessions WHERE id = ?`). Requires sticky sessions or a shared store (Redis).
- **Refresh token pattern:** issue a short-lived access token (15 min) and a long-lived refresh token (7 days). Access tokens are used for every API call (stateless). When they expire, the refresh token (stored in an HttpOnly cookie) exchanges for a new pair. This limits exposure: a stolen access token expires quickly; a stolen refresh token can be revoked in the database.

```ts
// auth.ts — production JWT implementation
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export function signAccessToken(userId: string, roles: string[]) {
  return jwt.sign({ sub: userId, roles }, ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: 'order-gateway',
    audience: 'order-services',
  });
}

export function signRefreshToken(userId: string) {
  const jti = randomBytes(16).toString('hex'); // unique token ID for revocation
  return { token: jwt.sign({ sub: userId, jti }, REFRESH_SECRET, { expiresIn: '7d' }), jti };
}

// Middleware
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'MISSING_TOKEN' });

  try {
    const payload = jwt.verify(auth.slice(7), ACCESS_SECRET, {
      issuer: 'order-gateway',
      audience: 'order-services',
    }) as { sub: string; roles: string[] };

    (req as any).user = { id: payload.sub, roles: payload.roles };
    next();
  } catch (err: any) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    res.status(401).json({ error: code });
  }
}

// Refresh endpoint
router.post('/auth/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'NO_REFRESH_TOKEN' });

  try {
    const payload = jwt.verify(token, REFRESH_SECRET) as { sub: string; jti: string };
    // Check not revoked
    const revoked = await tokenStore.isRevoked(payload.jti);
    if (revoked) return res.status(401).json({ error: 'TOKEN_REVOKED' });

    const user = await userService.findById(payload.sub);
    const accessToken = signAccessToken(user.id, user.roles);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
  }
});

// Logout: revoke the refresh token
router.post('/auth/logout', authenticate, async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    const { jti } = jwt.decode(token) as { jti: string };
    await tokenStore.revoke(jti, '7d');
  }
  res.clearCookie('refresh_token').json({ success: true });
});
```

## In your project

The Order gateway issues access tokens (15 min) to downstream service calls and refresh tokens stored in HttpOnly cookies to browser clients. gharKa, being a mobile-first food marketplace, uses longer-lived tokens (1 hour) with refresh — users shouldn't have to re-authenticate while ordering food. The refresh token's `jti` is stored in Redis with a 7-day TTL; logout calls `redis.set(jti, 'revoked', 'EX', remainingSeconds)`.

## Tradeoffs & pitfalls

- Never store the JWT in `localStorage`. XSS can read `localStorage`; HttpOnly cookies are inaccessible to JavaScript. Use `SameSite=Strict` + `Secure` + `HttpOnly` for refresh tokens.
- `jwt.verify` throws on expiry — distinguish `TokenExpiredError` from `JsonWebTokenError`. Return `TOKEN_EXPIRED` (401) so clients know to attempt a refresh instead of logging out immediately.
- OAuth2 is a framework for delegated authorisation, not authentication. Use OIDC (OpenID Connect, the identity layer on top of OAuth2) for "login with Google". Don't use raw OAuth2 access tokens as your app's user identity.
- The payload is base64 encoded, not encrypted. Anyone can decode it. Never put sensitive data (passwords, PII) in the payload.

## Top-1% insight

The access/refresh split creates an attack surface at the refresh endpoint that is more dangerous than the access token itself. A refresh token is long-lived and can mint new access tokens — if stolen, the attacker has persistent access until you actively revoke it. The mitigation is **refresh token rotation**: every time a refresh token is used, invalidate it and issue a new one. If you detect a refresh token being reused (someone already exchanged it), assume the original was stolen and invalidate the entire family. This is the pattern used by Auth0 and AWS Cognito — it converts a token theft into a brief detection window rather than a week-long compromise.
