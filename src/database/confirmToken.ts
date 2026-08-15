// ABOUTME: Stateless, HMAC-signed confirm tokens binding a write preview to its exact execution.
// ABOUTME: No server-side session: the token itself carries the signed request, since Vercel
// ABOUTME: serverless functions share no memory between the preview call and the confirm call.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PendingWrite {
  method: string;
  url: string;
  body: unknown;
  operationId: string;
}

interface TokenPayload extends PendingWrite {
  issuedAt: number;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createConfirmToken(write: PendingWrite, secret: string): string {
  const payload: TokenPayload = { ...write, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyConfirmToken(token: string, secret: string): PendingWrite | undefined {
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [payloadB64, signature] = parts;

  const expected = sign(payloadB64, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return undefined;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return undefined;

  const { issuedAt, ...write } = payload;
  return write;
}
