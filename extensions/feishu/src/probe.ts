import { probeFeishu as probeFeishuApi } from "./api.js";
import type { ResolvedFeishuAccount } from "./accounts.js";

export type FeishuProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: { appId: string; name?: string };
};

/**
 * Probe Feishu connection status
 */
export async function probeFeishu(
  account: ResolvedFeishuAccount,
  timeoutMs = 5000,
): Promise<FeishuProbe> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const result = await Promise.race([
      probeFeishuApi(account),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("timeout"));
        });
      }),
    ]);

    clearTimeout(timeout);

    return {
      ok: result.ok,
      status: result.ok ? 200 : null,
      error: result.error,
      elapsedMs: Date.now() - start,
      bot: result.bot,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: null,
      error: message,
      elapsedMs: Date.now() - start,
    };
  }
}
