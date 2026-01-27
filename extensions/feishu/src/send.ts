import type { ClawdbotConfig } from "clawdbot/plugin-sdk";

import { sendFeishuMessage, replyFeishuMessage } from "./api.js";
import { resolveFeishuAccount, type ResolvedFeishuAccount } from "./accounts.js";
import {
  chunkFeishuText,
  markdownToFeishuPostContent,
  needsRichText,
  textToFeishuContent,
} from "./format.js";
import { parseFeishuTarget } from "./targets.js";

// Feishu text message limit
const FEISHU_TEXT_LIMIT = 4000;

export type FeishuSendOpts = {
  accountId?: string;
  account?: ResolvedFeishuAccount;
  replyToId?: string;
  cfg?: ClawdbotConfig;
};

export type FeishuSendResult = {
  messageId: string;
  chatId: string;
};

/**
 * Resolve account from options
 */
function resolveAccountFromOpts(
  opts: FeishuSendOpts,
): ResolvedFeishuAccount {
  if (opts.account) {
    return opts.account;
  }

  if (!opts.cfg) {
    throw new Error("Config is required when account is not provided");
  }

  return resolveFeishuAccount({
    cfg: opts.cfg,
    accountId: opts.accountId,
  });
}

/**
 * Send a message to Feishu
 */
export async function sendMessageFeishu(
  to: string,
  message: string,
  opts: FeishuSendOpts = {},
): Promise<FeishuSendResult> {
  const trimmedMessage = message?.trim() ?? "";
  if (!trimmedMessage) {
    throw new Error("Feishu send requires text message");
  }

  const account = resolveAccountFromOpts(opts);
  if (!account.appId || !account.appSecret) {
    throw new Error(
      `Feishu credentials missing for account "${account.accountId}"`
    );
  }

  // Parse target
  const target = parseFeishuTarget(to);
  if (!target) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  // Determine receive_id_type
  const receiveIdType = target.kind === "chat" ? "chat_id" : "open_id";
  const receiveId = target.id;

  // Chunk text if needed
  const textLimit = account.config.textChunkLimit ?? FEISHU_TEXT_LIMIT;
  const chunks = chunkFeishuText(trimmedMessage, textLimit);

  let lastMessageId = "";
  let lastChatId = receiveId;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirstChunk = i === 0;

    // Determine message type
    const useRichText = needsRichText(chunk);
    const msgType = useRichText ? "post" : "text";
    const content = useRichText
      ? markdownToFeishuPostContent(chunk)
      : textToFeishuContent(chunk);

    // Reply to original message for first chunk if replyToId is set
    if (isFirstChunk && opts.replyToId) {
      const result = await replyFeishuMessage({
        account,
        messageId: opts.replyToId,
        msgType,
        content,
      });
      lastMessageId = result.messageId;
    } else {
      const result = await sendFeishuMessage({
        account,
        receiveIdType,
        receiveId,
        msgType,
        content,
      });
      lastMessageId = result.messageId;
    }
  }

  return {
    messageId: lastMessageId || "unknown",
    chatId: lastChatId,
  };
}

/**
 * Reply to a Feishu message
 */
export async function replyMessageFeishu(
  messageId: string,
  message: string,
  opts: FeishuSendOpts = {},
): Promise<FeishuSendResult> {
  const trimmedMessage = message?.trim() ?? "";
  if (!trimmedMessage) {
    throw new Error("Feishu reply requires text message");
  }

  const account = resolveAccountFromOpts(opts);
  if (!account.appId || !account.appSecret) {
    throw new Error(
      `Feishu credentials missing for account "${account.accountId}"`
    );
  }

  // Determine message type
  const useRichText = needsRichText(trimmedMessage);
  const msgType = useRichText ? "post" : "text";
  const content = useRichText
    ? markdownToFeishuPostContent(trimmedMessage)
    : textToFeishuContent(trimmedMessage);

  const result = await replyFeishuMessage({
    account,
    messageId,
    msgType,
    content,
  });

  return {
    messageId: result.messageId,
    chatId: "", // Chat ID not returned from reply API
  };
}
