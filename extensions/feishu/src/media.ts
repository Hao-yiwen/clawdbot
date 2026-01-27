import {
  FEISHU_API_BASE,
  type FeishuApiResponse,
} from "./types.js";
import { getTenantAccessToken } from "./auth.js";
import type { ResolvedFeishuAccount } from "./accounts.js";

/**
 * Upload an image to Feishu
 */
export async function uploadFeishuImage(params: {
  account: ResolvedFeishuAccount;
  buffer: Buffer;
  imageType?: "message" | "avatar";
}): Promise<{ imageKey: string }> {
  const { account, buffer, imageType = "message" } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const formData = new FormData();
  formData.append("image_type", imageType);
  formData.append("image", new Blob([buffer]), "image.png");

  const response = await fetch(`${FEISHU_API_BASE}/im/v1/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeishuApiResponse<{ image_key: string }>;

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
  }

  return { imageKey: data.data?.image_key ?? "" };
}

/**
 * Upload a file to Feishu
 */
export async function uploadFeishuFile(params: {
  account: ResolvedFeishuAccount;
  buffer: Buffer;
  filename: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
}): Promise<{ fileKey: string }> {
  const { account, buffer, filename, fileType } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const formData = new FormData();
  formData.append("file_type", fileType);
  formData.append("file_name", filename);
  formData.append("file", new Blob([buffer]), filename);

  const response = await fetch(`${FEISHU_API_BASE}/im/v1/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeishuApiResponse<{ file_key: string }>;

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
  }

  return { fileKey: data.data?.file_key ?? "" };
}

/**
 * Download an image from Feishu
 */
export async function downloadFeishuImage(params: {
  account: ResolvedFeishuAccount;
  imageKey: string;
  maxBytes?: number;
}): Promise<{
  buffer: Buffer;
  contentType?: string;
}> {
  const { account, imageKey, maxBytes } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const response = await fetch(`${FEISHU_API_BASE}/im/v1/images/${imageKey}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? undefined;
  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  if (maxBytes && buffer.length > maxBytes) {
    buffer = buffer.subarray(0, maxBytes);
  }

  return { buffer, contentType };
}

/**
 * Download a file from a message
 */
export async function downloadFeishuFile(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  fileKey: string;
  type: "file" | "image";
  maxBytes?: number;
}): Promise<{
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}> {
  const { account, messageId, fileKey, type, maxBytes } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages/${messageId}/resources/${fileKey}?type=${type}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? undefined;
  const contentDisposition = response.headers.get("content-disposition");
  let filename: string | undefined;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match) {
      filename = match[1].replace(/['"]/g, "");
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  if (maxBytes && buffer.length > maxBytes) {
    buffer = buffer.subarray(0, maxBytes);
  }

  return { buffer, contentType, filename };
}

export type FeishuMediaInfo = {
  type: "image" | "file" | "audio" | "video";
  key: string;
  name?: string;
  size?: number;
  mimeType?: string;
};

/**
 * Extract media info from message content
 */
export function extractFeishuMediaInfo(params: {
  messageType: string;
  content: string;
}): FeishuMediaInfo | null {
  const { messageType, content } = params;

  try {
    const parsed = JSON.parse(content);

    switch (messageType) {
      case "image": {
        const imageKey = parsed.image_key;
        if (imageKey) {
          return {
            type: "image",
            key: imageKey,
          };
        }
        break;
      }

      case "file": {
        const fileKey = parsed.file_key;
        if (fileKey) {
          return {
            type: "file",
            key: fileKey,
            name: parsed.file_name,
          };
        }
        break;
      }

      case "audio": {
        const fileKey = parsed.file_key;
        if (fileKey) {
          return {
            type: "audio",
            key: fileKey,
          };
        }
        break;
      }

      case "video": {
        const fileKey = parsed.file_key;
        if (fileKey) {
          return {
            type: "video",
            key: fileKey,
            name: parsed.file_name,
          };
        }
        break;
      }
    }
  } catch {
    // Invalid JSON
  }

  return null;
}

/**
 * Resolve media from a Feishu message
 */
export async function resolveFeishuMedia(params: {
  account: ResolvedFeishuAccount;
  messageId: string;
  messageType: string;
  content: string;
  maxBytes: number;
}): Promise<{
  path?: string;
  contentType?: string;
  placeholder?: string;
} | null> {
  const { account, messageId, messageType, content, maxBytes } = params;

  const mediaInfo = extractFeishuMediaInfo({ messageType, content });
  if (!mediaInfo) return null;

  try {
    if (mediaInfo.type === "image") {
      const result = await downloadFeishuFile({
        account,
        messageId,
        fileKey: mediaInfo.key,
        type: "image",
        maxBytes,
      });

      // In a real implementation, you'd save this to a temp file
      // and return the path. For now, return a placeholder.
      return {
        contentType: result.contentType,
        placeholder: `[Feishu Image: ${mediaInfo.key}]`,
      };
    }

    if (mediaInfo.type === "file" || mediaInfo.type === "audio" || mediaInfo.type === "video") {
      const result = await downloadFeishuFile({
        account,
        messageId,
        fileKey: mediaInfo.key,
        type: "file",
        maxBytes,
      });

      return {
        contentType: result.contentType,
        placeholder: `[Feishu File: ${result.filename ?? mediaInfo.name ?? mediaInfo.key}]`,
      };
    }
  } catch (err) {
    // Log error but don't fail
    return {
      placeholder: `[Feishu ${mediaInfo.type}: failed to download]`,
    };
  }

  return null;
}

/**
 * Create image message content
 */
export function createFeishuImageContent(imageKey: string): string {
  return JSON.stringify({ image_key: imageKey });
}

/**
 * Create file message content
 */
export function createFeishuFileContent(fileKey: string): string {
  return JSON.stringify({ file_key: fileKey });
}

/**
 * Send an image message
 */
export async function sendFeishuImageMessage(params: {
  account: ResolvedFeishuAccount;
  receiveId: string;
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  imageKey: string;
}): Promise<{ messageId: string }> {
  const { account, receiveId, receiveIdType, imageKey } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: "image",
        content: createFeishuImageContent(imageKey),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeishuApiResponse<{ message_id: string }>;

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
  }

  return { messageId: data.data?.message_id ?? "" };
}

/**
 * Send a file message
 */
export async function sendFeishuFileMessage(params: {
  account: ResolvedFeishuAccount;
  receiveId: string;
  receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id";
  fileKey: string;
}): Promise<{ messageId: string }> {
  const { account, receiveId, receiveIdType, fileKey } = params;

  const token = await getTenantAccessToken({
    appId: account.appId,
    appSecret: account.appSecret,
  });

  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: "file",
        content: createFeishuFileContent(fileKey),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Feishu API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FeishuApiResponse<{ message_id: string }>;

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} ${data.msg}`);
  }

  return { messageId: data.data?.message_id ?? "" };
}
