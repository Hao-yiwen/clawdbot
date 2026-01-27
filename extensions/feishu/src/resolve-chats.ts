import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
  type FeishuChatInfo,
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

export type ResolvedFeishuChat = {
  input: string;
  resolved: boolean;
  chatId?: string;
  name?: string;
  description?: string;
  chatType?: string;
  error?: string;
};

/**
 * Get chat info by ID
 */
export async function getFeishuChatById(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
}): Promise<ResolvedFeishuChat> {
  const { account, chatId } = params;

  try {
    const result = await feishuRequest<FeishuChatInfo>({
      account,
      method: "GET",
      path: `/im/v1/chats/${chatId}`,
    });

    return {
      input: chatId,
      resolved: true,
      chatId: result.chat_id ?? chatId,
      name: result.name,
      description: result.description,
      chatType: result.chat_type,
    };
  } catch (err) {
    return {
      input: chatId,
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Search chats by name
 */
export async function searchFeishuChats(params: {
  account: ResolvedFeishuAccount;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<{
  chats: FeishuChatInfo[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, query, limit = 20, pageToken } = params;

  const queryParams: Record<string, string> = {
    query,
    page_size: String(Math.min(limit, 100)),
  };

  if (pageToken) {
    queryParams.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: FeishuChatInfo[];
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: "/im/v1/chats/search",
    query: queryParams,
  });

  return {
    chats: result.items ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * List chats the bot is in
 */
export async function listFeishuBotChats(params: {
  account: ResolvedFeishuAccount;
  limit?: number;
  pageToken?: string;
}): Promise<{
  chats: FeishuChatInfo[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, limit = 100, pageToken } = params;

  const queryParams: Record<string, string> = {
    page_size: String(Math.min(limit, 100)),
  };

  if (pageToken) {
    queryParams.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: FeishuChatInfo[];
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: "/im/v1/chats",
    query: queryParams,
  });

  return {
    chats: result.items ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Resolve chat by name (search and find exact match)
 */
export async function resolveFeishuChatByName(params: {
  account: ResolvedFeishuAccount;
  name: string;
}): Promise<ResolvedFeishuChat> {
  const { account, name } = params;

  try {
    const searchResult = await searchFeishuChats({
      account,
      query: name,
      limit: 20,
    });

    // Find exact match
    const exactMatch = searchResult.chats.find(
      (chat) => chat.name?.toLowerCase() === name.toLowerCase(),
    );

    if (exactMatch) {
      return {
        input: name,
        resolved: true,
        chatId: exactMatch.chat_id,
        name: exactMatch.name,
        description: exactMatch.description,
        chatType: exactMatch.chat_type,
      };
    }

    // Return first result if no exact match
    const firstMatch = searchResult.chats[0];
    if (firstMatch) {
      return {
        input: name,
        resolved: true,
        chatId: firstMatch.chat_id,
        name: firstMatch.name,
        description: firstMatch.description,
        chatType: firstMatch.chat_type,
      };
    }

    return {
      input: name,
      resolved: false,
      error: "Chat not found",
    };
  } catch (err) {
    return {
      input: name,
      resolved: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve multiple chats from an allowlist
 *
 * Supports:
 * - chat_id (oc_xxx)
 * - chat names
 */
export async function resolveFeishuChatAllowlist(params: {
  account: ResolvedFeishuAccount;
  entries: string[];
}): Promise<ResolvedFeishuChat[]> {
  const { account, entries } = params;
  const results: ResolvedFeishuChat[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // Skip wildcard
    if (trimmed === "*") {
      results.push({
        input: trimmed,
        resolved: true,
        chatId: "*",
        name: "All chats",
      });
      continue;
    }

    // Check if it's a chat ID
    if (trimmed.startsWith("oc_")) {
      const result = await getFeishuChatById({ account, chatId: trimmed });
      results.push(result);
      continue;
    }

    // Assume it's a chat name
    const result = await resolveFeishuChatByName({ account, name: trimmed });
    results.push(result);
  }

  return results;
}

export type FeishuChatMember = {
  memberId: string;
  memberIdType: string;
  name?: string;
  tenantKey?: string;
};

/**
 * List members of a chat
 */
export async function listFeishuChatMembers(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
  memberIdType?: "open_id" | "user_id" | "union_id";
  limit?: number;
  pageToken?: string;
}): Promise<{
  members: FeishuChatMember[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, chatId, memberIdType = "open_id", limit = 100, pageToken } = params;

  const queryParams: Record<string, string> = {
    member_id_type: memberIdType,
    page_size: String(Math.min(limit, 100)),
  };

  if (pageToken) {
    queryParams.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: Array<{
      member_id: string;
      member_id_type: string;
      name?: string;
      tenant_key?: string;
    }>;
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: `/im/v1/chats/${chatId}/members`,
    query: queryParams,
  });

  return {
    members: (result.items ?? []).map((item) => ({
      memberId: item.member_id,
      memberIdType: item.member_id_type,
      name: item.name,
      tenantKey: item.tenant_key,
    })),
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Get all members of a chat (handles pagination)
 */
export async function getAllFeishuChatMembers(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
  memberIdType?: "open_id" | "user_id" | "union_id";
}): Promise<FeishuChatMember[]> {
  const { account, chatId, memberIdType = "open_id" } = params;
  const allMembers: FeishuChatMember[] = [];

  let pageToken: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const result = await listFeishuChatMembers({
      account,
      chatId,
      memberIdType,
      pageToken,
    });

    allMembers.push(...result.members);
    hasMore = result.hasMore;
    pageToken = result.pageToken;
  }

  return allMembers;
}
