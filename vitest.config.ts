// ABOUTME: Vitest configuration for the test suite.
// ABOUTME: Configures test environment to run in Node.js context.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
