import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it, mock, beforeEach, afterEach } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { err, isErr, isOk, ok } from "@aku11i/phantom-shared";
import {
  ClaudeSessionManager,
  ClaudeSessionError,
  ClaudeSessionSpawnError,
  ClaudeSessionFileError,
  ClaudeSessionParseError,
} from "./session.ts";

describe("ClaudeSessionManager", () => {
  let tempDir;
  let sessionManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "phantom-test-"));
    sessionManager = new ClaudeSessionManager({
      sessionDirectory: tempDir,
      timeout: 5000, // Shorter timeout for tests
    });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should create instance with default timeout", () => {
      const manager = new ClaudeSessionManager({
        sessionDirectory: "/tmp/test",
      });
      strictEqual(manager.config.timeout, 30000);
    });

    it("should create instance with custom timeout", () => {
      const manager = new ClaudeSessionManager({
        sessionDirectory: "/tmp/test",
        timeout: 15000,
      });
      strictEqual(manager.config.timeout, 15000);
    });
  });

  describe("buildCommandString", () => {
    it("should build command string without agent", () => {
      const result = sessionManager.buildCommandString("sess-abc123");
      strictEqual(result, "claude code --session sess-abc123");
    });

    it("should build command string with agent", () => {
      const result = sessionManager.buildCommandString(
        "sess-abc123",
        "test-agent",
      );
      strictEqual(
        result,
        "claude code --session sess-abc123 --agent test-agent",
      );
    });
  });

  describe("saveSession and loadExistingSession", () => {
    it("should save and load session successfully", async () => {
      const sessionName = "test-session";
      const sessionId = "sess-abc123";

      // Save session
      const saveResult = sessionManager.saveSession(sessionName, sessionId);
      strictEqual(isOk(saveResult), true);

      // Load session
      const loadResult = await sessionManager.loadExistingSession(sessionName);
      strictEqual(isOk(loadResult), true);
      strictEqual(loadResult.value, sessionId);
    });

    it("should return error when loading non-existent session", async () => {
      const loadResult =
        await sessionManager.loadExistingSession("non-existent");
      strictEqual(isErr(loadResult), true);
      strictEqual(loadResult.error instanceof ClaudeSessionFileError, true);
    });

    it("should return error for invalid session ID format", async () => {
      const sessionName = "invalid-session";

      // Manually write invalid session ID
      const fs = await import("node:fs/promises");
      const sessionFile = join(tempDir, `${sessionName}.session`);
      await fs.writeFile(sessionFile, "invalid-id", "utf-8");

      const loadResult = await sessionManager.loadExistingSession(sessionName);
      strictEqual(isErr(loadResult), true);
      strictEqual(loadResult.error instanceof ClaudeSessionParseError, true);
    });
  });

  describe("removeSession", () => {
    it("should remove existing session", async () => {
      const sessionName = "test-session";
      const sessionId = "sess-abc123";

      // Save session first
      sessionManager.saveSession(sessionName, sessionId);

      // Remove session
      const removeResult = await sessionManager.removeSession(sessionName);
      strictEqual(isOk(removeResult), true);

      // Verify it's gone
      const loadResult = await sessionManager.loadExistingSession(sessionName);
      strictEqual(isErr(loadResult), true);
    });

    it("should not error when removing non-existent session", async () => {
      const removeResult = await sessionManager.removeSession("non-existent");
      strictEqual(isOk(removeResult), true);
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions exist", async () => {
      const listResult = await sessionManager.listSessions();
      strictEqual(isOk(listResult), true);
      deepStrictEqual(listResult.value, []);
    });

    it("should list existing sessions", async () => {
      // Save multiple sessions
      sessionManager.saveSession("session1", "sess-abc123");
      sessionManager.saveSession("session2", "sess-def456");

      const listResult = await sessionManager.listSessions();
      strictEqual(isOk(listResult), true);
      deepStrictEqual(listResult.value.sort(), ["session1", "session2"]);
    });
  });

  describe("startOrResumeSession", () => {
    it("should resume existing session", async () => {
      const sessionName = "existing-session";
      const sessionId = "sess-existing123";

      // Save session first
      sessionManager.saveSession(sessionName, sessionId);

      const result = await sessionManager.startOrResumeSession(
        sessionName,
        "test-agent",
      );
      strictEqual(isOk(result), true);
      strictEqual(result.value.sessionId, sessionId);
      strictEqual(result.value.isNew, false);
      strictEqual(
        result.value.commandString,
        "claude code --session sess-existing123 --agent test-agent",
      );
    });

    // Note: Testing actual spawn is complex and would require mocking child_process
    // In a real test environment, you might want to mock the spawn function
    // For now, we test the logic around existing sessions
  });

  describe("Error classes", () => {
    it("should create ClaudeSessionError with message", () => {
      const error = new ClaudeSessionError("test message");
      strictEqual(error.message, "test message");
      strictEqual(error.name, "ClaudeSessionError");
    });

    it("should create ClaudeSessionSpawnError with formatted message", () => {
      const error = new ClaudeSessionSpawnError("spawn failed");
      strictEqual(
        error.message,
        "Failed to spawn claude code process: spawn failed",
      );
      strictEqual(error.name, "ClaudeSessionSpawnError");
    });

    it("should create ClaudeSessionFileError with formatted message", () => {
      const error = new ClaudeSessionFileError("file operation failed");
      strictEqual(
        error.message,
        "Session file operation failed: file operation failed",
      );
      strictEqual(error.name, "ClaudeSessionFileError");
    });

    it("should create ClaudeSessionParseError with formatted message", () => {
      const error = new ClaudeSessionParseError("parse failed");
      strictEqual(error.message, "Failed to parse session ID: parse failed");
      strictEqual(error.name, "ClaudeSessionParseError");
    });
  });
});
