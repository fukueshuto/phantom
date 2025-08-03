import { describe, it, before } from "node:test";
import assert from "node:assert";
import { TmuxManager } from "./tmuxManager.ts";

describe("TmuxManager", () => {
  let tmuxManager;

  before(() => {
    tmuxManager = new TmuxManager("test-session");
  });

  it("should create TmuxManager instance with default session name", () => {
    const manager = new TmuxManager();
    assert.strictEqual(manager.getSessionName(), "phantom-squad");
  });

  it("should create TmuxManager instance with custom session name", () => {
    const manager = new TmuxManager("custom-session");
    assert.strictEqual(manager.getSessionName(), "custom-session");
  });

  it("should initialize with empty pane mapping", () => {
    const panes = tmuxManager.getAllPanes();
    assert.strictEqual(panes.length, 0);
  });

  it("should return undefined for non-existent agent", () => {
    const pane = tmuxManager.getPaneByAgentName("non-existent");
    assert.strictEqual(pane, undefined);
  });

  it("should check tmux environment", async () => {
    const result = await tmuxManager.checkTmuxEnvironment();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(typeof result.value, "boolean");
  });
});