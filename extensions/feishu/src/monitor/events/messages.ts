import { getFeishuRuntime } from "../../runtime.js";
import type { ResolvedFeishuAccount } from "../../accounts.js";
import type { FeishuMessageEvent } from "../../types.js";
import type { FeishuMonitorContext } from "../context.js";
import type { FeishuMessageHandler } from "../message-handler.js";

export type FeishuMessageEventHandler = {
  handleMessageReceive: (event: FeishuMessageEvent) => Promise<void>;
};

export function createFeishuMessageEventHandler(params: {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
  messageHandler: FeishuMessageHandler;
}): FeishuMessageEventHandler {
  const { ctx, messageHandler } = params;
  const core = getFeishuRuntime();

  const logVerbose = (message: string) => {
    if (core.logging.shouldLogVerbose()) {
      ctx.logger.debug(message);
    }
  };

  const handleMessageReceive = async (event: FeishuMessageEvent) => {
    const message = event.event.message;
    const sender = event.event.sender;

    if (!message || !sender) {
      logVerbose("feishu: skip message event (missing message or sender)");
      return;
    }

    // Skip bot's own messages
    if (sender.sender_type === "app") {
      logVerbose("feishu: skip message from app (bot)");
      return;
    }

    // Check if bot was mentioned
    const mentions = message.mentions ?? [];
    const wasMentioned = ctx.botOpenId
      ? mentions.some((m) => m.id?.open_id === ctx.botOpenId)
      : false;

    await messageHandler(event, { wasMentioned });
  };

  return {
    handleMessageReceive,
  };
}

/**
 * Check if the message is from the bot itself
 */
export function isBotMessage(params: {
  senderId?: string;
  senderType?: string;
  botOpenId?: string;
}): boolean {
  if (params.senderType === "app") return true;
  if (params.botOpenId && params.senderId === params.botOpenId) return true;
  return false;
}

/**
 * Extract mentions from a Feishu message
 */
export function extractMentions(message: {
  mentions?: Array<{
    key?: string;
    id?: { open_id?: string; user_id?: string };
    name?: string;
  }>;
}): Array<{ openId?: string; userId?: string; name?: string; key?: string }> {
  return (message.mentions ?? []).map((m) => ({
    openId: m.id?.open_id,
    userId: m.id?.user_id,
    name: m.name,
    key: m.key,
  }));
}

/**
 * Check if the bot was mentioned in a message
 */
export function wasBotMentioned(params: {
  mentions: Array<{ openId?: string }>;
  botOpenId?: string;
}): boolean {
  if (!params.botOpenId) return false;
  return params.mentions.some((m) => m.openId === params.botOpenId);
}

/**
 * Remove mention placeholders from message text
 */
export function removeMentionPlaceholders(
  text: string,
  mentions: Array<{ key?: string }>,
): string {
  let result = text;
  for (const mention of mentions) {
    if (mention.key) {
      result = result.replace(new RegExp(mention.key, "g"), "");
    }
  }
  return result.trim();
}
