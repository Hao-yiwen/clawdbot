import type { ChannelPlugin, ClawdbotConfig } from "clawdbot/plugin-sdk";

import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
  type ResolvedFeishuAccount,
} from "./accounts.js";
import type { FeishuConfig } from "./types.js";
import { probeFeishu } from "./probe.js";
import { sendMessageFeishu } from "./send.js";
import { chunkFeishuText } from "./format.js";
import { looksLikeFeishuId, normalizeFeishuTarget, parseFeishuTarget } from "./targets.js";
import { getFeishuRuntime } from "./runtime.js";
import { createFeishuWSClient, type FeishuWSClient } from "./ws-client.js";
import { feishuOnboardingAdapter } from "./onboarding.js";

const DEFAULT_ACCOUNT_ID = "default";

// Channel metadata
const meta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu (Lark)",
  detailLabel: "Feishu Bot",
  docsPath: "/channels/feishu",
  docsLabel: "feishu",
  blurb: "Feishu/Lark bot for enterprise communication in China.",
  systemImage: "message.fill",
};

function getFeishuConfig(cfg: ClawdbotConfig): FeishuConfig | undefined {
  return (cfg as { channels?: { feishu?: FeishuConfig } }).channels?.feishu;
}

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  onboarding: feishuOnboardingAdapter,
  pairing: {
    idLabel: "feishuUserId",
    normalizeAllowEntry: (entry) => {
      return entry.replace(/^feishu:(?:user:)?/i, "");
    },
    notifyApproval: async ({ cfg, id }) => {
      await sendMessageFeishu(id, "Clawdbot: your access has been approved.", {
        cfg,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false, // Not implemented yet
    threads: false, // Not implemented yet
    media: false, // Not implemented yet
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.feishu"] },
  config: {
    listAccountIds: (cfg) => listFeishuAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveFeishuAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFeishuAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const feishuConfig = getFeishuConfig(cfg) ?? {};
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...feishuConfig,
              enabled,
            },
          },
        };
      }
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...feishuConfig,
            accounts: {
              ...feishuConfig.accounts,
              [accountId]: {
                ...feishuConfig.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const feishuConfig = getFeishuConfig(cfg) ?? {};
      if (accountId === DEFAULT_ACCOUNT_ID) {
        const { appId, appSecret, ...rest } = feishuConfig;
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: rest,
          },
        };
      }
      const accounts = { ...feishuConfig.accounts };
      delete accounts[accountId];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...feishuConfig,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => Boolean(account.appId?.trim() && account.appSecret?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
      tokenSource: account.credentialSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveFeishuAccount({ cfg, accountId }).config.dm?.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^feishu:(?:user:)?/i, "")),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(getFeishuConfig(cfg)?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.feishu.accounts.${resolvedAccountId}.`
        : "channels.feishu.";
      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? [],
        policyPath: `${basePath}dm.policy`,
        allowFromPath: `${basePath}dm.`,
        approveHint: "clawdbot pairing approve feishu <code>",
        normalizeEntry: (raw) => raw.replace(/^feishu:(?:user:)?/i, ""),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = (
        cfg.channels?.defaults as { groupPolicy?: string } | undefined
      )?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Feishu groups: groupPolicy="open" allows any member in groups to trigger. Set channels.feishu.groupPolicy="allowlist" to restrict access.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      const groups = account.config.groups;
      if (!groups) return account.config.requireMention ?? true;
      const groupConfig = groups[groupId] ?? groups["*"];
      return groupConfig?.requireMention ?? account.config.requireMention ?? true;
    },
  },
  messaging: {
    normalizeTarget: (target) => normalizeFeishuTarget(target),
    targetResolver: {
      looksLikeId: looksLikeFeishuId,
      hint: "<userId|chatId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) => accountId?.trim() || DEFAULT_ACCOUNT_ID,
    applyAccountName: ({ cfg, accountId, name }) => {
      const feishuConfig = getFeishuConfig(cfg) ?? {};
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...feishuConfig,
              name,
            },
          },
        };
      }
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...feishuConfig,
            accounts: {
              ...feishuConfig.accounts,
              [accountId]: {
                ...feishuConfig.accounts?.[accountId],
                name,
              },
            },
          },
        },
      };
    },
    validateInput: ({ accountId, input }) => {
      const typedInput = input as {
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
      };
      if (typedInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "FEISHU_APP_ID can only be used for the default account.";
      }
      if (!typedInput.useEnv && !typedInput.appId) {
        return "Feishu requires appId (or --use-env).";
      }
      if (!typedInput.useEnv && !typedInput.appSecret) {
        return "Feishu requires appSecret (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const typedInput = input as {
        name?: string;
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
      };
      const feishuConfig = getFeishuConfig(cfg) ?? {};

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...feishuConfig,
              enabled: true,
              ...(typedInput.name ? { name: typedInput.name } : {}),
              ...(typedInput.useEnv ? {} : typedInput.appId ? { appId: typedInput.appId } : {}),
              ...(typedInput.useEnv
                ? {}
                : typedInput.appSecret
                  ? { appSecret: typedInput.appSecret }
                  : {}),
            },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          feishu: {
            ...feishuConfig,
            enabled: true,
            accounts: {
              ...feishuConfig.accounts,
              [accountId]: {
                ...feishuConfig.accounts?.[accountId],
                enabled: true,
                ...(typedInput.name ? { name: typedInput.name } : {}),
                ...(typedInput.appId ? { appId: typedInput.appId } : {}),
                ...(typedInput.appSecret ? { appSecret: typedInput.appSecret } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => chunkFeishuText(text, limit),
    textChunkLimit: 4000,
    sendPayload: async ({ to, payload, accountId, cfg, replyToId }) => {
      const target = parseFeishuTarget(to);
      if (!target) {
        throw new Error(`Invalid Feishu target: ${to}`);
      }

      const text = payload.text ?? "";
      if (!text.trim()) {
        return { messageId: "", chatId: target.id };
      }

      const result = await sendMessageFeishu(to, text, {
        cfg,
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
      });

      return { messageId: result.messageId, chatId: result.chatId };
    },
  },
  status: {
    probe: async ({ account }) => {
      const result = await probeFeishu(account);
      return {
        ok: result.ok,
        status: result.status ?? (result.ok ? 200 : 500),
        error: result.error ?? undefined,
        elapsedMs: result.elapsedMs ?? undefined,
        meta: result.bot
          ? {
              appId: result.bot.appId,
              botName: result.bot.name,
            }
          : undefined,
      };
    },
  },
  gateway: {
    startAccount: async ({ cfg, accountId, account, runtime, abortSignal, setStatus }) => {
      const core = getFeishuRuntime();
      const logger = core.logging.getChildLogger({ module: "feishu-gateway" });

      try {
        const wsClient = await createFeishuWSClient({ cfg, runtime, accountId });
        await wsClient.start();
        logger.info({ accountId }, "feishu: WebSocket client started");
        setStatus({ accountId: accountId ?? "default", connected: true });

        // Keep running until aborted
        return new Promise<void>((resolve) => {
          abortSignal.addEventListener("abort", () => {
            wsClient.stop();
            logger.info({ accountId }, "feishu: WebSocket client stopped");
            resolve();
          });
        });
      } catch (err) {
        logger.error({ error: String(err) }, "feishu: failed to start WebSocket client");
        throw err;
      }
    },
  },
};

// Channel dock for gateway integration
export const feishuDock = {
  id: "feishu",
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  outbound: {
    textChunkLimit: 4000,
  },
};
