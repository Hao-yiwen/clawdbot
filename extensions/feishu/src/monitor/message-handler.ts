import { getFeishuRuntime } from "../runtime.js";

import type { ResolvedFeishuAccount } from "../accounts.js";
import type { FeishuMessageEvent, FeishuMessage } from "../types.js";
import type { FeishuMonitorContext } from "./context.js";
import { dispatchPreparedFeishuMessage } from "./message-handler/dispatch.js";
import { prepareFeishuMessage } from "./message-handler/prepare.js";

export type FeishuMessageHandler = (
  event: FeishuMessageEvent,
  opts: { wasMentioned?: boolean },
) => Promise<void>;

export function createFeishuMessageHandler(params: {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
}): FeishuMessageHandler {
  const { ctx, account } = params;
  const core = getFeishuRuntime();
  const debounceMs = core.channel.debounce.resolveInboundDebounceMs({ cfg: ctx.cfg, channel: "feishu" });

  const debouncer = core.channel.debounce.createInboundDebouncer<{
    event: FeishuMessageEvent;
    opts: { wasMentioned?: boolean };
  }>({
    debounceMs,
    buildKey: (entry) => {
      const senderId = entry.event.event.sender?.sender_id?.open_id;
      if (!senderId) return null;
      const chatId = entry.event.event.message?.chat_id;
      const rootId = entry.event.event.message?.root_id;
      // Group by thread if it's a reply, otherwise by chat
      const threadKey = rootId ? `${chatId}:${rootId}` : chatId;
      return `feishu:${ctx.accountId}:${threadKey}:${senderId}`;
    },
    shouldDebounce: (entry) => {
      const text = extractMessageText(entry.event.event.message);
      if (!text.trim()) return false;
      return !core.channel.text.hasControlCommand(text, ctx.cfg);
    },
    onFlush: async (entries) => {
      const last = entries.at(-1);
      if (!last) return;

      // Combine text from all entries
      const combinedText =
        entries.length === 1
          ? extractMessageText(last.event.event.message)
          : entries
              .map((entry) => extractMessageText(entry.event.event.message))
              .filter(Boolean)
              .join("\n");

      const combinedMentioned = entries.some((entry) => Boolean(entry.opts.wasMentioned));

      // Create synthetic event with combined text
      const syntheticEvent: FeishuMessageEvent = {
        ...last.event,
        event: {
          ...last.event.event,
          message: {
            ...last.event.event.message,
            content: JSON.stringify({ text: combinedText }),
          },
        },
      };

      const prepared = await prepareFeishuMessage({
        ctx,
        account,
        event: syntheticEvent,
        opts: {
          wasMentioned: combinedMentioned || last.opts.wasMentioned,
        },
      });

      if (!prepared) return;

      // Record message IDs if multiple messages were combined
      if (entries.length > 1) {
        const ids = entries
          .map((entry) => entry.event.event.message?.message_id)
          .filter(Boolean) as string[];
        if (ids.length > 0) {
          prepared.ctxPayload.MessageSids = ids;
          prepared.ctxPayload.MessageSidFirst = ids[0];
          prepared.ctxPayload.MessageSidLast = ids[ids.length - 1];
        }
      }

      await dispatchPreparedFeishuMessage(prepared);
    },
    onError: (err) => {
      ctx.runtime.error?.(`feishu inbound debounce flush failed: ${String(err)}`);
    },
  });

  return async (event, opts) => {
    const message = event.event.message;
    if (!message) return;

    const messageId = message.message_id;
    const chatId = message.chat_id;

    // Check for duplicate messages
    if (ctx.markMessageSeen(chatId, messageId)) return;

    await debouncer.enqueue({ event, opts });
  };
}

/**
 * Extract text content from Feishu message
 */
function extractMessageText(message: FeishuMessage | undefined): string {
  if (!message) return "";

  const content = message.content;
  if (!content) return "";

  try {
    const msgType = message.message_type;

    if (msgType === "text") {
      const parsed = JSON.parse(content) as { text?: string };
      return parsed.text ?? "";
    }

    if (msgType === "post") {
      // Rich text message - extract plain text
      return extractPostText(content);
    }

    // For other types, return empty
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
