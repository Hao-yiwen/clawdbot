import type { FinalizedMsgContext } from "../../../../../src/auto-reply/templating.js";
import type { AgentRoute } from "../../../../../src/routing/resolve-route.js";

import type { ResolvedFeishuAccount } from "../../accounts.js";
import type { FeishuMessageEvent } from "../../types.js";
import type { FeishuMonitorContext } from "../context.js";
import type { FeishuThreadContext } from "../../threading.js";

export type PreparedFeishuMessage = {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
  event: FeishuMessageEvent;
  route: AgentRoute;
  groupConfig: {
    enabled?: boolean;
    allow?: boolean;
    requireMention?: boolean;
    users?: Array<string | number>;
    skills?: string[];
    systemPrompt?: string;
  } | null;
  replyTarget: string;
  ctxPayload: FinalizedMsgContext;
  isDirectMessage: boolean;
  isGroup: boolean;
  historyKey: string;
  preview: string;
  threadContext: FeishuThreadContext;
};
