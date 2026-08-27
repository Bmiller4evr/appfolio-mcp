// ABOUTME: Vitest configuration for the test suite.
// ABOUTME: Configures test environment to run in Node.js context.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // A stray worktree under .claude/worktrees/ (created by an unrelated agent session) has its
    // own copy of this whole test suite. Vitest's default excludes don't cover .claude/, so
    // without this a worktree left on disk silently doubles the reported test count with a
    // stale copy of every file.
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
});
