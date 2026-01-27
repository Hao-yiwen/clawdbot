import {
  createReplyPrefixContext,
  type RuntimeEnv,
} from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "../accounts.js";
import { sendMessageFeishu } from "../send.js";
import { getFeishuRuntime } from "../runtime.js";

export function createFeishuReplyDispatcher(params: {
  account: ResolvedFeishuAccount;
  runtime: RuntimeEnv;
  textLimit: number;
  replyToId?: string;
  target: string;
}) {
  const core = getFeishuRuntime();
  const cfg = core.config.loadConfig();
  const agentId = cfg.agent?.id ?? "default";

  const prefixContext = createReplyPrefixContext({
    cfg,
    agentId,
  });
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "feishu");

  return {
    responsePrefix: prefixContext.responsePrefix,
    responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
    humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
    deliver: async (payload: { text?: string; mediaUrls?: string[] }) => {
      const text = payload.text ?? "";
      const mediaList = payload.mediaUrls ?? [];

      if (!text.trim() && mediaList.length === 0) return;

      // Chunk text if needed
      const chunks = text
        ? core.channel.text.chunkTextWithMode(text, params.textLimit, chunkMode)
        : [];

      // Send text chunks
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        await sendMessageFeishu(params.target, chunk, {
          account: params.account,
          replyToId: params.replyToId,
        });
      }

      // Send media URLs as separate messages (Feishu requires separate API for media)
      for (const mediaUrl of mediaList) {
        await sendMessageFeishu(params.target, `📎 ${mediaUrl}`, {
          account: params.account,
          replyToId: params.replyToId,
        });
      }
    },
    onError: (err: unknown, info: { kind: string }) => {
      const errMsg = String(err);
      params.runtime.error?.(`feishu ${info.kind} reply failed: ${errMsg}`);
    },
    onReplyStart: () => {
      // Feishu doesn't have a typing indicator API
    },
  };
}
