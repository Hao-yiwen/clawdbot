import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
  type FeishuBotInfo,
  type FeishuChatInfo,
  type FeishuUserInfo,
} from "./types.js";
import { getTenantAccessToken } from "./auth.js";
import type { ResolvedFeishuAccount } from "./accounts.js";
import { listFeishuChatMembers, type FeishuChatMember } from "./resolve-chats.js";

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

export type FeishuSelfInfo = {
  openId: string;
  name: string;
  avatarUrl?: string;
};

/**
 * Get bot's own info
 */
export async function getFeishuSelf(
  account: ResolvedFeishuAccount,
): Promise<FeishuSelfInfo | null> {
  try {
    const result = await feishuRequest<{ bot: FeishuBotInfo }>({
      account,
      method: "GET",
      path: "/bot/v3/info",
    });

    return {
      openId: result.bot.open_id ?? "",
      name: result.bot.app_name,
      avatarUrl: result.bot.avatar_url,
    };
  } catch {
    return null;
  }
}

export type FeishuPeer = {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

/**
 * List users the bot can message (from chats the bot is in)
 */
export async function listFeishuPeers(params: {
  account: ResolvedFeishuAccount;
  limit?: number;
}): Promise<FeishuPeer[]> {
  const { account, limit = 100 } = params;

  // Get all chats the bot is in
  const chats = await listFeishuBotChatsInternal({ account });

  // Collect unique users from all chats
  const userMap = new Map<string, FeishuPeer>();

  for (const chat of chats) {
    if (!chat.chat_id) continue;

    try {
      const members = await listFeishuChatMembers({
        account,
        chatId: chat.chat_id,
        memberIdType: "open_id",
        limit: 100,
      });

      for (const member of members.members) {
        if (!userMap.has(member.memberId)) {
          userMap.set(member.memberId, {
            id: member.memberId,
            name: member.name,
          });
        }
      }

      if (userMap.size >= limit) break;
    } catch {
      // Skip chats we can't access
    }
  }

  return Array.from(userMap.values()).slice(0, limit);
}

export type FeishuGroup = {
  id: string;
  name?: string;
  description?: string;
  memberCount?: number;
};

/**
 * List groups the bot is in
 */
export async function listFeishuGroups(params: {
  account: ResolvedFeishuAccount;
  limit?: number;
}): Promise<FeishuGroup[]> {
  const { account, limit = 100 } = params;

  const chats = await listFeishuBotChatsInternal({ account, limit });

  return chats
    .filter((chat) => chat.chat_type === "group")
    .map((chat) => ({
      id: chat.chat_id ?? "",
      name: chat.name,
      description: chat.description,
    }));
}

/**
 * Get group members
 */
export async function listFeishuGroupMembers(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
  limit?: number;
}): Promise<FeishuChatMember[]> {
  const { account, chatId, limit = 100 } = params;

  const result = await listFeishuChatMembers({
    account,
    chatId,
    memberIdType: "open_id",
    limit,
  });

  return result.members;
}

/**
 * Get user info
 */
export async function getFeishuUserInfo(params: {
  account: ResolvedFeishuAccount;
  userId: string;
  userIdType?: "open_id" | "user_id" | "union_id";
}): Promise<FeishuUserInfo | null> {
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

    return result.user;
  } catch {
    return null;
  }
}

/**
 * Get group info
 */
export async function getFeishuGroupInfo(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
}): Promise<FeishuChatInfo | null> {
  const { account, chatId } = params;

  try {
    const result = await feishuRequest<FeishuChatInfo>({
      account,
      method: "GET",
      path: `/im/v1/chats/${chatId}`,
    });

    return result;
  } catch {
    return null;
  }
}

// Internal helper
async function listFeishuBotChatsInternal(params: {
  account: ResolvedFeishuAccount;
  limit?: number;
}): Promise<FeishuChatInfo[]> {
  const { account, limit = 100 } = params;
  const allChats: FeishuChatInfo[] = [];

  let pageToken: string | undefined;
  let hasMore = true;

  while (hasMore && allChats.length < limit) {
    const queryParams: Record<string, string> = {
      page_size: String(Math.min(100, limit - allChats.length)),
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

    allChats.push(...(result.items ?? []));
    hasMore = result.has_more ?? false;
    pageToken = result.page_token;
  }

  return allChats;
}

/**
 * Create directory adapter for channel plugin
 */
export function createFeishuDirectoryAdapter(account: ResolvedFeishuAccount) {
  return {
    self: async () => getFeishuSelf(account),
    listPeers: async () => listFeishuPeers({ account }),
    listGroups: async () => listFeishuGroups({ account }),
  };
}
