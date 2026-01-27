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
