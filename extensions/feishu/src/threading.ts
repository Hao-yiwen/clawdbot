import type { FeishuMessage } from "./types.js";

export type FeishuThreadContext = {
  rootId?: string;
  parentId?: string;
  isThreadReply: boolean;
  replyToId?: string;
  messageThreadId?: string;
};

/**
 * Resolve thread context from a Feishu message
 *
 * Feishu uses root_id and parent_id for threading:
 * - root_id: ID of the first message in the thread
 * - parent_id: ID of the message being replied to
 *
 * When both are present, the message is a reply in a thread.
 * When only root_id is present (and equals parent_id), it's a direct reply to the root.
 */
export function resolveFeishuThreadContext(params: {
  message: FeishuMessage;
}): FeishuThreadContext {
  const { message } = params;

  const rootId = message.root_id?.trim() || undefined;
  const parentId = message.parent_id?.trim() || undefined;
  const messageId = message.message_id?.trim() || undefined;

  // If no root_id, this is a top-level message
  if (!rootId) {
    return {
      isThreadReply: false,
      replyToId: undefined,
      messageThreadId: messageId,
    };
  }

  // This is a reply in a thread
  return {
    rootId,
    parentId,
    isThreadReply: true,
    // Reply to the parent message if available, otherwise the root
    replyToId: parentId ?? rootId,
    messageThreadId: rootId,
  };
}

/**
 * Build reply parameters for Feishu thread
 */
export function buildFeishuReplyParams(params: {
  threadContext: FeishuThreadContext;
  messageId?: string;
}): { replyToId?: string } {
  const { threadContext, messageId } = params;

  // If we're in a thread, reply to maintain the thread
  if (threadContext.isThreadReply && threadContext.replyToId) {
    return { replyToId: threadContext.replyToId };
  }

  // If this is a new message, reply to it to start a thread
  if (messageId) {
    return { replyToId: messageId };
  }

  return {};
}
