// Feishu API base URL
export const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

// Event header (common for all events)
export type FeishuEventHeader = {
  event_id: string;
  token: string;
  create_time: string;
  event_type: string;
  tenant_key: string;
  app_id: string;
};

// User ID types (Feishu uses multiple ID formats)
export type FeishuUserId = {
  union_id?: string;
  user_id?: string;
  open_id?: string;
};

// Mention in message
export type FeishuMention = {
  key: string;
  id: FeishuUserId;
  name: string;
  tenant_key?: string;
};

// Message sender
export type FeishuSender = {
  sender_id: FeishuUserId;
  sender_type: "user" | "app";
  tenant_key?: string;
};

// Message types
export type FeishuMessageType =
  | "text"
  | "post"
  | "image"
  | "file"
  | "audio"
  | "video"
  | "interactive"
  | "share_chat"
  | "share_user"
  | "merge_forward"
  | "sticker"
  | "location";

// Message content
export type FeishuMessage = {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time: string;
  update_time?: string;
  chat_id: string;
  chat_type: "p2p" | "group";
  message_type: FeishuMessageType;
  content: string; // JSON string
  mentions?: FeishuMention[];
};

// Message receive event (im.message.receive_v1)
export type FeishuMessageEvent = {
  schema: "2.0";
  header: FeishuEventHeader;
  event: {
    sender: FeishuSender;
    message: FeishuMessage;
  };
};

// Bot added to chat event
export type FeishuBotAddedEvent = {
  schema: "2.0";
  header: FeishuEventHeader;
  event: {
    chat_id: string;
    operator_id: FeishuUserId;
    external: boolean;
    operator_tenant_key: string;
  };
};

// Bot removed from chat event
export type FeishuBotRemovedEvent = FeishuBotAddedEvent;

// Generic event union (WebSocket mode - no URL verification)
export type FeishuEvent =
  | FeishuMessageEvent
  | FeishuBotAddedEvent
  | FeishuBotRemovedEvent;

// Rich text (post) content structure
export type FeishuPostTag =
  | { tag: "text"; text: string; style?: string[] }
  | { tag: "a"; text: string; href: string }
  | { tag: "at"; user_id: string; user_name?: string }
  | { tag: "img"; image_key: string }
  | { tag: "media"; file_key: string; image_key?: string }
  | { tag: "emotion"; emoji_type: string }
  | { tag: "code_block"; language?: string; text: string };

export type FeishuPostContent = {
  title?: string;
  content: FeishuPostTag[][];
};

export type FeishuPostMessage = {
  zh_cn?: FeishuPostContent;
  en_us?: FeishuPostContent;
};

// Text message content
export type FeishuTextContent = {
  text: string;
};

// API response types
export type FeishuApiResponse<T = unknown> = {
  code: number;
  msg: string;
  data?: T;
};

export type FeishuTokenResponse = {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
};

export type FeishuSendMessageResponse = {
  message_id: string;
};

export type FeishuBotInfo = {
  app_name: string;
  avatar_url?: string;
  ip_white_list?: string[];
  open_id?: string;
};

export type FeishuUserInfo = {
  user_id?: string;
  open_id?: string;
  union_id?: string;
  name?: string;
  en_name?: string;
  nickname?: string;
  email?: string;
  mobile?: string;
  avatar?: {
    avatar_72?: string;
    avatar_240?: string;
    avatar_640?: string;
    avatar_origin?: string;
  };
};

export type FeishuChatInfo = {
  chat_id?: string;
  avatar?: string;
  name?: string;
  description?: string;
  owner_id?: string;
  owner_id_type?: string;
  external?: boolean;
  tenant_key?: string;
  chat_status?: string;
  chat_type?: "p2p" | "group";
  chat_tag?: string;
};

// Config types
export type FeishuDmConfig = {
  enabled?: boolean;
  policy?: "open" | "pairing" | "disabled";
  allowFrom?: Array<string | number>;
};

export type FeishuGroupConfig = {
  enabled?: boolean;
  allow?: boolean;
  requireMention?: boolean;
  users?: Array<string | number>;
  systemPrompt?: string;
};

export type FeishuAccountConfig = {
  name?: string;
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  requireMention?: boolean;
  groupPolicy?: "open" | "allowlist" | "disabled";
  historyLimit?: number;
  textChunkLimit?: number;
  dm?: FeishuDmConfig;
  groups?: Record<string, FeishuGroupConfig>;
};

export type FeishuConfig = {
  accounts?: Record<string, FeishuAccountConfig>;
} & FeishuAccountConfig;
