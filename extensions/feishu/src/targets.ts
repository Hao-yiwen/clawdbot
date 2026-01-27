export type FeishuTargetKind = "user" | "chat";

export type FeishuTarget = {
  kind: FeishuTargetKind;
  id: string;
  idType?: "open_id" | "user_id" | "union_id" | "chat_id";
};

/**
 * Parse a Feishu target string
 *
 * Supported formats:
 * - feishu:ou_xxx (user by open_id)
 * - feishu:user:ou_xxx (user by open_id)
 * - feishu:chat:oc_xxx (chat by chat_id)
 * - feishu:group:oc_xxx (chat by chat_id, alias)
 * - ou_xxx (user open_id)
 * - oc_xxx (chat_id)
 */
export function parseFeishuTarget(raw: string): FeishuTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Remove feishu: prefix
  let remaining = trimmed.replace(/^feishu:/i, "");

  // Check for type prefix
  if (remaining.startsWith("user:")) {
    const id = remaining.slice(5).trim();
    if (!id) return null;
    return { kind: "user", id, idType: inferIdType(id) };
  }

  if (remaining.startsWith("chat:") || remaining.startsWith("group:")) {
    const id = remaining.slice(remaining.indexOf(":") + 1).trim();
    if (!id) return null;
    return { kind: "chat", id, idType: "chat_id" };
  }

  // Infer from ID format
  if (remaining.startsWith("oc_")) {
    return { kind: "chat", id: remaining, idType: "chat_id" };
  }

  if (remaining.startsWith("ou_")) {
    return { kind: "user", id: remaining, idType: "open_id" };
  }

  if (remaining.startsWith("on_")) {
    return { kind: "user", id: remaining, idType: "union_id" };
  }

  // Assume user ID if unknown format
  return { kind: "user", id: remaining };
}

/**
 * Infer ID type from ID format
 */
function inferIdType(id: string): "open_id" | "user_id" | "union_id" | undefined {
  if (id.startsWith("ou_")) return "open_id";
  if (id.startsWith("on_")) return "union_id";
  return undefined;
}

/**
 * Format a Feishu target to string
 */
export function formatFeishuTarget(target: FeishuTarget): string {
  return `feishu:${target.kind}:${target.id}`;
}

/**
 * Check if a string looks like a Feishu ID
 */
export function looksLikeFeishuId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;

  // Check for feishu: prefix
  if (trimmed.toLowerCase().startsWith("feishu:")) return true;

  // Check for known ID prefixes
  if (trimmed.startsWith("ou_")) return true; // open_id
  if (trimmed.startsWith("oc_")) return true; // chat_id
  if (trimmed.startsWith("on_")) return true; // union_id

  return false;
}

/**
 * Normalize a Feishu target (remove prefix variations)
 */
export function normalizeFeishuTarget(target: string): string | null {
  const parsed = parseFeishuTarget(target);
  if (!parsed) return null;
  return parsed.id;
}
