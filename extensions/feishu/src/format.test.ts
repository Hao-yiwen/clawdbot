import { describe, it, expect } from "vitest";
import {
  needsRichText,
  markdownToFeishuPost,
  textToFeishuContent,
  chunkFeishuText,
  parseFeishuTextContent,
  parseFeishuPostContent,
} from "./format.js";

describe("needsRichText", () => {
  it("returns false for plain text", () => {
    expect(needsRichText("Hello world")).toBe(false);
    expect(needsRichText("Simple message")).toBe(false);
  });

  it("returns true for code blocks", () => {
    expect(needsRichText("```\ncode\n```")).toBe(true);
    expect(needsRichText("Use `inline code` here")).toBe(true);
  });

  it("returns true for links", () => {
    expect(needsRichText("[link](https://example.com)")).toBe(true);
  });

  it("returns true for bold/italic", () => {
    expect(needsRichText("**bold text**")).toBe(true);
    expect(needsRichText("*italic text*")).toBe(true);
    expect(needsRichText("__bold__")).toBe(true);
    expect(needsRichText("_italic_")).toBe(true);
  });

  it("returns true for lists", () => {
    expect(needsRichText("- item 1")).toBe(true);
    expect(needsRichText("* item 1")).toBe(true);
    expect(needsRichText("1. item 1")).toBe(true);
  });
});

describe("markdownToFeishuPost", () => {
  it("converts plain text", () => {
    const result = markdownToFeishuPost("Hello world");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual([{ tag: "text", text: "Hello world" }]);
  });

  it("converts code blocks", () => {
    const result = markdownToFeishuPost("```javascript\nconst x = 1;\n```");
    expect(result.content).toHaveLength(1);
    expect(result.content[0][0]).toMatchObject({
      tag: "code_block",
      language: "javascript",
      text: "const x = 1;",
    });
  });

  it("converts inline code", () => {
    const result = markdownToFeishuPost("Use `code` here");
    expect(result.content[0]).toContainEqual({
      tag: "text",
      text: "code",
      style: ["code"],
    });
  });

  it("converts links", () => {
    const result = markdownToFeishuPost("[link](https://example.com)");
    expect(result.content[0]).toContainEqual({
      tag: "a",
      text: "link",
      href: "https://example.com",
    });
  });

  it("converts bold text", () => {
    const result = markdownToFeishuPost("**bold**");
    expect(result.content[0]).toContainEqual({
      tag: "text",
      text: "bold",
      style: ["bold"],
    });
  });

  it("converts lists", () => {
    const result = markdownToFeishuPost("- item 1\n- item 2");
    expect(result.content).toHaveLength(2);
    expect(result.content[0][0]).toMatchObject({ tag: "text", text: "• " });
  });
});

describe("textToFeishuContent", () => {
  it("wraps text in JSON", () => {
    const result = textToFeishuContent("Hello");
    expect(result).toBe('{"text":"Hello"}');
  });

  it("handles special characters", () => {
    const result = textToFeishuContent('Hello "world"');
    expect(JSON.parse(result)).toEqual({ text: 'Hello "world"' });
  });
});

describe("chunkFeishuText", () => {
  it("returns single chunk for short text", () => {
    const result = chunkFeishuText("Hello", 100);
    expect(result).toEqual(["Hello"]);
  });

  it("splits at paragraph boundary", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const result = chunkFeishuText(text, 25);
    expect(result.length).toBeGreaterThan(1);
  });

  it("splits at newline if no paragraph break", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const result = chunkFeishuText(text, 10);
    expect(result.length).toBeGreaterThan(1);
  });

  it("splits at space as last resort", () => {
    const text = "Word1 Word2 Word3 Word4";
    const result = chunkFeishuText(text, 12);
    expect(result.length).toBeGreaterThan(1);
  });
});

describe("parseFeishuTextContent", () => {
  it("extracts text from JSON", () => {
    expect(parseFeishuTextContent('{"text":"Hello"}')).toBe("Hello");
  });

  it("returns original on invalid JSON", () => {
    expect(parseFeishuTextContent("not json")).toBe("not json");
  });
});

describe("parseFeishuPostContent", () => {
  it("extracts text from post content", () => {
    const content = JSON.stringify({
      zh_cn: {
        title: "Title",
        content: [[{ tag: "text", text: "Body text" }]],
      },
    });
    const result = parseFeishuPostContent(content);
    expect(result).toContain("Title");
    expect(result).toContain("Body text");
  });

  it("handles code blocks", () => {
    const content = JSON.stringify({
      zh_cn: {
        content: [[{ tag: "code_block", language: "js", text: "code" }]],
      },
    });
    const result = parseFeishuPostContent(content);
    expect(result).toContain("```js");
    expect(result).toContain("code");
  });

  it("handles @ mentions", () => {
    const content = JSON.stringify({
      zh_cn: {
        content: [[{ tag: "at", user_id: "123", user_name: "John" }]],
      },
    });
    const result = parseFeishuPostContent(content);
    expect(result).toContain("@John");
  });

  it("returns original on invalid JSON", () => {
    expect(parseFeishuPostContent("not json")).toBe("not json");
  });
});
