import type { ClawdbotConfig, RuntimeEnv } from "clawdbot/plugin-sdk";

import type { HistoryEntry } from "../../../../src/auto-reply/reply/history.js";
import type { SessionScope } from "../../../../src/config/sessions.js";
import { resolveSessionKey } from "../../../../src/config/sessions.js";
import type { DmPolicy, GroupPolicy } from "../../../../src/config/types.js";
import { logVerbose } from "../../../../src/globals.js";
import { createDedupeCache } from "../../../../src/infra/dedupe.js";
import { getChildLogger } from "../../../../src/logging.js";

import type { ResolvedFeishuAccount } from "../accounts.js";
import { getFeishuUserInfo, getFeishuChatInfo } from "../api.js";

export type FeishuChatType = "direct" | "group";

/**
 * Infer chat type from chat ID format
 */
export function inferFeishuChatType(chatId?: string | null): FeishuChatType | undefined {
  const trimmed = chatId?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("oc_")) return "group";
  if (trimmed.startsWith("ou_")) return "direct";
  return undefined;
}

/**
 * Normalize Feishu chat type
 */
export function normalizeFeishuChatType(
  chatType?: string | null,
  chatId?: string | null,
): FeishuChatType {
  const normalized = chatType?.trim().toLowerCase();
  if (normalized === "p2p" || normalized === "direct" || normalized === "im") {
    return "direct";
  }
  if (normalized === "group" || normalized === "chat") {
    return "group";
  }
  return inferFeishuChatType(chatId) ?? "group";
}

export type FeishuMonitorContext = {
  cfg: ClawdbotConfig;
  accountId: string;
  account: ResolvedFeishuAccount;
  runtime: RuntimeEnv;

  appId: string;
  botOpenId?: string;

  historyLimit: number;
  chatHistories: Map<string, HistoryEntry[]>;
  sessionScope: SessionScope;
  mainKey: string;

  dmEnabled: boolean;
  dmPolicy: DmPolicy;
  allowFrom: string[];
  defaultRequireMention: boolean;
  groupsConfig?: Record<
    string,
    {
      enabled?: boolean;
      allow?: boolean;
      requireMention?: boolean;
      users?: Array<string | number>;
      skills?: string[];
      systemPrompt?: string;
    }
  >;
  groupPolicy: GroupPolicy;
  textLimit: number;

  logger: ReturnType<typeof getChildLogger>;
  markMessageSeen: (chatId: string | undefined, messageId?: string) => boolean;
  shouldDropMismatchedEvent: (appId: unknown) => boolean;
  resolveFeishuSessionKey: (params: {
    chatId?: string | null;
    chatType?: string | null;
    userId?: string | null;
  }) => string;
  isChatAllowed: (params: {
    chatId?: string;
    chatType?: FeishuChatType;
  }) => boolean;
  resolveChatInfo: (chatId: string) => Promise<{
    name?: string;
    type?: FeishuChatType;
    description?: string;
  }>;
  resolveUserName: (userId: string) => Promise<{ name?: string }>;
};

export function createFeishuMonitorContext(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  account: ResolvedFeishuAccount;
  runtime: RuntimeEnv;

  appId: string;
  botOpenId?: string;

  historyLimit: number;
  sessionScope: SessionScope;
  mainKey: string;

  dmEnabled: boolean;
  dmPolicy: DmPolicy;
  allowFrom: Array<string | number> | undefined;
  defaultRequireMention?: boolean;
  groupsConfig?: FeishuMonitorContext["groupsConfig"];
  groupPolicy: FeishuMonitorContext["groupPolicy"];
  textLimit: number;
}): FeishuMonitorContext {
  const chatHistories = new Map<string, HistoryEntry[]>();
  const logger = getChildLogger({ module: "feishu-auto-reply" });

  const chatCache = new Map<
    string,
    {
      name?: string;
      type?: FeishuChatType;
      description?: string;
    }
  >();
  const userCache = new Map<string, { name?: string }>();
  const seenMessages = createDedupeCache({ ttlMs: 60_000, maxSize: 500 });

  const allowFrom = normalizeAllowList(params.allowFrom);
  const defaultRequireMention = params.defaultRequireMention ?? true;

  const markMessageSeen = (chatId: string | undefined, messageId?: string) => {
    if (!chatId || !messageId) return false;
    return seenMessages.check(`${chatId}:${messageId}`);
  };

  const resolveFeishuSessionKey = (p: {
    chatId?: string | null;
    chatType?: string | null;
    userId?: string | null;
  }) => {
    const chatId = p.chatId?.trim() ?? "";
    const userId = p.userId?.trim() ?? "";
    if (!chatId && !userId) return params.mainKey;

    const chatType = normalizeFeishuChatType(p.chatType, chatId);
    const isDirectMessage = chatType === "direct";

    const from = isDirectMessage
      ? `feishu:user:${userId || chatId}`
      : `feishu:chat:${chatId}`;
    const resolvedChatType = isDirectMessage ? "direct" : "channel";

    return resolveSessionKey(
      params.sessionScope,
      { From: from, ChatType: resolvedChatType, Provider: "feishu" },
      params.mainKey,
    );
  };

  const resolveChatInfo = async (chatId: string) => {
    const cached = chatCache.get(chatId);
    if (cached) return cached;
    try {
      const info = await getFeishuChatInfo({
        account: params.account,
        chatId,
      });
      const entry = {
        name: info.name,
        type: info.chatType as FeishuChatType | undefined,
        description: info.description,
      };
      chatCache.set(chatId, entry);
      return entry;
    } catch {
      return {};
    }
  };

  const resolveUserName = async (userId: string) => {
    const cached = userCache.get(userId);
    if (cached) return cached;
    try {
      const info = await getFeishuUserInfo({
        account: params.account,
        userId,
      });
      const name = info.name ?? undefined;
      const entry = { name };
      userCache.set(userId, entry);
      return entry;
    } catch {
      return {};
    }
  };

  const isChatAllowed = (p: {
    chatId?: string;
    chatType?: FeishuChatType;
  }) => {
    const chatType = normalizeFeishuChatType(p.chatType, p.chatId);
    const isDirectMessage = chatType === "direct";
    const isGroup = chatType === "group";

    if (isDirectMessage && !params.dmEnabled) return false;

    if (isGroup && p.chatId) {
      const groupPolicy = params.groupPolicy;
      const groupsConfig = params.groupsConfig;
      const hasGroupConfig = Boolean(groupsConfig) && Object.keys(groupsConfig ?? {}).length > 0;

      if (groupPolicy === "disabled") {
        logVerbose(`feishu: drop chat ${p.chatId} (groupPolicy=disabled)`);
        return false;
      }

      if (groupPolicy === "allowlist" && hasGroupConfig) {
        const chatConfig = groupsConfig?.[p.chatId] ?? groupsConfig?.["*"];
        if (!chatConfig || chatConfig.enabled === false || chatConfig.allow === false) {
          logVerbose(`feishu: drop chat ${p.chatId} (not in allowlist)`);
          return false;
        }
      }

      logVerbose(`feishu: allow chat ${p.chatId}`);
    }

    return true;
  };

  const shouldDropMismatchedEvent = (appId: unknown) => {
    if (!params.appId) return false;
    const incomingAppId = typeof appId === "string" ? appId : "";
    if (incomingAppId && incomingAppId !== params.appId) {
      logVerbose(`feishu: drop event with app_id=${incomingAppId} (expected ${params.appId})`);
      return true;
    }
    return false;
  };

  return {
    cfg: params.cfg,
    accountId: params.accountId,
    account: params.account,
    runtime: params.runtime,
    appId: params.appId,
    botOpenId: params.botOpenId,
    historyLimit: params.historyLimit,
    chatHistories,
    sessionScope: params.sessionScope,
    mainKey: params.mainKey,
    dmEnabled: params.dmEnabled,
    dmPolicy: params.dmPolicy,
    allowFrom,
    defaultRequireMention,
    groupsConfig: params.groupsConfig,
    groupPolicy: params.groupPolicy,
    textLimit: params.textLimit,
    logger,
    markMessageSeen,
    shouldDropMismatchedEvent,
    resolveFeishuSessionKey,
    isChatAllowed,
    resolveChatInfo,
    resolveUserName,
  };
}

/**
 * Normalize allow list entries to strings
 */
function normalizeAllowList(list: Array<string | number> | undefined): string[] {
  if (!list) return [];
  return list
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

/**
 * Check if a user ID matches the allow list
 */
export function isFeishuUserAllowed(params: {
  allowList: string[];
  userId: string;
  userName?: string;
}): boolean {
  if (params.allowList.length === 0) return false;
  if (params.allowList.includes("*")) return true;

  const lower = params.allowList.map((entry) => entry.toLowerCase());
  const idLower = params.userId.toLowerCase();
  const nameLower = params.userName?.toLowerCase();

  return (
    lower.includes(idLower) ||
    (nameLower !== undefined && lower.includes(nameLower))
  );
}

/**
 * Resolve allow list match result
 */
export function resolveFeishuAllowListMatch(params: {
  allowList: string[];
  id: string;
  name?: string;
}): { allowed: boolean; matchSource?: string } {
  if (params.allowList.length === 0) {
    return { allowed: false };
  }
  if (params.allowList.includes("*")) {
    return { allowed: true, matchSource: "*" };
  }

  const lower = params.allowList.map((entry) => entry.toLowerCase());
  const idLower = params.id.toLowerCase();
  const nameLower = params.name?.toLowerCase();

  if (lower.includes(idLower)) {
    return { allowed: true, matchSource: `id:${params.id}` };
  }
  if (nameLower !== undefined && lower.includes(nameLower)) {
    return { allowed: true, matchSource: `name:${params.name}` };
  }

  return { allowed: false };
}
