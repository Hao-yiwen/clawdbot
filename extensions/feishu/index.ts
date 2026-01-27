import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";

import { feishuPlugin, feishuDock } from "./src/channel.js";
import { handleFeishuWebhookRequest } from "./src/monitor.js";
import { setFeishuRuntime } from "./src/runtime.js";

const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Clawdbot Feishu/Lark channel plugin",
  register(api: ClawdbotPluginApi) {
    setFeishuRuntime(api.runtime);
    api.registerChannel({ plugin: feishuPlugin, dock: feishuDock });

    // Register HTTP handler for webhooks
    if (typeof api.registerHttpHandler === "function") {
      api.registerHttpHandler(handleFeishuWebhookRequest);
    }
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
export * from "./src/monitor.js";
export * from "./src/probe.js";
export * from "./src/resolve-chats.js";
export * from "./src/resolve-users.js";
export * from "./src/send.js";
export * from "./src/targets.js";
export * from "./src/threading.js";
export * from "./src/types.js";

// Monitor module exports
export * from "./src/monitor/index.js";
