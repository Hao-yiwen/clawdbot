import type { ClawdbotConfig, RuntimeEnv } from "clawdbot/plugin-sdk";

import { logVerbose } from "../../../../src/globals.js";
import { resolveSessionScope } from "../../../../src/config/sessions.js";
import type { DmPolicy, GroupPolicy } from "../../../../src/config/types.js";

import { resolveFeishuAccount, type ResolvedFeishuAccount } from "../accounts.js";
import { getFeishuBotInfo } from "../api.js";
import type { FeishuEvent, FeishuMessageEvent } from "../types.js";

import { createFeishuMonitorContext, type FeishuMonitorContext } from "./context.js";
import { createFeishuMessageHandler, type FeishuMessageHandler } from "./message-handler.js";
import { createFeishuEventHandlers, type FeishuEventHandlers } from "./events/index.js";

export type FeishuMonitorProvider = {
  ctx: FeishuMonitorContext;
  account: ResolvedFeishuAccount;
  messageHandler: FeishuMessageHandler;
  eventHandlers: FeishuEventHandlers;
  handleEvent: (event: FeishuEvent) => Promise<void>;
  stop: () => void;
};

export type FeishuMonitorProviderParams = {
  cfg: ClawdbotConfig;
  runtime: RuntimeEnv;
  accountId?: string;
};

/**
 * Create a Feishu monitor provider for handling events
 */
export async function createFeishuMonitorProvider(
  params: FeishuMonitorProviderParams,
): Promise<FeishuMonitorProvider> {
  const { cfg, runtime, accountId } = params;

  // Resolve account
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.appId || !account.appSecret) {
    throw new Error(`Feishu credentials not configured for account ${accountId ?? "default"}`);
  }

  // Get bot info to resolve bot's open_id
  let botOpenId: string | undefined;
  try {
    const botInfo = await getFeishuBotInfo(account);
    botOpenId = botInfo.open_id;
    logVerbose(`feishu: resolved bot open_id: ${botOpenId}`);
  } catch (err) {
    logVerbose(`feishu: failed to get bot info: ${String(err)}`);
  }

  // Resolve config values
  const feishuConfig = account.config;
  const sessionScope = resolveSessionScope(cfg.session?.scope);
  const mainKey = `feishu:${account.accountId}`;

  const dmConfig = feishuConfig.dm;
  const dmEnabled = dmConfig?.enabled !== false;
  const dmPolicy: DmPolicy = dmConfig?.policy ?? "pairing";
  const allowFrom = dmConfig?.allowFrom ?? [];

  const groupPolicy: GroupPolicy = feishuConfig.groupPolicy ?? "allowlist";
  const defaultRequireMention = feishuConfig.requireMention ?? true;
  const groupsConfig = feishuConfig.groups;

  const historyLimit = feishuConfig.historyLimit ?? 5;
  const textLimit = feishuConfig.textChunkLimit ?? 4000;

  // Create monitor context
  const ctx = createFeishuMonitorContext({
    cfg,
    accountId: account.accountId,
    account,
    runtime,
    appId: account.appId,
    botOpenId,
    historyLimit,
    sessionScope,
    mainKey,
    dmEnabled,
    dmPolicy,
    allowFrom,
    defaultRequireMention,
    groupsConfig,
    groupPolicy,
    textLimit,
  });

  // Create message handler
  const messageHandler = createFeishuMessageHandler({ ctx, account });

  // Create event handlers
  const eventHandlers = createFeishuEventHandlers({
    ctx,
    account,
    messageHandler,
  });

  // Main event handler
  const handleEvent = async (event: FeishuEvent) => {
    try {
      // Check for mismatched app_id
      if ("header" in event && event.header?.app_id) {
        if (ctx.shouldDropMismatchedEvent(event.header.app_id)) {
          return;
        }
      }

      await eventHandlers.handleEvent(event);
    } catch (err) {
      logVerbose(`feishu: event handler error: ${String(err)}`);
      runtime.error?.(`feishu: event handler error: ${String(err)}`);
    }
  };

  const stop = () => {
    // Cleanup if needed
    logVerbose(`feishu: monitor provider stopped for account ${account.accountId}`);
  };

  return {
    ctx,
    account,
    messageHandler,
    eventHandlers,
    handleEvent,
    stop,
  };
}

// Active providers by account ID
const activeProviders = new Map<string, FeishuMonitorProvider>();

/**
 * Get or create a provider for an account
 */
export async function getFeishuMonitorProvider(
  params: FeishuMonitorProviderParams,
): Promise<FeishuMonitorProvider> {
  const accountId = params.accountId ?? "default";
  const existing = activeProviders.get(accountId);
  if (existing) {
    return existing;
  }

  const provider = await createFeishuMonitorProvider(params);
  activeProviders.set(accountId, provider);
  return provider;
}

/**
 * Stop and remove a provider for an account
 */
export function stopFeishuMonitorProvider(accountId?: string): void {
  const key = accountId ?? "default";
  const provider = activeProviders.get(key);
  if (provider) {
    provider.stop();
    activeProviders.delete(key);
  }
}

/**
 * Stop all active providers
 */
export function stopAllFeishuMonitorProviders(): void {
  for (const [key, provider] of activeProviders) {
    provider.stop();
    activeProviders.delete(key);
  }
}

/**
 * List active provider account IDs
 */
export function listActiveFeishuMonitorProviders(): string[] {
  return Array.from(activeProviders.keys());
}
