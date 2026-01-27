import { describe, it, expect } from "vitest";
import { verifyToken, verifyEventSignature } from "./auth.js";

describe("verifyToken", () => {
  it("returns true for matching tokens", () => {
    expect(verifyToken("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching tokens", () => {
    expect(verifyToken("abc123", "xyz789")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(verifyToken("", "")).toBe(true);
    expect(verifyToken("abc", "")).toBe(false);
    expect(verifyToken("", "abc")).toBe(false);
  });
});

describe("verifyEventSignature", () => {
  // Note: These tests use known values. In real usage, you'd verify against
  // actual Feishu signatures.

  it("returns false for empty signature", () => {
    expect(
      verifyEventSignature({
        timestamp: "1234567890",
        nonce: "abc",
        encryptKey: "key",
        body: "body",
        signature: "",
      }),
    ).toBe(false);
  });

  it("returns false for wrong signature", () => {
    expect(
      verifyEventSignature({
        timestamp: "1234567890",
        nonce: "abc",
        encryptKey: "key",
        body: "body",
        signature: "wrong_signature",
      }),
    ).toBe(false);
  });

  // This test verifies the signature algorithm is working correctly
  // The expected signature is SHA256(timestamp + nonce + encryptKey + body)
  it("verifies signature correctly", () => {
    // To get the correct signature:
    // echo -n "1234567890abckeytest body" | sha256sum
    const params = {
      timestamp: "1234567890",
      nonce: "abc",
      encryptKey: "key",
      body: "test body",
      signature: "", // Will be calculated
    };

    // Calculate expected signature
    const crypto = require("node:crypto");
    const str = params.timestamp + params.nonce + params.encryptKey + params.body;
    const expectedSignature = crypto.createHash("sha256").update(str).digest("hex");

    expect(
      verifyEventSignature({
        ...params,
        signature: expectedSignature,
      }),
    ).toBe(true);
  });
});
