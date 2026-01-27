import type { ClawdbotConfig, DmPolicy, WizardPrompter } from "clawdbot/plugin-sdk";

import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
} from "./accounts.js";
import type { FeishuConfig } from "./types.js";

const channel = "feishu" as const;
const DEFAULT_ACCOUNT_ID = "default";

function getFeishuConfig(cfg: ClawdbotConfig): FeishuConfig | undefined {
  return (cfg as { channels?: { feishu?: FeishuConfig } }).channels?.feishu;
}

function normalizeAccountId(accountId?: string | null): string {
  return accountId?.trim() || DEFAULT_ACCOUNT_ID;
}

function setFeishuDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig {
  const feishuConfig = getFeishuConfig(cfg) ?? {};
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...feishuConfig,
        dm: {
          ...feishuConfig.dm,
          enabled: dmPolicy !== "disabled",
          policy: dmPolicy,
        },
      },
    },
  };
}

async function noteFeishuSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) 登录飞书开放平台: https://open.feishu.cn/",
      "2) 创建企业自建应用",
      "3) 添加「机器人」能力",
      "4) 获取 App ID 和 App Secret",
      "5) 在「事件与回调」中选择「使用长连接接收事件」",
      "6) 申请权限: im:message, im:message:send_as_bot",
      "7) 发布应用并等待审批",
      "",
      "Tip: 也可以设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET",
    ].join("\n"),
    "飞书机器人配置",
  );
}

async function noteFeishuUserIdHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "飞书用户 ID 获取方式:",
      "1) 在飞书管理后台查看用户 open_id",
      "2) 通过飞书 API 获取: /contact/v3/users",
      "3) 查看 gateway 日志中的 SenderId",
      "",
      "用户 ID 格式: ou_xxxxxx (open_id)",
    ].join("\n"),
    "飞书用户 ID",
  );
}

async function promptFeishuAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<ClawdbotConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveFeishuAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.dm?.allowFrom ?? [];

  await noteFeishuUserIdHelp(prompter);

  const parseInput = (value: string) =>
    value
      .split(/[\n,;]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const entry = await prompter.text({
    message: "飞书 allowFrom (用户 open_id)",
    placeholder: "ou_xxxxxx",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "必填"),
  });

  const parts = parseInput(String(entry));
  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
    ...parts,
  ];
  const unique = [...new Set(merged)];

  const feishuConfig = getFeishuConfig(cfg) ?? {};

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        feishu: {
          ...feishuConfig,
          enabled: true,
          dm: {
            ...feishuConfig.dm,
            enabled: true,
            policy: "allowlist",
            allowFrom: unique,
          },
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
            enabled: feishuConfig.accounts?.[accountId]?.enabled ?? true,
            dm: {
              ...feishuConfig.accounts?.[accountId]?.dm,
              enabled: true,
              policy: "allowlist",
              allowFrom: unique,
            },
          },
        },
      },
    },
  };
}

async function promptFeishuAllowFromForAccount(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<ClawdbotConfig> {
  const accountId =
    params.accountId && normalizeAccountId(params.accountId)
      ? normalizeAccountId(params.accountId)
      : resolveDefaultFeishuAccountId(params.cfg);
  return promptFeishuAllowFrom({
    cfg: params.cfg,
    prompter: params.prompter,
    accountId,
  });
}

async function promptAccountId(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  label: string;
  currentId?: string;
  listAccountIds: (cfg: ClawdbotConfig) => string[];
  defaultAccountId: string;
}): Promise<string> {
  const { cfg, prompter, label, currentId, listAccountIds, defaultAccountId } = params;
  const existingIds = listAccountIds(cfg);

  if (existingIds.length <= 1) {
    return currentId ?? defaultAccountId;
  }

  const options = existingIds.map((id) => ({
    value: id,
    label: id === DEFAULT_ACCOUNT_ID ? "default" : id,
  }));

  const selected = await prompter.select({
    message: `${label} 账户`,
    options,
    initialValue: currentId ?? defaultAccountId,
  });

  return String(selected);
}

export const feishuOnboardingDmPolicy = {
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dm.policy",
  allowFromKey: "channels.feishu.dm.allowFrom",
  getCurrent: (cfg: ClawdbotConfig): DmPolicy =>
    (getFeishuConfig(cfg)?.dm?.policy as DmPolicy) ?? "pairing",
  setPolicy: (cfg: ClawdbotConfig, policy: DmPolicy) => setFeishuDmPolicy(cfg, policy),
  promptAllowFrom: promptFeishuAllowFromForAccount,
};

export const feishuOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }: { cfg: ClawdbotConfig }) => {
    const configured = listFeishuAccountIds(cfg).some((accountId) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      return Boolean(account.appId?.trim() && account.appSecret?.trim());
    });
    return {
      channel,
      configured,
      statusLines: [`Feishu: ${configured ? "已配置" : "需要 App ID 和 App Secret"}`],
      selectionHint: configured ? "已配置" : "飞书/Lark 企业通讯",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }: {
    cfg: ClawdbotConfig;
    runtime: unknown;
    prompter: WizardPrompter;
    options?: unknown;
    accountOverrides: Partial<Record<string, string>>;
    shouldPromptAccountIds: boolean;
    forceAllowFrom: boolean;
  }) => {
    const feishuOverride = (accountOverrides as Record<string, string | undefined>).feishu?.trim();
    const defaultFeishuAccountId = resolveDefaultFeishuAccountId(cfg);
    let feishuAccountId = feishuOverride
      ? normalizeAccountId(feishuOverride)
      : defaultFeishuAccountId;

    if (shouldPromptAccountIds && !feishuOverride) {
      feishuAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "Feishu",
        currentId: feishuAccountId,
        listAccountIds: listFeishuAccountIds,
        defaultAccountId: defaultFeishuAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveFeishuAccount({
      cfg: next,
      accountId: feishuAccountId,
    });
    const accountConfigured = Boolean(
      resolvedAccount.appId?.trim() && resolvedAccount.appSecret?.trim(),
    );
    const allowEnv = feishuAccountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv =
      allowEnv &&
      Boolean(process.env.FEISHU_APP_ID?.trim()) &&
      Boolean(process.env.FEISHU_APP_SECRET?.trim());
    const hasConfigCredentials = Boolean(
      resolvedAccount.config.appId && resolvedAccount.config.appSecret,
    );

    let appId: string | null = null;
    let appSecret: string | null = null;

    if (!accountConfigured) {
      await noteFeishuSetupHelp(prompter);
    }

    if (canUseEnv && !hasConfigCredentials) {
      const keepEnv = await prompter.confirm({
        message: "检测到 FEISHU_APP_ID 环境变量，是否使用？",
        initialValue: true,
      });
      if (keepEnv) {
        const feishuConfig = getFeishuConfig(next) ?? {};
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...feishuConfig,
              enabled: true,
            },
          },
        };
      } else {
        appId = String(
          await prompter.text({
            message: "输入飞书 App ID",
            placeholder: "cli_xxxxxx",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "输入飞书 App Secret",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else if (hasConfigCredentials) {
      const keep = await prompter.confirm({
        message: "飞书凭据已配置，是否保留？",
        initialValue: true,
      });
      if (!keep) {
        appId = String(
          await prompter.text({
            message: "输入飞书 App ID",
            placeholder: "cli_xxxxxx",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "输入飞书 App Secret",
            validate: (value) => (value?.trim() ? undefined : "必填"),
          }),
        ).trim();
      }
    } else {
      appId = String(
        await prompter.text({
          message: "输入飞书 App ID",
          placeholder: "cli_xxxxxx",
          validate: (value) => (value?.trim() ? undefined : "必填"),
        }),
      ).trim();
      appSecret = String(
        await prompter.text({
          message: "输入飞书 App Secret",
          validate: (value) => (value?.trim() ? undefined : "必填"),
        }),
      ).trim();
    }

    if (appId && appSecret) {
      const feishuConfig = getFeishuConfig(next) ?? {};
      if (feishuAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...feishuConfig,
              enabled: true,
              appId,
              appSecret,
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...feishuConfig,
              enabled: true,
              accounts: {
                ...feishuConfig.accounts,
                [feishuAccountId]: {
                  ...feishuConfig.accounts?.[feishuAccountId],
                  enabled: feishuConfig.accounts?.[feishuAccountId]?.enabled ?? true,
                  appId,
                  appSecret,
                },
              },
            },
          },
        };
      }
    }

    if (forceAllowFrom) {
      next = await promptFeishuAllowFrom({
        cfg: next,
        prompter,
        accountId: feishuAccountId,
      });
    }

    return { cfg: next, accountId: feishuAccountId };
  },
  dmPolicy: feishuOnboardingDmPolicy,
  disable: (cfg: ClawdbotConfig) => {
    const feishuConfig = getFeishuConfig(cfg) ?? {};
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        feishu: { ...feishuConfig, enabled: false },
      },
    };
  },
};
