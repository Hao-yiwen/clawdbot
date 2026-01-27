import * as crypto from "node:crypto";
import { FEISHU_API_BASE, type FeishuTokenResponse } from "./types.js";

// Token cache with expiration
type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

// Buffer time before token expiration (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Get tenant access token (with automatic refresh)
 */
export async function getTenantAccessToken(params: {
  appId: string;
  appSecret: string;
}): Promise<string> {
  const cacheKey = `${params.appId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  // Fetch new token
  const response = await fetch(
    `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: params.appId,
        app_secret: params.appSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get tenant access token: ${response.status}`);
  }

  const data = (await response.json()) as FeishuTokenResponse;

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }

  // Cache the token (expire is in seconds)
  const expiresAt = Date.now() + (data.expire ?? 7200) * 1000;
  tokenCache.set(cacheKey, {
    token: data.tenant_access_token,
    expiresAt,
  });

  return data.tenant_access_token;
}

/**
 * Clear cached token for an app
 */
export function clearTokenCache(appId: string) {
  tokenCache.delete(appId);
}

/**
 * Verify event signature (for encrypted events)
 * Signature = SHA256(timestamp + nonce + encryptKey + body)
 */
export function verifyEventSignature(params: {
  timestamp: string;
  nonce: string;
  encryptKey: string;
  body: string;
  signature: string;
}): boolean {
  const { timestamp, nonce, encryptKey, body, signature } = params;

  const content = timestamp + nonce + encryptKey + body;
  const computedSignature = crypto
    .createHash("sha256")
    .update(content)
    .digest("hex");

  return computedSignature === signature;
}

/**
 * Decrypt encrypted event payload
 * AES-256-CBC decryption with base64 encoded ciphertext
 */
export function decryptEvent(params: {
  encrypt: string;
  encryptKey: string;
}): unknown {
  const { encrypt, encryptKey } = params;

  // Derive AES key from encrypt key using SHA256
  const key = crypto.createHash("sha256").update(encryptKey).digest();

  // Base64 decode the ciphertext
  const ciphertext = Buffer.from(encrypt, "base64");

  // Extract IV (first 16 bytes) and encrypted data
  const iv = ciphertext.subarray(0, 16);
  const encryptedData = ciphertext.subarray(16);

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  // Parse JSON
  const jsonStr = decrypted.toString("utf8");
  return JSON.parse(jsonStr);
}

/**
 * Verify URL verification token
 */
export function verifyToken(token: string, expectedToken: string): boolean {
  return token === expectedToken;
}
