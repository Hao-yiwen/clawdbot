import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";

import { feishuPlugin, feishuDock } from "./src/channel.js";
import { setFeishuRuntime } from "./src/runtime.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Clawdbot Feishu/Lark channel plugin (WebSocket mode)",
  register(api: ClawdbotPluginApi) {
    setFeishuRuntime(api.runtime);
    api.registerChannel({ plugin: feishuPlugin, dock: feishuDock });
    // WebSocket connection is started via the gateway adapter in feishuPlugin
  },
};

export default plugin;

// Re-export for direct usage
export * from "./src/accounts.js";
export * from "./src/actions.js";
export * from "./src/api.js";
export * from "./src/auth.js";
export * from "./src/channel.js";
export * from "./src/directory.js";
export * from "./src/format.js";
export * from "./src/media.js";
export * from "./src/probe.js";
export * from "./src/resolve-chats.js";
export * from "./src/resolve-users.js";
export * from "./src/send.js";
export * from "./src/targets.js";
export * from "./src/threading.js";
export * from "./src/types.js";
export * from "./src/ws-client.js";
export * from "./src/onboarding.js";

// Monitor module exports
export * from "./src/monitor/index.js";
