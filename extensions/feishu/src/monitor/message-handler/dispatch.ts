import { deliverAutoReply } from "../../../../../src/auto-reply/router.js";
import { logVerbose } from "../../../../../src/globals.js";

import { deliverFeishuReplies } from "../replies.js";
import type { PreparedFeishuMessage } from "./types.js";

export async function dispatchPreparedFeishuMessage(
  prepared: PreparedFeishuMessage,
): Promise<void> {
  const { ctx, account, route, replyTarget, ctxPayload, threadContext } = prepared;

  const hasRepliedRef = { value: false };

  try {
    await deliverAutoReply({
      ctxPayload,
      route,
      runtime: ctx.runtime,
      deliverReplies: async (replies) => {
        await deliverFeishuReplies({
          replies,
          target: replyTarget,
          account,
          runtime: ctx.runtime,
          textLimit: ctx.textLimit,
          replyToId: threadContext.replyToId,
        });
        hasRepliedRef.value = true;
      },
      onStreamChunk: async () => {
        // Feishu doesn't support streaming replies well, so we skip chunk delivery
      },
      onError: (err) => {
        ctx.logger.error({ error: String(err) }, "feishu auto-reply failed");
      },
    });
  } catch (err) {
    logVerbose(`feishu dispatch failed: ${String(err)}`);
    ctx.runtime.error?.(`feishu dispatch failed: ${String(err)}`);
  }
}
