import {
  isSilentReplyText,
  SILENT_REPLY_TOKEN,
  type ReplyPayload,
  type RuntimeEnv,
} from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "../accounts.js";
import { sendMessageFeishu } from "../send.js";

export async function deliverFeishuReplies(params: {
  replies: ReplyPayload[];
  target: string;
  account: ResolvedFeishuAccount;
  runtime: RuntimeEnv;
  textLimit: number;
  replyToId?: string;
}): Promise<void> {
  for (const payload of params.replies) {
    const mediaList = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
    const text = payload.text ?? "";
    if (!text && mediaList.length === 0) continue;

    if (mediaList.length === 0) {
      const trimmed = text.trim();
      if (!trimmed || isSilentReplyText(trimmed, SILENT_REPLY_TOKEN)) continue;

      await sendMessageFeishu(params.target, trimmed, {
        account: params.account,
        replyToId: payload.replyToId ?? params.replyToId,
      });
    } else {
      // Feishu requires separate API calls for media
      // For now, send text first, then mention media URLs
      let first = true;
      for (const mediaUrl of mediaList) {
        const caption = first ? text : "";
        first = false;

        const messageText = caption
          ? `${caption}\n\n📎 ${mediaUrl}`
          : `📎 ${mediaUrl}`;

        await sendMessageFeishu(params.target, messageText, {
          account: params.account,
          replyToId: payload.replyToId ?? params.replyToId,
        });
      }
    }

    params.runtime.log?.(`delivered reply to ${params.target}`);
  }
}

/**
 * Compute effective replyToId for a Feishu reply based on thread context
 */
export function resolveFeishuReplyToId(params: {
  replyToMode: "off" | "first" | "all";
  incomingReplyToId: string | undefined;
  messageId: string | undefined;
  hasReplied: boolean;
}): string | undefined {
  const { replyToMode, incomingReplyToId, messageId, hasReplied } = params;

  switch (replyToMode) {
    case "off":
      // Only reply if already in a thread
      return incomingReplyToId;

    case "first":
      // First reply goes to thread, subsequent to main
      if (hasReplied) return undefined;
      return incomingReplyToId ?? messageId;

    case "all":
      // All replies go to thread
      return incomingReplyToId ?? messageId;

    default:
      return incomingReplyToId;
  }
}

export type FeishuReplyDeliveryPlan = {
  nextReplyToId: () => string | undefined;
  markSent: () => void;
};

export function createFeishuReplyDeliveryPlan(params: {
  replyToMode: "off" | "first" | "all";
  incomingReplyToId: string | undefined;
  messageId: string | undefined;
  hasRepliedRef: { value: boolean };
}): FeishuReplyDeliveryPlan {
  return {
    nextReplyToId: () =>
      resolveFeishuReplyToId({
        replyToMode: params.replyToMode,
        incomingReplyToId: params.incomingReplyToId,
        messageId: params.messageId,
        hasReplied: params.hasRepliedRef.value,
      }),
    markSent: () => {
      params.hasRepliedRef.value = true;
    },
  };
}
