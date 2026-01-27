import { describe, it, expect } from "vitest";
import {
  resolveFeishuThreadContext,
  buildFeishuReplyParams,
} from "./threading.js";
import type { FeishuMessage } from "./types.js";

describe("resolveFeishuThreadContext", () => {
  it("returns non-thread context for top-level message", () => {
    const message: FeishuMessage = {
      message_id: "om_msg1",
      create_time: "1234567890",
      chat_id: "oc_chat1",
      chat_type: "group",
      message_type: "text",
      content: '{"text":"Hello"}',
    };

    const result = resolveFeishuThreadContext({ message });

    expect(result.isThreadReply).toBe(false);
    expect(result.rootId).toBeUndefined();
    expect(result.parentId).toBeUndefined();
    expect(result.replyToId).toBeUndefined();
    expect(result.messageThreadId).toBe("om_msg1");
  });

  it("returns thread context for reply message", () => {
    const message: FeishuMessage = {
      message_id: "om_msg2",
      root_id: "om_root",
      parent_id: "om_parent",
      create_time: "1234567890",
      chat_id: "oc_chat1",
      chat_type: "group",
      message_type: "text",
      content: '{"text":"Reply"}',
    };

    const result = resolveFeishuThreadContext({ message });

    expect(result.isThreadReply).toBe(true);
    expect(result.rootId).toBe("om_root");
    expect(result.parentId).toBe("om_parent");
    expect(result.replyToId).toBe("om_parent");
    expect(result.messageThreadId).toBe("om_root");
  });

  it("uses root_id as replyToId when parent_id is missing", () => {
    const message: FeishuMessage = {
      message_id: "om_msg3",
      root_id: "om_root",
      create_time: "1234567890",
      chat_id: "oc_chat1",
      chat_type: "group",
      message_type: "text",
      content: '{"text":"Reply to root"}',
    };

    const result = resolveFeishuThreadContext({ message });

    expect(result.isThreadReply).toBe(true);
    expect(result.replyToId).toBe("om_root");
  });
});

describe("buildFeishuReplyParams", () => {
  it("returns replyToId for thread reply", () => {
    const threadContext = {
      rootId: "om_root",
      parentId: "om_parent",
      isThreadReply: true,
      replyToId: "om_parent",
      messageThreadId: "om_root",
    };

    const result = buildFeishuReplyParams({ threadContext });

    expect(result.replyToId).toBe("om_parent");
  });

  it("returns messageId for new message", () => {
    const threadContext = {
      isThreadReply: false,
      messageThreadId: "om_msg1",
    };

    const result = buildFeishuReplyParams({
      threadContext,
      messageId: "om_msg1",
    });

    expect(result.replyToId).toBe("om_msg1");
  });

  it("returns empty object when no thread context", () => {
    const threadContext = {
      isThreadReply: false,
    };

    const result = buildFeishuReplyParams({ threadContext });

    expect(result.replyToId).toBeUndefined();
  });
});
