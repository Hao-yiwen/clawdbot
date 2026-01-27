import { getFeishuRuntime } from "../../runtime.js";
import { createFeishuReplyDispatcher } from "../reply-dispatcher.js";
import type { PreparedFeishuMessage } from "./types.js";

export async function dispatchPreparedFeishuMessage(
  prepared: PreparedFeishuMessage,
): Promise<void> {
  const { ctx, account, replyTarget, ctxPayload, threadContext } = prepared;
  const core = getFeishuRuntime();

  const { dispatcher, replyOptions, markDispatchIdle } = core.channel.reply.createReplyDispatcherWithTyping(
    createFeishuReplyDispatcher({
      account,
      runtime: ctx.runtime,
      textLimit: ctx.textLimit,
      replyToId: threadContext.replyToId,
      target: replyTarget,
    }),
  );

  try {
    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg: ctx.cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    const didSendReply = counts.final + counts.tool + counts.block > 0;
    if (core.logging.shouldLogVerbose() && didSendReply) {
      const finalCount = counts.final;
      ctx.logger.debug(
        `feishu: delivered ${finalCount} reply${finalCount === 1 ? "" : "ies"} to ${replyTarget}`,
      );
    }
  } catch (err) {
    markDispatchIdle();
    if (core.logging.shouldLogVerbose()) {
      ctx.logger.debug(`feishu dispatch failed: ${String(err)}`);
    }
    ctx.runtime.error?.(`feishu dispatch failed: ${String(err)}`);
  }
}
