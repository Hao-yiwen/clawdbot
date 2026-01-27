import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import type { FeishuAccountConfig, FeishuConfig } from "./types.js";

export type FeishuCredentialSource = "env" | "config" | "none";

export type ResolvedFeishuAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  webhookPath: string;
  credentialSource: FeishuCredentialSource;
  config: FeishuAccountConfig;
};

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_WEBHOOK_PATH = "/feishu/webhook";

function getFeishuConfig(cfg: ClawdbotConfig): FeishuConfig | undefined {
  return (cfg as { channels?: { feishu?: FeishuConfig } }).channels?.feishu;
}

function resolveAppId(
  explicit?: string,
  accountConfig?: FeishuAccountConfig,
): { appId?: string; source: FeishuCredentialSource } {
  // 1. Explicit value
  if (explicit?.trim()) {
    return { appId: explicit.trim(), source: "config" };
  }

  // 2. Account config
  if (accountConfig?.appId?.trim()) {
    return { appId: accountConfig.appId.trim(), source: "config" };
  }

  // 3. Environment variable (default account only)
  const envAppId = process.env.FEISHU_APP_ID?.trim();
  if (envAppId) {
    return { appId: envAppId, source: "env" };
  }

  return { source: "none" };
}

function resolveAppSecret(
  explicit?: string,
  accountConfig?: FeishuAccountConfig,
): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  if (accountConfig?.appSecret?.trim()) return accountConfig.appSecret.trim();
  return process.env.FEISHU_APP_SECRET?.trim();
}

function resolveEncryptKey(accountConfig?: FeishuAccountConfig): string | undefined {
  if (accountConfig?.encryptKey?.trim()) return accountConfig.encryptKey.trim();
  return process.env.FEISHU_ENCRYPT_KEY?.trim();
}

function resolveVerificationToken(accountConfig?: FeishuAccountConfig): string | undefined {
  if (accountConfig?.verificationToken?.trim()) {
    return accountConfig.verificationToken.trim();
  }
  return process.env.FEISHU_VERIFICATION_TOKEN?.trim();
}

/**
 * List all configured Feishu account IDs
 */
export function listFeishuAccountIds(cfg: ClawdbotConfig): string[] {
  const feishuConfig = getFeishuConfig(cfg);
  if (!feishuConfig) return [];

  const ids = new Set<string>();

  // Check for root-level credentials (default account)
  if (feishuConfig.appId || process.env.FEISHU_APP_ID) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  // Check named accounts
  if (feishuConfig.accounts) {
    for (const id of Object.keys(feishuConfig.accounts)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

/**
 * Get the default account ID
 */
export function resolveDefaultFeishuAccountId(cfg: ClawdbotConfig): string {
  const ids = listFeishuAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a Feishu account by ID
 */
export function resolveFeishuAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const { cfg } = params;
  const accountId = params.accountId?.trim() || resolveDefaultFeishuAccountId(cfg);
  const feishuConfig = getFeishuConfig(cfg);

  // Get account-specific config
  const accountConfig =
    accountId === DEFAULT_ACCOUNT_ID
      ? feishuConfig
      : feishuConfig?.accounts?.[accountId];

  // Merge with root config for named accounts
  const mergedConfig: FeishuAccountConfig = {
    ...feishuConfig,
    ...accountConfig,
  };

  // Resolve credentials
  const { appId, source } = resolveAppId(undefined, mergedConfig);
  const appSecret = resolveAppSecret(undefined, mergedConfig);
  const encryptKey = resolveEncryptKey(mergedConfig);
  const verificationToken = resolveVerificationToken(mergedConfig);
  const webhookPath = mergedConfig.webhookPath?.trim() || DEFAULT_WEBHOOK_PATH;

  // Determine enabled state
  const enabled =
    mergedConfig.enabled !== false && Boolean(appId) && Boolean(appSecret);

  return {
    accountId,
    enabled,
    name: mergedConfig.name,
    appId: appId ?? "",
    appSecret: appSecret ?? "",
    encryptKey,
    verificationToken,
    webhookPath,
    credentialSource: source,
    config: mergedConfig,
  };
}

/**
 * List all enabled Feishu accounts
 */
export function listEnabledFeishuAccounts(
  cfg: ClawdbotConfig,
): ResolvedFeishuAccount[] {
  const ids = listFeishuAccountIds(cfg);
  return ids
    .map((id) => resolveFeishuAccount({ cfg, accountId: id }))
    .filter((account) => account.enabled);
}

/**
 * Check if Feishu is configured
 */
export function isFeishuConfigured(cfg: ClawdbotConfig): boolean {
  return listEnabledFeishuAccounts(cfg).length > 0;
}
