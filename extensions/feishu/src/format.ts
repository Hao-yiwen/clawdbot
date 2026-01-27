import type { FeishuPostContent, FeishuPostMessage, FeishuPostTag } from "./types.js";

/**
 * Check if text contains markdown formatting that needs rich text
 */
export function needsRichText(text: string): boolean {
  // Check for code blocks
  if (/```[\s\S]*?```/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;

  // Check for links
  if (/\[([^\]]+)\]\(([^)]+)\)/.test(text)) return true;

  // Check for bold/italic
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/\*[^*]+\*/.test(text)) return true;
  if (/__[^_]+__/.test(text)) return true;
  if (/_[^_]+_/.test(text)) return true;

  // Check for lists
  if (/^[-*+]\s/m.test(text)) return true;
  if (/^\d+\.\s/m.test(text)) return true;

  return false;
}

/**
 * Parse a line into Feishu post tags
 */
function parseLineToTags(line: string): FeishuPostTag[] {
  const tags: FeishuPostTag[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Check for inline code
    const inlineCodeMatch = remaining.match(/^`([^`]+)`/);
    if (inlineCodeMatch) {
      tags.push({ tag: "text", text: inlineCodeMatch[1], style: ["code"] });
      remaining = remaining.slice(inlineCodeMatch[0].length);
      continue;
    }

    // Check for links [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tags.push({ tag: "a", text: linkMatch[1], href: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Check for bold **text** or __text__
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/);
    if (boldMatch) {
      tags.push({ tag: "text", text: boldMatch[1], style: ["bold"] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic *text* or _text_
    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      tags.push({ tag: "text", text: italicMatch[1], style: ["italic"] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Find next special character or take rest of line
    const nextSpecial = remaining.search(/[`\[*_]/);
    if (nextSpecial === -1) {
      // No more special characters
      if (remaining) {
        tags.push({ tag: "text", text: remaining });
      }
      break;
    } else if (nextSpecial === 0) {
      // Special char at start but not matched - treat as text
      tags.push({ tag: "text", text: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      // Add text before special character
      tags.push({ tag: "text", text: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return tags;
}

/**
 * Convert markdown to Feishu post content
 */
export function markdownToFeishuPost(markdown: string): FeishuPostContent {
  const lines = markdown.split("\n");
  const content: FeishuPostTag[][] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for code block
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || undefined;
      const codeLines: string[] = [];

      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```

      content.push([
        {
          tag: "code_block",
          language,
          text: codeLines.join("\n"),
        },
      ]);
      continue;
    }

    // Check for list items
    const listMatch = line.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const prefix = listMatch[1].endsWith(".") ? `${listMatch[1]} ` : "• ";
      const text = listMatch[2];
      content.push([
        { tag: "text", text: prefix },
        ...parseLineToTags(text),
      ]);
      i++;
      continue;
    }

    // Regular line
    if (line.trim()) {
      content.push(parseLineToTags(line));
    } else if (content.length > 0) {
      // Empty line - add empty paragraph
      content.push([{ tag: "text", text: "" }]);
    }
    i++;
  }

  return { content };
}

/**
 * Convert markdown to Feishu post message (with locale)
 */
export function markdownToFeishuPostMessage(markdown: string): FeishuPostMessage {
  const post = markdownToFeishuPost(markdown);
  return { zh_cn: post };
}

/**
 * Convert text to simple Feishu text content
 */
export function textToFeishuContent(text: string): string {
  return JSON.stringify({ text });
}

/**
 * Convert markdown to Feishu post content JSON
 */
export function markdownToFeishuPostContent(markdown: string): string {
  const post = markdownToFeishuPostMessage(markdown);
  return JSON.stringify(post);
}

/**
 * Chunk text respecting markdown structure
 */
export function chunkFeishuText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point
    let breakPoint = maxLength;

    // Try to break at paragraph
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxLength);
    if (paragraphBreak > maxLength * 0.5) {
      breakPoint = paragraphBreak;
    } else {
      // Try to break at newline
      const newlineBreak = remaining.lastIndexOf("\n", maxLength);
      if (newlineBreak > maxLength * 0.5) {
        breakPoint = newlineBreak;
      } else {
        // Try to break at space
        const spaceBreak = remaining.lastIndexOf(" ", maxLength);
        if (spaceBreak > maxLength * 0.5) {
          breakPoint = spaceBreak;
        }
      }
    }

    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}

/**
 * Parse Feishu text content to plain text
 */
export function parseFeishuTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? "";
  } catch {
    return content;
  }
}

/**
 * Parse Feishu post content to plain text
 */
export function parseFeishuPostContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as FeishuPostMessage;
    const post = parsed.zh_cn ?? parsed.en_us;
    if (!post) return "";

    const lines: string[] = [];

    if (post.title) {
      lines.push(post.title);
      lines.push("");
    }

    for (const paragraph of post.content) {
      let line = "";
      for (const tag of paragraph) {
        if (tag.tag === "text") {
          line += tag.text;
        } else if (tag.tag === "a") {
          line += tag.text;
        } else if (tag.tag === "at") {
          line += `@${tag.user_name ?? tag.user_id}`;
        } else if (tag.tag === "code_block") {
          line += `\n\`\`\`${tag.language ?? ""}\n${tag.text}\n\`\`\`\n`;
        }
      }
      lines.push(line);
    }

    return lines.join("\n").trim();
  } catch {
    return content;
  }
}
