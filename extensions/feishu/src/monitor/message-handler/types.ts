import type { ResolvedFeishuAccount } from "../../accounts.js";
import type { FeishuMessageEvent } from "../../types.js";
import type { FeishuMonitorContext } from "../context.js";
import type { FeishuThreadContext } from "../../threading.js";

// Local type definitions (simplified from core types)
export type AgentRoute = {
  agentId: string;
  accountId: string;
  sessionKey: string;
  mainSessionKey: string;
};

export type FinalizedMsgContext = {
  Body: string;
  RawBody: string;
  CommandBody: string;
  From: string;
  To: string;
  SessionKey: string;
  AccountId: string;
  ChatType: "direct" | "channel";
  ConversationLabel: string;
  GroupSubject?: string;
  GroupSystemPrompt?: string;
  SenderName: string;
  SenderId: string;
  Provider: string;
  Surface: string;
  MessageSid?: string;
  MessageSids?: string[];
  MessageSidFirst?: string;
  MessageSidLast?: string;
  ReplyToId?: string;
  MessageThreadId?: string;
  ParentSessionKey?: string;
  Timestamp?: number;
  WasMentioned?: boolean;
  CommandAuthorized?: boolean;
  OriginatingChannel: string;
  OriginatingTo: string;
};

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
