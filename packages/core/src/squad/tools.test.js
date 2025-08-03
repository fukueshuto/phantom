import { test, describe } from "node:test";
import assert from "node:assert";
import { AgentToolFactory, AgentToolError, createAgentToolFactory } from "./tools.ts";
import { TmuxManager, TmuxSessionError } from "./tmuxManager.ts";

// TmuxManagerのモック
class MockTmuxManager {
  constructor() {
    this.panes = [
      { id: "0", agentName: "manager", index: 0 },
      { id: "1", agentName: "researcher", index: 1 },
      { id: "2", agentName: "tester", index: 2 },
    ];
    this.sendKeysCallHistory = [];
  }

  getAllPanes() {
    return this.panes;
  }

  getPaneByAgentName(agentName) {
    return this.panes.find(pane => pane.agentName === agentName);
  }

  async sendKeys(paneId, message) {
    this.sendKeysCallHistory.push({ paneId, message });
    
    // 存在しないペインIDの場合はエラー
    if (!this.panes.find(pane => pane.id === paneId)) {
      return { ok: false, error: new TmuxSessionError(`Pane ${paneId} not found`) };
    }
    
    return { ok: true, value: { success: true } };
  }
}

describe("AgentToolFactory", () => {
  test("should initialize with TmuxManager", () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    assert.ok(toolFactory instanceof AgentToolFactory);
  });

  test("should return list of available agents", () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const agents = toolFactory.getAvailableAgents();
    assert.deepStrictEqual(agents, ["manager", "researcher", "tester"]);
  });

  test("should send message to valid agent", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.sendMessage("researcher", "Hello, researcher!");
    
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.targetAgent, "researcher");
    assert.strictEqual(result.value.message, "Hello, researcher!");
    assert.strictEqual(result.value.success, true);
    assert.ok(result.value.timestamp instanceof Date);
    
    // TmuxManagerのsendKeysが呼ばれたことを確認
    assert.strictEqual(mockTmuxManager.sendKeysCallHistory.length, 1);
    assert.strictEqual(mockTmuxManager.sendKeysCallHistory[0].paneId, "1");
    assert.strictEqual(mockTmuxManager.sendKeysCallHistory[0].message, "Hello, researcher!");
  });

  test("should return error for invalid agent name", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.sendMessage("nonexistent", "Hello!");
    
    assert.strictEqual(result.ok, false);
    assert.ok(result.error instanceof AgentToolError);
    assert.ok(result.error.message.includes("Agent \"nonexistent\" not found"));
  });

  test("should return error for empty agent name", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.sendMessage("", "Hello!");
    
    assert.strictEqual(result.ok, false);
    assert.ok(result.error instanceof AgentToolError);
    assert.strictEqual(result.error.message, "Agent name must be a non-empty string");
  });

  test("should return error for empty message", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.sendMessage("researcher", "");
    
    assert.strictEqual(result.ok, false);
    assert.ok(result.error instanceof AgentToolError);
    assert.strictEqual(result.error.message, "Message must be a non-empty string");
  });

  test("should escape special characters in message", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const messageWithSpecialChars = "Hello 'world'\\nNew line";
    const result = await toolFactory.sendMessage("researcher", messageWithSpecialChars);
    
    assert.strictEqual(result.ok, true);
    
    // エスケープされたメッセージがsendKeysに渡されることを確認
    const sentMessage = mockTmuxManager.sendKeysCallHistory[0].message;
    assert.ok(sentMessage.includes("'\"'\"'"));  // シングルクォートのエスケープ
    assert.ok(sentMessage.includes("\\n"));     // 改行文字のエスケープ
  });

  test("should return list of available tools", () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const tools = toolFactory.getAvailableTools();
    assert.deepStrictEqual(tools, ["send_message"]);
  });

  test("should execute send_message tool", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.executeTool("send_message", {
      agentName: "researcher",
      message: "Test message"
    });
    
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.toolName, "send_message");
    assert.deepStrictEqual(result.value.parameters, {
      agentName: "researcher",
      message: "Test message"
    });
    assert.strictEqual(result.value.result.targetAgent, "researcher");
    assert.ok(result.value.timestamp instanceof Date);
  });

  test("should return error for unknown tool", async () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const result = await toolFactory.executeTool("unknown_tool", {});
    
    assert.strictEqual(result.ok, false);
    assert.ok(result.error instanceof AgentToolError);
    assert.strictEqual(result.error.message, "Unknown tool: unknown_tool");
  });

  test("should return tool usage information", () => {
    const mockTmuxManager = new MockTmuxManager();
    const toolFactory = new AgentToolFactory(mockTmuxManager);
    const usage = toolFactory.getToolUsage();
    assert.ok(usage.includes("send_message"));
    assert.ok(usage.includes("manager, researcher, tester"));
  });
});

describe("createAgentToolFactory", () => {
  test("should create AgentToolFactory instance", () => {
    const mockTmuxManager = new MockTmuxManager();
    const factory = createAgentToolFactory(mockTmuxManager);
    assert.ok(factory instanceof AgentToolFactory);
  });
});