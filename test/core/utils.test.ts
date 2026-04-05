import { describe, it, expect } from "vitest";
import { extractQuotedArg } from "../../src/core/utils.js";

describe("extractQuotedArg", () => {
  it("extracts a quoted value by key", () => {
    const result = extractQuotedArg('to="foo@bar.com" subject="hi"', "to");
    expect(result).toBe("foo@bar.com");
  });

  it("extracts the second key from a multi-arg string", () => {
    const result = extractQuotedArg('to="foo@bar.com" subject="hi there"', "subject");
    expect(result).toBe("hi there");
  });

  it("returns undefined for a missing key", () => {
    const result = extractQuotedArg('to="foo@bar.com"', "subject");
    expect(result).toBeUndefined();
  });

  it("matches case-insensitively", () => {
    const result = extractQuotedArg('TO="foo@bar.com"', "to");
    expect(result).toBe("foo@bar.com");
  });

  it("handles empty quoted value", () => {
    const result = extractQuotedArg('key=""', "key");
    expect(result).toBe("");
  });

  it("returns undefined for empty input string", () => {
    const result = extractQuotedArg("", "key");
    expect(result).toBeUndefined();
  });

  it("extracts value when surrounded by other content", () => {
    const result = extractQuotedArg('prefix to="addr" body="hello world"', "body");
    expect(result).toBe("hello world");
  });

  it("handles escaped quotes inside value", () => {
    const result = extractQuotedArg('body="say \\"hello\\" to me"', "body");
    expect(result).toBe('say "hello" to me');
  });

  it("extracts triple-quoted block content", () => {
    const result = extractQuotedArg('content="""<html>\n<body>Hello</body>\n</html>"""', "content");
    expect(result).toBe("<html>\n<body>Hello</body>\n</html>");
  });

  it("triple-quote handles content with double quotes inside", () => {
    const result = extractQuotedArg('content="""<div class="header">Hi</div>"""', "content");
    expect(result).toBe('<div class="header">Hi</div>');
  });
});
