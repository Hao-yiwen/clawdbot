import * as Lark from "@larksuiteoapi/node-sdk";
import type { ClawdbotConfig, RuntimeEnv } from "clawdbot/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import { resolveFeishuAccount, type ResolvedFeishuAccount } from "./accounts.js";
import type { FeishuMessageEvent } from "./types.js";
import { createFeishuMonitorProvider } from "./monitor/provider.js";

export type FeishuWSClientOptions = {
  cfg: ClawdbotConfig;
  runtime: RuntimeEnv;
  accountId?: string;
};

export type FeishuWSClient = {
  start: () => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
};

// Store active WS clients by account ID
const activeClients = new Map<string, { wsClient: Lark.WSClient; running: boolean }>();

/**
 * Create a Feishu WebSocket client for receiving events via long connection
 */
export async function createFeishuWSClient(
  options: FeishuWSClientOptions,
): Promise<FeishuWSClient> {
  const { cfg, runtime, accountId } = options;
  const core = getFeishuRuntime();

  const logger = core.logging.getChildLogger({ module: "feishu-ws" });
  const logVerbose = (message: string) => {
    if (core.logging.shouldLogVerbose()) {
      logger.debug(message);
    }
  };

  // Resolve account
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.appId || !account.appSecret) {
    throw new Error(`Feishu credentials not configured for account ${accountId ?? "default"}`);
  }

  const clientKey = account.accountId;

  // Check if already running
  const existing = activeClients.get(clientKey);
  if (existing?.running) {
    logVerbose(`feishu ws: client already running for account ${clientKey}`);
    return {
      start: async () => {},
      stop: () => stopFeishuWSClient(clientKey),
      isRunning: () => true,
    };
  }

  // Create monitor provider for handling messages
  const monitorProvider = await createFeishuMonitorProvider({
    cfg,
    runtime,
    accountId: account.accountId,
  });

  // Create WebSocket client
  const wsClient = new Lark.WSClient({
    appId: account.appId,
    appSecret: account.appSecret,
    loggerLevel: Lark.LoggerLevel.info,
  });

  let running = false;

  const start = async () => {
    if (running) {
      logVerbose("feishu ws: already started");
      return;
    }

    logVerbose(`feishu ws: starting WebSocket client for account ${clientKey}`);

    try {
      await wsClient.start({
        eventDispatcher: new Lark.EventDispatcher({}).register({
          // Handle incoming messages
          "im.message.receive_v1": async (data) => {
            try {
              logVerbose(`feishu ws: received message event`);

              // Convert Lark SDK event format to our internal format
              const event: FeishuMessageEvent = {
                schema: "2.0",
                header: {
                  event_id: data.event_id || "",
                  event_type: "im.message.receive_v1",
                  create_time: data.message?.create_time || String(Date.now()),
                  token: "",
                  app_id: account.appId,
                  tenant_key: "",
                },
                event: {
                  sender: {
                    sender_id: {
                      open_id: data.sender?.sender_id?.open_id,
                      user_id: data.sender?.sender_id?.user_id,
                      union_id: data.sender?.sender_id?.union_id,
                    },
                    sender_type: data.sender?.sender_type,
                    tenant_key: data.sender?.tenant_key,
                  },
                  message: {
                    message_id: data.message?.message_id,
                    root_id: data.message?.root_id,
                    parent_id: data.message?.parent_id,
                    create_time: data.message?.create_time,
                    chat_id: data.message?.chat_id,
                    chat_type: data.message?.chat_type,
                    message_type: data.message?.message_type,
                    content: data.message?.content,
                    mentions: data.message?.mentions?.map((m: any) => ({
                      key: m.key,
                      id: {
                        open_id: m.id?.open_id,
                        user_id: m.id?.user_id,
                      },
                      name: m.name,
                      tenant_key: m.tenant_key,
                    })),
                  },
                },
              };

              // Process the event through our monitor provider
              await monitorProvider.handleEvent(event);
            } catch (err) {
              logger.error({ error: String(err) }, "feishu ws: error handling message");
              runtime.error?.(`feishu ws: error handling message: ${String(err)}`);
            }
          },
        }),
      });

      running = true;
      activeClients.set(clientKey, { wsClient, running: true });
      logger.info({ accountId: clientKey }, "feishu ws: WebSocket client started");
    } catch (err) {
      logger.error({ error: String(err) }, "feishu ws: failed to start WebSocket client");
      throw err;
    }
  };

  const stop = () => {
    stopFeishuWSClient(clientKey);
    running = false;
  };

  const isRunning = () => running;

  return {
    start,
    stop,
    isRunning,
  };
}

/**
 * Stop a WebSocket client by account ID
 */
export function stopFeishuWSClient(accountId?: string): void {
  const key = accountId ?? "default";
  const entry = activeClients.get(key);
  if (entry) {
    entry.running = false;
    activeClients.delete(key);
  }
}

/**
 * Stop all active WebSocket clients
 */
export function stopAllFeishuWSClients(): void {
  for (const [key] of activeClients) {
    stopFeishuWSClient(key);
  }
}

/**
 * Check if a WebSocket client is running for an account
 */
export function isFeishuWSClientRunning(accountId?: string): boolean {
  const key = accountId ?? "default";
  return activeClients.get(key)?.running ?? false;
}

/**
 * List all active WebSocket client account IDs
 */
export function listActiveFeishuWSClients(): string[] {
  return Array.from(activeClients.keys()).filter((key) => activeClients.get(key)?.running);
}
