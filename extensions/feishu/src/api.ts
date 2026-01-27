import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
  type FeishuBotInfo,
  type FeishuChatInfo,
  type FeishuSendMessageResponse,
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

/**
 * Send a message to a user or chat
 */
export async function sendFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  receiveId: string;
  msgType: "text" | "post" | "interactive" | "image" | "file";
  content: string;
  uuid?: string;
}): Promise<{ messageId: string }> {
  const { account, receiveIdType, receiveId, msgType, content, uuid } = params;

  const body: Record<string, unknown> = {
    receive_id: receiveId,
    msg_type: msgType,
    content,
  };

  if (uuid) {
    body.uuid = uuid;
  }

  const result = await feishuRequest<FeishuSendMessageResponse>({
    account,
    method: "POST",
    path: "/im/v1/messages",
    query: { receive_id_type: receiveIdType },
    body,
  });

  return { messageId: result.message_id };
}

/**
 * Reply to a message
 */
export async function replyFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  msgType: "text" | "post" | "interactive" | "image" | "file";
  content: string;
  uuid?: string;
}): Promise<{ messageId: string }> {
  const { account, messageId, msgType, content, uuid } = params;

  const body: Record<string, unknown> = {
    msg_type: msgType,
    content,
  };

  if (uuid) {
    body.uuid = uuid;
  }

  const result = await feishuRequest<FeishuSendMessageResponse>({
    account,
    method: "POST",
    path: `/im/v1/messages/${messageId}/reply`,
    body,
  });

  return { messageId: result.message_id };
}

/**
 * Get user info by user ID
 */
export async function getFeishuUserInfo(params: {
  account: ResolvedFeishuAccount;
  userId: string;
  userIdType?: "open_id" | "user_id" | "union_id";
}): Promise<FeishuUserInfo> {
  const { account, userId, userIdType = "open_id" } = params;

  const result = await feishuRequest<{ user: FeishuUserInfo }>({
    account,
    method: "GET",
    path: `/contact/v3/users/${userId}`,
    query: { user_id_type: userIdType },
  });

  return result.user;
}

/**
 * Get chat (group) info by chat ID
 */
export async function getFeishuChatInfo(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
}): Promise<FeishuChatInfo> {
  const { account, chatId } = params;

  const result = await feishuRequest<FeishuChatInfo>({
    account,
    method: "GET",
    path: `/im/v1/chats/${chatId}`,
  });

  return result;
}

/**
 * Get bot info (for health check)
 */
export async function getFeishuBotInfo(
  account: ResolvedFeishuAccount,
): Promise<FeishuBotInfo> {
  const result = await feishuRequest<{ bot: FeishuBotInfo }>({
    account,
    method: "GET",
    path: "/bot/v3/info",
  });

  return result.bot;
}

/**
 * Probe Feishu connection (health check) - internal API
 */
export async function probeFeishuBasic(
  account: ResolvedFeishuAccount,
): Promise<{
  ok: boolean;
  error?: string;
  bot?: { appId: string; name?: string };
  elapsedMs?: number;
}> {
  const start = Date.now();

  try {
    const botInfo = await getFeishuBotInfo(account);
    return {
      ok: true,
      bot: {
        appId: account.appId,
        name: botInfo.app_name,
      },
      elapsedMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    };
  }
}
