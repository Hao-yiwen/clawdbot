import { hasControlCommand } from "../../../../../src/auto-reply/command-detection.js";
import { shouldHandleTextCommands } from "../../../../../src/auto-reply/commands-registry.js";
import type { FinalizedMsgContext } from "../../../../../src/auto-reply/templating.js";
import {
  formatInboundEnvelope,
  resolveEnvelopeFormatOptions,
} from "../../../../../src/auto-reply/envelope.js";
import {
  buildPendingHistoryContextFromMap,
  recordPendingHistoryEntryIfEnabled,
} from "../../../../../src/auto-reply/reply/history.js";
import { finalizeInboundContext } from "../../../../../src/auto-reply/reply/inbound-context.js";
import {
  buildMentionRegexes,
  matchesMentionWithExplicit,
} from "../../../../../src/auto-reply/reply/mentions.js";
import { logVerbose, shouldLogVerbose } from "../../../../../src/globals.js";
import { enqueueSystemEvent } from "../../../../../src/infra/system-events.js";
import { buildPairingReply } from "../../../../../src/pairing/pairing-messages.js";
import { upsertChannelPairingRequest } from "../../../../../src/pairing/pairing-store.js";
import { resolveAgentRoute } from "../../../../../src/routing/resolve-route.js";
import { resolveThreadSessionKeys } from "../../../../../src/routing/session-key.js";
import { resolveMentionGatingWithBypass } from "../../../../../src/channels/mention-gating.js";
import { resolveConversationLabel } from "../../../../../src/channels/conversation-label.js";
import { resolveControlCommandGate } from "../../../../../src/channels/command-gating.js";
import { logInboundDrop } from "../../../../../src/channels/logging.js";
import { formatAllowlistMatchMeta } from "../../../../../src/channels/allowlist-match.js";
import { recordInboundSession } from "../../../../../src/channels/session.js";
import { readSessionUpdatedAt, resolveStorePath } from "../../../../../src/config/sessions.js";

import type { ResolvedFeishuAccount } from "../../accounts.js";
import { sendMessageFeishu } from "../../send.js";
import type { FeishuMessageEvent, FeishuMessage } from "../../types.js";
import { resolveFeishuThreadContext } from "../../threading.js";
import {
  normalizeFeishuChatType,
  resolveFeishuAllowListMatch,
  isFeishuUserAllowed,
  type FeishuMonitorContext,
} from "../context.js";
import type { PreparedFeishuMessage } from "./types.js";

export async function prepareFeishuMessage(params: {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
  event: FeishuMessageEvent;
  opts: { wasMentioned?: boolean };
}): Promise<PreparedFeishuMessage | null> {
  const { ctx, account, event, opts } = params;
  const cfg = ctx.cfg;

  const message = event.event.message;
  const sender = event.event.sender;

  if (!message || !sender) {
    logVerbose("feishu: drop message (missing message or sender)");
    return null;
  }

  const chatId = message.chat_id;
  const chatType = message.chat_type;
  const messageId = message.message_id;
  const senderId = sender.sender_id?.open_id;

  if (!chatId || !senderId) {
    logVerbose("feishu: drop message (missing chat_id or sender_id)");
    return null;
  }

  // Get chat info for groups
  let chatInfo: { name?: string; type?: string; description?: string } = {};
  const resolvedChatType = normalizeFeishuChatType(chatType, chatId);
  const isDirectMessage = resolvedChatType === "direct";
  const isGroup = resolvedChatType === "group";

  if (isGroup) {
    chatInfo = await ctx.resolveChatInfo(chatId);
  }
  const chatName = chatInfo?.name;

  // Check if chat is allowed
  if (!ctx.isChatAllowed({ chatId, chatType: resolvedChatType })) {
    logVerbose("feishu: drop message (chat not allowed)");
    return null;
  }

  // Get group config if applicable
  const groupConfig = isGroup ? (ctx.groupsConfig?.[chatId] ?? ctx.groupsConfig?.["*"]) : null;

  // Check DM authorization
  if (isDirectMessage) {
    if (!ctx.dmEnabled || ctx.dmPolicy === "disabled") {
      logVerbose("feishu: drop dm (dms disabled)");
      return null;
    }

    if (ctx.dmPolicy !== "open") {
      const allowMatch = resolveFeishuAllowListMatch({
        allowList: ctx.allowFrom,
        id: senderId,
      });
      const allowMatchMeta = formatAllowlistMatchMeta(allowMatch);

      if (!allowMatch.allowed) {
        if (ctx.dmPolicy === "pairing") {
          const senderInfo = await ctx.resolveUserName(senderId);
          const senderName = senderInfo?.name ?? undefined;
          const { code, created } = await upsertChannelPairingRequest({
            channel: "feishu",
            id: senderId,
            meta: { name: senderName },
          });

          if (created) {
            logVerbose(
              `feishu pairing request sender=${senderId} name=${
                senderName ?? "unknown"
              } (${allowMatchMeta})`,
            );
            try {
              await sendMessageFeishu(chatId, buildPairingReply({
                channel: "feishu",
                idLine: `Your Feishu user id: ${senderId}`,
                code,
              }), { account });
            } catch (err) {
              logVerbose(`feishu pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
        } else {
          logVerbose(
            `Blocked unauthorized feishu sender ${senderId} (dmPolicy=${ctx.dmPolicy}, ${allowMatchMeta})`,
          );
        }
        return null;
      }
    }
  }

  // Resolve route
  const route = resolveAgentRoute({
    cfg,
    channel: "feishu",
    accountId: account.accountId,
    peer: {
      kind: isDirectMessage ? "dm" : "channel",
      id: isDirectMessage ? senderId : chatId,
    },
  });

  const baseSessionKey = route.sessionKey;
  const threadContext = resolveFeishuThreadContext({ message });
  const rootId = threadContext.rootId;
  const isThreadReply = threadContext.isThreadReply;

  const threadKeys = resolveThreadSessionKeys({
    baseSessionKey,
    threadId: isThreadReply ? rootId : undefined,
  });
  const sessionKey = threadKeys.sessionKey;
  const historyKey = isThreadReply ? sessionKey : chatId;

  // Resolve sender info
  const senderInfo = await ctx.resolveUserName(senderId);
  const senderName = senderInfo?.name ?? sender.sender_id?.user_id ?? senderId;

  // Check group user authorization
  const groupUserAuthorized = isGroup
    ? isFeishuUserAllowed({
        allowList: (groupConfig?.users ?? []).map(String),
        userId: senderId,
        userName: senderName,
      }) || !(groupConfig?.users && groupConfig.users.length > 0)
    : true;

  if (isGroup && !groupUserAuthorized) {
    logVerbose(`Blocked unauthorized feishu sender ${senderId} (not in group users)`);
    return null;
  }

  // Extract message text
  const rawBody = extractMessageText(message);
  if (!rawBody.trim()) {
    logVerbose("feishu: drop message (empty body)");
    return null;
  }

  // Check mentions
  const mentionRegexes = buildMentionRegexes(cfg, route.agentId);
  const mentions = message.mentions ?? [];
  const explicitlyMentioned = Boolean(
    ctx.botOpenId && mentions.some((m) => m.id?.open_id === ctx.botOpenId),
  );
  const hasAnyMention = mentions.length > 0;

  const wasMentioned =
    opts.wasMentioned ??
    (!isDirectMessage &&
      matchesMentionWithExplicit({
        text: rawBody,
        mentionRegexes,
        explicit: {
          hasAnyMention,
          isExplicitlyMentioned: explicitlyMentioned,
          canResolveExplicit: Boolean(ctx.botOpenId),
        },
      }));

  // Check control commands
  const allowTextCommands = shouldHandleTextCommands({ cfg, surface: "feishu" });
  const hasControlCommandInMessage = hasControlCommand(rawBody, cfg);

  const ownerAuthorized = resolveFeishuAllowListMatch({
    allowList: ctx.allowFrom,
    id: senderId,
    name: senderName,
  }).allowed;

  const groupUsersAllowlistConfigured =
    isGroup && Array.isArray(groupConfig?.users) && groupConfig.users.length > 0;

  const groupCommandAuthorized =
    isGroup && groupUsersAllowlistConfigured
      ? isFeishuUserAllowed({
          allowList: (groupConfig?.users ?? []).map(String),
          userId: senderId,
          userName: senderName,
        })
      : false;

  const commandGate = resolveControlCommandGate({
    useAccessGroups: false,
    authorizers: [
      { configured: ctx.allowFrom.length > 0, allowed: ownerAuthorized },
      { configured: groupUsersAllowlistConfigured, allowed: groupCommandAuthorized },
    ],
    allowTextCommands,
    hasControlCommand: hasControlCommandInMessage,
  });
  const commandAuthorized = commandGate.commandAuthorized;

  if (isGroup && commandGate.shouldBlock) {
    logInboundDrop({
      log: logVerbose,
      channel: "feishu",
      reason: "control command (unauthorized)",
      target: senderId,
    });
    return null;
  }

  // Check mention requirement
  const shouldRequireMention = isGroup
    ? (groupConfig?.requireMention ?? ctx.defaultRequireMention)
    : false;

  const canDetectMention = Boolean(ctx.botOpenId) || mentionRegexes.length > 0;
  const mentionGate = resolveMentionGatingWithBypass({
    isGroup,
    requireMention: Boolean(shouldRequireMention),
    canDetectMention,
    wasMentioned,
    implicitMention: false,
    hasAnyMention,
    allowTextCommands,
    hasControlCommand: hasControlCommandInMessage,
    commandAuthorized,
  });

  const effectiveWasMentioned = mentionGate.effectiveWasMentioned;

  if (isGroup && shouldRequireMention && mentionGate.shouldSkip) {
    ctx.logger.info({ chatId, reason: "no-mention" }, "skipping group message");
    recordPendingHistoryEntryIfEnabled({
      historyMap: ctx.chatHistories,
      historyKey,
      limit: ctx.historyLimit,
      entry: rawBody
        ? {
            sender: senderName,
            body: rawBody,
            timestamp: message.create_time ? Number(message.create_time) : undefined,
            messageId,
          }
        : null,
    });
    return null;
  }

  // Build context payload
  const roomLabel = chatName ? `#${chatName}` : `#${chatId}`;
  const preview = rawBody.replace(/\s+/g, " ").slice(0, 160);
  const inboundLabel = isDirectMessage
    ? `Feishu DM from ${senderName}`
    : `Feishu message in ${roomLabel} from ${senderName}`;
  const feishuFrom = isDirectMessage
    ? `feishu:user:${senderId}`
    : `feishu:chat:${chatId}`;

  enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
    sessionKey,
    contextKey: `feishu:message:${chatId}:${messageId}`,
  });

  const envelopeFrom =
    resolveConversationLabel({
      ChatType: isDirectMessage ? "direct" : "channel",
      SenderName: senderName,
      GroupSubject: isGroup ? roomLabel : undefined,
      From: feishuFrom,
    }) ?? (isDirectMessage ? senderName : roomLabel);

  const textWithId = `${rawBody}\n[feishu message id: ${messageId} chat: ${chatId}]`;
  const storePath = resolveStorePath(ctx.cfg.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = resolveEnvelopeFormatOptions(ctx.cfg);
  const previousTimestamp = readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const body = formatInboundEnvelope({
    channel: "Feishu",
    from: envelopeFrom,
    timestamp: message.create_time ? Number(message.create_time) : undefined,
    body: textWithId,
    chatType: isDirectMessage ? "direct" : "channel",
    sender: { name: senderName, id: senderId },
    previousTimestamp,
    envelope: envelopeOptions,
  });

  let combinedBody = body;
  if (isGroup && ctx.historyLimit > 0) {
    combinedBody = buildPendingHistoryContextFromMap({
      historyMap: ctx.chatHistories,
      historyKey,
      limit: ctx.historyLimit,
      currentMessage: combinedBody,
      formatEntry: (entry) =>
        formatInboundEnvelope({
          channel: "Feishu",
          from: roomLabel,
          timestamp: entry.timestamp,
          body: `${entry.body}${
            entry.messageId ? ` [id:${entry.messageId} chat:${chatId}]` : ""
          }`,
          chatType: "channel",
          senderLabel: entry.sender,
          envelope: envelopeOptions,
        }),
    });
  }

  const feishuTo = isDirectMessage ? `user:${senderId}` : `chat:${chatId}`;

  const groupSystemPrompt = isGroup ? groupConfig?.systemPrompt?.trim() : undefined;

  const ctxPayload = finalizeInboundContext({
    Body: combinedBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: feishuFrom,
    To: feishuTo,
    SessionKey: sessionKey,
    AccountId: route.accountId,
    ChatType: isDirectMessage ? "direct" : "channel",
    ConversationLabel: envelopeFrom,
    GroupSubject: isGroup ? roomLabel : undefined,
    GroupSystemPrompt: groupSystemPrompt,
    SenderName: senderName,
    SenderId: senderId,
    Provider: "feishu" as const,
    Surface: "feishu" as const,
    MessageSid: messageId,
    ReplyToId: threadContext.replyToId,
    MessageThreadId: rootId,
    ParentSessionKey: threadKeys.parentSessionKey,
    Timestamp: message.create_time ? Number(message.create_time) : undefined,
    WasMentioned: isGroup ? effectiveWasMentioned : undefined,
    CommandAuthorized: commandAuthorized,
    OriginatingChannel: "feishu" as const,
    OriginatingTo: feishuTo,
  }) satisfies FinalizedMsgContext;

  await recordInboundSession({
    storePath,
    sessionKey,
    ctx: ctxPayload,
    updateLastRoute: isDirectMessage
      ? {
          sessionKey: route.mainSessionKey,
          channel: "feishu",
          to: `user:${senderId}`,
          accountId: route.accountId,
        }
      : undefined,
    onRecordError: (err) => {
      ctx.logger.warn(
        {
          error: String(err),
          storePath,
          sessionKey,
        },
        "failed updating session meta",
      );
    },
  });

  const replyTarget = ctxPayload.To ?? undefined;
  if (!replyTarget) return null;

  if (shouldLogVerbose()) {
    logVerbose(`feishu inbound: chat=${chatId} from=${feishuFrom} preview="${preview}"`);
  }

  return {
    ctx,
    account,
    event,
    route,
    groupConfig,
    replyTarget,
    ctxPayload,
    isDirectMessage,
    isGroup,
    historyKey,
    preview,
    threadContext,
  };
}

/**
 * Extract text content from Feishu message
 */
function extractMessageText(message: FeishuMessage): string {
  const content = message.content;
  if (!content) return "";

  try {
    const msgType = message.message_type;

    if (msgType === "text") {
      const parsed = JSON.parse(content) as { text?: string };
      return parsed.text ?? "";
    }

    if (msgType === "post") {
      return extractPostText(content);
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Extract plain text from post (rich text) message
 */
function extractPostText(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      zh_cn?: { title?: string; content?: Array<Array<{ tag: string; text?: string }>> };
      en_us?: { title?: string; content?: Array<Array<{ tag: string; text?: string }>> };
    };

    const post = parsed.zh_cn ?? parsed.en_us;
    if (!post) return "";

    const lines: string[] = [];

    if (post.title) {
      lines.push(post.title);
    }

    if (post.content) {
      for (const paragraph of post.content) {
        let line = "";
        for (const tag of paragraph) {
          if (tag.tag === "text" && tag.text) {
            line += tag.text;
          } else if (tag.tag === "a" && tag.text) {
            line += tag.text;
          } else if (tag.tag === "at") {
            const atTag = tag as { tag: string; user_name?: string; user_id?: string };
            line += `@${atTag.user_name ?? atTag.user_id ?? ""}`;
          }
        }
        if (line) lines.push(line);
      }
    }

    return lines.join("\n").trim();
  } catch {
    return "";
  }
}
