import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineDetector, DETECTOR_API_VERSION } from "../../src/sdk.js";

export const todoCommentsDetector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "todo-comments",
  async scan({ root }) {
    const path = resolve(root, "TODO.md");
    let contents: string;
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    return contents.split(/\r?\n/).flatMap((line, index) =>
      line.includes("DEPRECATED")
        ? [
            {
              id: `todo-comments:deprecated:${index + 1}`,
              ruleId: "todo-comments.deprecated",
              title: "Deprecated TODO entry",
              summary: line.trim(),
              severity: "low" as const,
              location: { path: "TODO.md", line: index + 1 },
              sources: [
                {
                  title: "Repository TODO policy",
                  url: "https://example.com/todo-policy",
                },
              ],
            },
          ]
        : [],
    );
  },
});
