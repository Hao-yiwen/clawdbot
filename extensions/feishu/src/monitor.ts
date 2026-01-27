import type { IncomingMessage, ServerResponse } from "node:http";
import type { ClawdbotConfig } from "clawdbot/plugin-sdk";

import {
  type FeishuEncryptedEvent,
  type FeishuEvent,
  type FeishuMessageEvent,
  type FeishuUrlVerificationEvent,
} from "./types.js";
import { decryptEvent, verifyEventSignature, verifyToken } from "./auth.js";
import {
  listEnabledFeishuAccounts,
  resolveFeishuAccount,
  type ResolvedFeishuAccount,
} from "./accounts.js";
import { getFeishuRuntime, getFeishuRuntimeOrNull } from "./runtime.js";
import { getFeishuMonitorProvider } from "./monitor/provider.js";

export type FeishuWebhookTarget = {
  account: ResolvedFeishuAccount;
  cfg: ClawdbotConfig;
};

export type FeishuLegacyMessageHandler = (
  event: FeishuMessageEvent,
  target: FeishuWebhookTarget,
) => Promise<void>;

// Legacy message handlers (deprecated, use monitor provider instead)
const legacyMessageHandlers: FeishuLegacyMessageHandler[] = [];

/**
 * Register a legacy message handler (deprecated)
 * @deprecated Use monitor provider instead
 */
export function registerFeishuMessageHandler(handler: FeishuLegacyMessageHandler) {
  legacyMessageHandlers.push(handler);
}

/**
 * Clear all legacy message handlers
 * @deprecated Use monitor provider instead
 */
export function clearFeishuMessageHandlers() {
  legacyMessageHandlers.length = 0;
}

/**
 * Read request body as string
 */
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * Find matching account for webhook path
 */
function findAccountForPath(
  cfg: ClawdbotConfig,
  path: string,
): ResolvedFeishuAccount | null {
  const accounts = listEnabledFeishuAccounts(cfg);

  for (const account of accounts) {
    if (path === account.webhookPath || path.startsWith(`${account.webhookPath}/`)) {
      return account;
    }
  }

  // Default account fallback
  if (accounts.length === 1) {
    return accounts[0];
  }

  return null;
}

/**
 * Parse and validate event payload
 */
function parseEventPayload(
  body: string,
  account: ResolvedFeishuAccount,
  headers: IncomingMessage["headers"],
): unknown {
  const payload = JSON.parse(body);

  // Check for encrypted event
  if ("encrypt" in payload && account.encryptKey) {
    const encrypted = payload as FeishuEncryptedEvent;

    // Verify signature if present
    const timestamp = headers["x-lark-request-timestamp"] as string | undefined;
    const nonce = headers["x-lark-request-nonce"] as string | undefined;
    const signature = headers["x-lark-signature"] as string | undefined;

    if (timestamp && nonce && signature) {
      const valid = verifyEventSignature({
        timestamp,
        nonce,
        encryptKey: account.encryptKey,
        body,
        signature,
      });

      if (!valid) {
        throw new Error("Invalid event signature");
      }
    }

    // Decrypt the event
    return decryptEvent({
      encrypt: encrypted.encrypt,
      encryptKey: account.encryptKey,
    });
  }

  return payload;
}

/**
 * Handle URL verification challenge
 */
function handleUrlVerification(
  payload: FeishuUrlVerificationEvent,
  account: ResolvedFeishuAccount,
  res: ServerResponse,
): boolean {
  // Verify token if configured
  if (account.verificationToken) {
    if (!verifyToken(payload.token, account.verificationToken)) {
      sendJson(res, 403, { error: "Invalid verification token" });
      return true;
    }
  }

  // Return challenge
  sendJson(res, 200, { challenge: payload.challenge });
  return true;
}

/**
 * Process event using monitor provider
 */
async function handleEventWithProvider(
  event: FeishuEvent,
  target: FeishuWebhookTarget,
) {
  const runtime = getFeishuRuntimeOrNull();
  if (!runtime) return;

  try {
    const provider = await getFeishuMonitorProvider({
      cfg: target.cfg,
      runtime,
      accountId: target.account.accountId,
    });
    await provider.handleEvent(event);
  } catch (err) {
    runtime.error?.(`Feishu monitor provider error: ${String(err)}`);
  }

  // Also call legacy handlers for backward compatibility
  if (
    "header" in event &&
    event.header?.event_type === "im.message.receive_v1"
  ) {
    const messageEvent = event as FeishuMessageEvent;
    for (const handler of legacyMessageHandlers) {
      try {
        await handler(messageEvent, target);
      } catch (err) {
        runtime.log?.(`Feishu legacy message handler error: ${String(err)}`);
      }
    }
  }
}

/**
 * Main webhook request handler
 */
export async function handleFeishuWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // Only handle POST requests
  if (req.method !== "POST") {
    return false;
  }

  const runtime = getFeishuRuntimeOrNull();
  const cfg = runtime?.config;
  if (!cfg) {
    return false;
  }

  // Parse URL path
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // Find matching account
  const account = findAccountForPath(cfg, path);
  if (!account) {
    return false;
  }

  try {
    // Read and parse body
    const body = await readBody(req);
    const payload = parseEventPayload(body, account, req.headers);

    // Handle URL verification
    if (
      payload &&
      typeof payload === "object" &&
      "type" in payload &&
      (payload as { type: string }).type === "url_verification"
    ) {
      return handleUrlVerification(
        payload as FeishuUrlVerificationEvent,
        account,
        res,
      );
    }

    // Acknowledge receipt immediately (async processing)
    sendJson(res, 200, { ok: true });

    // Process event using monitor provider
    if (
      payload &&
      typeof payload === "object" &&
      "header" in payload &&
      "event" in payload
    ) {
      await handleEventWithProvider(payload as FeishuEvent, {
        account,
        cfg,
      });
    }

    return true;
  } catch (err) {
    runtime?.log?.(`Feishu webhook error: ${String(err)}`);
    sendJson(res, 500, { error: "Internal server error" });
    return true;
  }
}

/**
 * Create a webhook path matcher
 */
export function matchFeishuWebhookPath(path: string, cfg: ClawdbotConfig): boolean {
  const accounts = listEnabledFeishuAccounts(cfg);

  for (const account of accounts) {
    if (path === account.webhookPath || path.startsWith(`${account.webhookPath}/`)) {
      return true;
    }
  }

  return false;
}
