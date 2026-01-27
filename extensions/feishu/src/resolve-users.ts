import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
  type FeishuUserInfo,
} from "./types.js";
import { getTenantAccessToken } from "./auth.js";
import type { ResolvedFeishuAccount } from "./accounts.js";

/**
 * Make authenticated API request to Feishu
 */
async function feishuRequest<T>(params: {
  account: ResolvedFeishuAccount;
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}): Promise<T> {
  const { account, method, path, body, query } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  let url = `${FEISHU_API_BASE}${path}`;
  if (query && Object.keys(query).length > 0) {
    const searchParams = new URLSearchParams(query);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeishuApiResponse<T>;

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
  }

  return data.data as T;
}

export type ResolvedFeishuUser = {
  input: string;
  resolved: boolean;
  openId?: string;
  userId?: string;
  unionId?: string;
  name?: string;
  email?: string;
  error?: string;
};

/**
 * Resolve a user by email
 */
export async function resolveFeishuUserByEmail(params: {
  account: ResolvedFeishuAccount;
  email: string;
}): Promise<ResolvedFeishuUser> {
  const { account, email } = params;

  try {
    const result = await feishuRequest<{
      user_list: Array<{
        user_id?: string;
        open_id?: string;
        union_id?: string;
      }>;
    }>({
      account,
      method: "POST",
      path: "/contact/v3/users/batch_get_id",
      query: {
        user_id_type: "open_id",
      },
      body: {
        emails: [email],
      },
    });

    const user = result.user_list?.[0];
    if (user) {
      return {
        input: email,
        resolved: true,
        openId: user.open_id,
        userId: user.user_id,
        unionId: user.union_id,
      };
    }

    return {
      input: email,
      resolved: false,
      error: "User not found",
    };
  } catch (err) {
    return {
      input: email,
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve a user by mobile number
 */
export async function resolveFeishuUserByMobile(params: {
  account: ResolvedFeishuAccount;
  mobile: string;
}): Promise<ResolvedFeishuUser> {
  const { account, mobile } = params;

  try {
    const result = await feishuRequest<{
      user_list: Array<{
        user_id?: string;
        open_id?: string;
        union_id?: string;
      }>;
    }>({
      account,
      method: "POST",
      path: "/contact/v3/users/batch_get_id",
      query: {
        user_id_type: "open_id",
      },
      body: {
        mobiles: [mobile],
      },
    });

    const user = result.user_list?.[0];
    if (user) {
      return {
        input: mobile,
        resolved: true,
        openId: user.open_id,
        userId: user.user_id,
        unionId: user.union_id,
      };
    }

    return {
      input: mobile,
      resolved: false,
      error: "User not found",
    };
  } catch (err) {
    return {
      input: mobile,
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get user info by ID
 */
export async function getFeishuUserById(params: {
  account: ResolvedFeishuAccount;
  userId: string;
  userIdType?: "open_id" | "user_id" | "union_id";
}): Promise<ResolvedFeishuUser> {
  const { account, userId, userIdType = "open_id" } = params;

  try {
    const result = await feishuRequest<{ user: FeishuUserInfo }>({
      account,
      method: "GET",
      path: `/contact/v3/users/${userId}`,
      query: {
        user_id_type: userIdType,
      },
    });

    const user = result.user;
    return {
      input: userId,
      resolved: true,
      openId: user.open_id,
      userId: user.user_id,
      unionId: user.union_id,
      name: user.name ?? user.en_name ?? user.nickname,
      email: user.email,
    };
  } catch (err) {
    return {
      input: userId,
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve multiple users from an allowlist
 *
 * Supports:
 * - open_id (ou_xxx)
 * - user_id
 * - union_id (on_xxx)
 * - email addresses
 */
export async function resolveFeishuUserAllowlist(params: {
  account: ResolvedFeishuAccount;
  entries: string[];
}): Promise<ResolvedFeishuUser[]> {
  const { account, entries } = params;
  const results: ResolvedFeishuUser[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Check if it's an email
    if (trimmed.includes("@") && !trimmed.startsWith("ou_") && !trimmed.startsWith("on_")) {
      const result = await resolveFeishuUserByEmail({ account, email: trimmed });
      results.push(result);
      continue;
    }

    // Check if it's a phone number (starts with + or is all digits)
    if (/^\+?\d+$/.test(trimmed)) {
      const result = await resolveFeishuUserByMobile({ account, mobile: trimmed });
      results.push(result);
      continue;
    }

    // Assume it's a user ID
    const idType: "open_id" | "user_id" | "union_id" = trimmed.startsWith("ou_")
      ? "open_id"
      : trimmed.startsWith("on_")
        ? "union_id"
        : "user_id";

    const result = await getFeishuUserById({
      account,
      userId: trimmed,
      userIdType: idType,
    });
    results.push(result);
  }

  return results;
}

/**
 * Search users by name
 */
export async function searchFeishuUsers(params: {
  account: ResolvedFeishuAccount;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<{
  users: FeishuUserInfo[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, query, limit = 20, pageToken } = params;

  const queryParams: Record<string, string> = {
    query,
    page_size: String(Math.min(limit, 50)),
  };

  if (pageToken) {
    queryParams.page_token = pageToken;
  }

  const result = await feishuRequest<{
    users: FeishuUserInfo[];
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: "/search/v1/user",
    query: queryParams,
  });

  return {
    users: result.users ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Batch get users by IDs
 */
export async function batchGetFeishuUsers(params: {
  account: ResolvedFeishuAccount;
  userIds: string[];
  userIdType?: "open_id" | "user_id" | "union_id";
}): Promise<Map<string, FeishuUserInfo>> {
  const { account, userIds, userIdType = "open_id" } = params;
  const results = new Map<string, FeishuUserInfo>();

  // Feishu API limits batch size to 50
  const batchSize = 50;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    try {
      const result = await feishuRequest<{
        items: FeishuUserInfo[];
      }>({
        account,
        method: "GET",
        path: "/contact/v3/users/batch",
        query: {
          user_ids: batch.join(","),
          user_id_type: userIdType,
        },
      });

      for (const user of result.items ?? []) {
        const id =
          userIdType === "open_id"
            ? user.open_id
            : userIdType === "union_id"
              ? user.union_id
              : user.user_id;
        if (id) {
          results.set(id, user);
        }
      }
    } catch {
      // Continue with next batch on error
    }
  }

  return results;
}
