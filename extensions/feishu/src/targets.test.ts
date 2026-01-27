import { describe, it, expect } from "vitest";
import {
  parseFeishuTarget,
  formatFeishuTarget,
  looksLikeFeishuId,
  normalizeFeishuTarget,
} from "./targets.js";

describe("parseFeishuTarget", () => {
  it("returns null for empty string", () => {
    expect(parseFeishuTarget("")).toBeNull();
    expect(parseFeishuTarget("  ")).toBeNull();
  });

  it("parses user open_id", () => {
    const result = parseFeishuTarget("ou_abc123");
    expect(result).toEqual({
      kind: "user",
      id: "ou_abc123",
      idType: "open_id",
    });
  });

  it("parses chat_id", () => {
    const result = parseFeishuTarget("oc_abc123");
    expect(result).toEqual({
      kind: "chat",
      id: "oc_abc123",
      idType: "chat_id",
    });
  });

  it("parses union_id", () => {
    const result = parseFeishuTarget("on_abc123");
    expect(result).toEqual({
      kind: "user",
      id: "on_abc123",
      idType: "union_id",
    });
  });

  it("parses feishu: prefix", () => {
    expect(parseFeishuTarget("feishu:ou_abc123")).toEqual({
      kind: "user",
      id: "ou_abc123",
      idType: "open_id",
    });
  });

  it("parses feishu:user: prefix", () => {
    expect(parseFeishuTarget("feishu:user:ou_abc123")).toEqual({
      kind: "user",
      id: "ou_abc123",
      idType: "open_id",
    });
  });

  it("parses feishu:chat: prefix", () => {
    expect(parseFeishuTarget("feishu:chat:oc_abc123")).toEqual({
      kind: "chat",
      id: "oc_abc123",
      idType: "chat_id",
    });
  });

  it("parses feishu:group: prefix", () => {
    expect(parseFeishuTarget("feishu:group:oc_abc123")).toEqual({
      kind: "chat",
      id: "oc_abc123",
      idType: "chat_id",
    });
  });

  it("assumes user for unknown format", () => {
    const result = parseFeishuTarget("unknown_id");
    expect(result).toEqual({
      kind: "user",
      id: "unknown_id",
    });
  });
});

describe("formatFeishuTarget", () => {
  it("formats user target", () => {
    expect(formatFeishuTarget({ kind: "user", id: "ou_123" })).toBe(
      "feishu:user:ou_123",
    );
  });

  it("formats chat target", () => {
    expect(formatFeishuTarget({ kind: "chat", id: "oc_123" })).toBe(
      "feishu:chat:oc_123",
    );
  });
});

describe("looksLikeFeishuId", () => {
  it("returns false for empty string", () => {
    expect(looksLikeFeishuId("")).toBe(false);
    expect(looksLikeFeishuId("  ")).toBe(false);
  });

  it("returns true for feishu: prefix", () => {
    expect(looksLikeFeishuId("feishu:abc")).toBe(true);
    expect(looksLikeFeishuId("FEISHU:abc")).toBe(true);
  });

  it("returns true for open_id", () => {
    expect(looksLikeFeishuId("ou_abc123")).toBe(true);
  });

  it("returns true for chat_id", () => {
    expect(looksLikeFeishuId("oc_abc123")).toBe(true);
  });

  it("returns true for union_id", () => {
    expect(looksLikeFeishuId("on_abc123")).toBe(true);
  });

  it("returns false for other formats", () => {
    expect(looksLikeFeishuId("user123")).toBe(false);
    expect(looksLikeFeishuId("abc@example.com")).toBe(false);
  });
});

describe("normalizeFeishuTarget", () => {
  it("returns null for invalid target", () => {
    expect(normalizeFeishuTarget("")).toBeNull();
  });

  it("extracts id from full target", () => {
    expect(normalizeFeishuTarget("feishu:user:ou_123")).toBe("ou_123");
    expect(normalizeFeishuTarget("feishu:chat:oc_123")).toBe("oc_123");
  });

  it("returns id for bare id", () => {
    expect(normalizeFeishuTarget("ou_123")).toBe("ou_123");
    expect(normalizeFeishuTarget("oc_123")).toBe("oc_123");
  });
});
