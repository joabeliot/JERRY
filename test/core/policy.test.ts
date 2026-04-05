import { describe, it, expect } from "vitest";
import { evaluate } from "../../src/core/policy.js";

describe("evaluate", () => {
  describe("read tools → allow", () => {
    const readTools = [
      "gmail_triage",
      "gmail_list",
      "gmail_get",
      "calendar_agenda",
      "linear_issues",
      "linear_my_issues",
      "linear_stale",
      "linear_projects",
      "github_prs",
      "github_commits",
      "github_status",
      "gchat_recent",
      "web_search",
      "web_fetch",
      "read_document",
      "list_documents",
    ];

    for (const tool of readTools) {
      it(`allows ${tool}`, () => {
        expect(evaluate(tool)).toBe("allow");
      });
    }
  });

  describe("write tools → confirm", () => {
    const writeTools = [
      "gmail_send",
      "gmail_reply",
      "calendar_create",
      "gchat_send",
      "save_document",
      "gdoc_create",
    ];

    for (const tool of writeTools) {
      it(`requires confirmation for ${tool}`, () => {
        expect(evaluate(tool)).toBe("confirm");
      });
    }
  });

  describe("unknown tools → deny", () => {
    it("denies an unknown tool", () => {
      expect(evaluate("exec_shell")).toBe("deny");
    });

    it("denies empty string", () => {
      expect(evaluate("")).toBe("deny");
    });

    it("denies a misspelled tool name", () => {
      expect(evaluate("gmail_sendd")).toBe("deny");
    });
  });
});
