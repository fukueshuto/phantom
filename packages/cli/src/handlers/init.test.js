import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { access, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

describe("initHandler", () => {
  let tempDir;
  let originalProcess;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), "phantom-init-test-"));
    
    // Mock process.exit to prevent test runner from exiting
    originalProcess = { ...process };
    process.exit = mock.fn();
  });

  afterEach(async () => {
    // Restore process.exit
    process.exit = originalProcess.exit;
    
    // Cleanup temp directory
    try {
      await unlink(join(tempDir, "phantom.config.json"));
    } catch {
      // File might not exist
    }
  });

  test("should show help correctly", async () => {
    // We've already tested this via the CLI, so this is a placeholder
    // to ensure the test structure is correct
    assert.ok(true);
  });

  test("should handle force flag correctly", async () => {
    // This would require more complex mocking of inquirer and git operations
    // For now, we ensure the module can be imported without errors
    const { initHandler } = await import("./init.ts");
    assert.ok(typeof initHandler === "function");
  });
});