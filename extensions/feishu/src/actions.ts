import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
  type FeishuMessage,
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
 * Delete a message
 */
export async function deleteFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
}): Promise<void> {
  const { account, messageId } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "DELETE",
    path: `/im/v1/messages/${messageId}`,
  });
}

/**
 * Update (edit) a message
 */
export async function updateFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  msgType: "text" | "post";
  content: string;
}): Promise<void> {
  const { account, messageId, msgType, content } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "PATCH",
    path: `/im/v1/messages/${messageId}`,
    body: {
      msg_type: msgType,
      content,
    },
  });
}

/**
 * Get message content
 */
export async function getFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
}): Promise<FeishuMessage> {
  const { account, messageId } = params;

  const result = await feishuRequest<FeishuMessage>({
    account,
    method: "GET",
    path: `/im/v1/messages/${messageId}`,
  });

  return result;
}

export type FeishuHistoryMessage = {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time: string;
  update_time?: string;
  chat_id: string;
  sender: {
    id: string;
    id_type: string;
    sender_type: string;
    tenant_key?: string;
  };
  message_type: string;
  content: string;
  mentions?: Array<{
    key: string;
    id: string;
    id_type: string;
    name: string;
  }>;
  deleted?: boolean;
};

/**
 * Read message history from a chat
 */
export async function readFeishuMessages(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
  pageToken?: string;
}): Promise<{
  items: FeishuHistoryMessage[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, chatId, limit = 50, startTime, endTime, pageToken } = params;

  const query: Record<string, string> = {
    container_id_type: "chat",
    container_id: chatId,
    page_size: String(Math.min(limit, 50)),
  };

  if (startTime) {
    query.start_time = startTime;
  }
  if (endTime) {
    query.end_time = endTime;
  }
  if (pageToken) {
    query.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: FeishuHistoryMessage[];
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: "/im/v1/messages",
    query,
  });

  return {
    items: result.items ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Get replies in a thread
 */
export async function readFeishuThreadReplies(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  limit?: number;
  pageToken?: string;
}): Promise<{
  items: FeishuHistoryMessage[];
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, messageId, limit = 50, pageToken } = params;

  const query: Record<string, string> = {
    page_size: String(Math.min(limit, 50)),
  };

  if (pageToken) {
    query.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: FeishuHistoryMessage[];
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: `/im/v1/messages/${messageId}/replies`,
    query,
  });

  return {
    items: result.items ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Forward a message to another chat
 */
export async function forwardFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  receiveId: string;
  receiveIdType?: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
}): Promise<{ messageId: string }> {
  const { account, messageId, receiveId, receiveIdType = "chat_id" } = params;

  const result = await feishuRequest<{ message_id: string }>({
    account,
    method: "POST",
    path: `/im/v1/messages/${messageId}/forward`,
    query: {
      receive_id_type: receiveIdType,
    },
    body: {
      receive_id: receiveId,
    },
  });

  return { messageId: result.message_id };
}

/**
 * Mark messages as read
 */
export async function markFeishuMessagesRead(params: {
  account: ResolvedFeishuAccount;
  chatId: string;
}): Promise<void> {
  const { account, chatId } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "POST",
    path: `/im/v1/chats/${chatId}/read_users`,
  });
}

/**
 * Pin a message in a chat
 */
export async function pinFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
}): Promise<void> {
  const { account, messageId } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "POST",
    path: `/im/v1/pins`,
    body: {
      message_id: messageId,
    },
  });
}

/**
 * Unpin a message in a chat
 */
export async function unpinFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
}): Promise<void> {
  const { account, messageId } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "DELETE",
    path: `/im/v1/pins/${messageId}`,
  });
}

/**
 * Add a reaction to a message
 */
export async function addFeishuReaction(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  emojiType: string;
}): Promise<{ reactionId: string }> {
  const { account, messageId, emojiType } = params;

  const result = await feishuRequest<{ reaction_id: string }>({
    account,
    method: "POST",
    path: `/im/v1/messages/${messageId}/reactions`,
    body: {
      reaction_type: {
        emoji_type: emojiType,
      },
    },
  });

  return { reactionId: result.reaction_id };
}

/**
 * Remove a reaction from a message
 */
export async function removeFeishuReaction(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  reactionId: string;
}): Promise<void> {
  const { account, messageId, reactionId } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "DELETE",
    path: `/im/v1/messages/${messageId}/reactions/${reactionId}`,
  });
}

/**
 * Get reactions on a message
 */
export async function getFeishuReactions(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  emojiType?: string;
  pageToken?: string;
}): Promise<{
  items: Array<{
    reaction_id: string;
    operator: {
      operator_id: string;
      operator_type: string;
    };
    reaction_type: {
      emoji_type: string;
    };
    action_time: string;
  }>;
  hasMore: boolean;
  pageToken?: string;
}> {
  const { account, messageId, emojiType, pageToken } = params;

  const query: Record<string, string> = {};
  if (emojiType) {
    query.reaction_type = emojiType;
  }
  if (pageToken) {
    query.page_token = pageToken;
  }

  const result = await feishuRequest<{
    items: Array<{
      reaction_id: string;
      operator: {
        operator_id: string;
        operator_type: string;
      };
      reaction_type: {
        emoji_type: string;
      };
      action_time: string;
    }>;
    has_more: boolean;
    page_token?: string;
  }>({
    account,
    method: "GET",
    path: `/im/v1/messages/${messageId}/reactions`,
    query,
  });

  return {
    items: result.items ?? [],
    hasMore: result.has_more ?? false,
    pageToken: result.page_token,
  };
}

/**
 * Set typing indicator in a chat (urgency status)
 */
export async function setFeishuUrgent(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  userIdList: string[];
  userIdType?: "open_id" | "user_id" | "union_id";
}): Promise<void> {
  const { account, messageId, userIdList, userIdType = "open_id" } = params;

  await feishuRequest<Record<string, never>>({
    account,
    method: "PATCH",
    path: `/im/v1/messages/${messageId}/urgent_app`,
    query: {
      user_id_type: userIdType,
    },
    body: {
      user_id_list: userIdList,
    },
  });
}
