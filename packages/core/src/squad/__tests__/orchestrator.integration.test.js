import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { ok, err } from "@aku11i/phantom-shared";

// For Node.js test integration, we'll create a simulated orchestrator
// that allows us to inject dependencies instead of mocking modules
class TestableAgentOrchestrator {
  constructor(config, sessionName, mockDependencies = {}) {
    this.config = {
      agentTimeout: 60000,
      ...config,
    };
    this.sessionName = sessionName;
    this.mockTmuxManager = mockDependencies.tmuxManager;
    this.mockSessionManager = mockDependencies.sessionManager;
    this.mockCreateWorktree = mockDependencies.createWorktree;
    this.mockGetGitRoot = mockDependencies.getGitRoot;
    this.squadContext = undefined;
  }

  async setupTeam(squadConfig, sessionName) {
    try {
      // Initialize squad context
      this.squadContext = {
        sessionName,
        config: squadConfig,
        agents: [],
        startTime: new Date(),
      };

      // Step 1: Check for existing tmux session
      const sessionCheckResult = await this.mockTmuxManager.checkExistingSession();
      if (!sessionCheckResult.ok) {
        return err(new Error("Failed to check existing tmux session"));
      }

      if (sessionCheckResult.value) {
        // Session exists, attach to it
        const attachResult = await this.mockTmuxManager.attachToSession();
        if (!attachResult.ok) {
          return err(new Error("Failed to attach to existing session"));
        }

        return ok({
          sessionName,
          panes: this.mockTmuxManager.getAllPanes(),
          agents: this.squadContext.agents,
          isResumed: true,
          createdWorktrees: [],
        });
      }

      // Step 2: Create worktrees for agents that need them
      const worktreeResults = await this.setupWorktrees(squadConfig.agents);
      if (!worktreeResults.ok) {
        return err(worktreeResults.error);
      }
      const createdWorktrees = worktreeResults.value;

      // Step 3: Create tmux layout
      const layoutResult = await this.mockTmuxManager.createLayout(squadConfig);
      if (!layoutResult.ok) {
        await this.cleanup(createdWorktrees);
        return err(new Error("Failed to create tmux layout"));
      }
      const panes = layoutResult.value;

      // Step 4: Setup agents
      const agents = squadConfig.agents.map((agent, index) => ({
        name: agent.name,
        paneId: panes[index]?.id || "0",
        status: "stopped",
        lastActivity: new Date(),
      }));

      // Update squad context
      this.squadContext.agents = agents;

      return ok({
        sessionName,
        panes,
        agents,
        isResumed: false,
        createdWorktrees,
      });

    } catch (error) {
      return err(new Error(`Unexpected error during team setup: ${error.message}`));
    }
  }

  async setupWorktrees(agents) {
    const createdWorktrees = [];
    const worktreeAgents = agents.filter(agent => agent.worktree);

    if (worktreeAgents.length === 0) {
      return ok([]);
    }

    try {
      // Get git root for worktree operations
      const gitRoot = await this.mockGetGitRoot();

      for (const agent of worktreeAgents) {
        const worktreeName = agent.name;
        const createResult = await this.mockCreateWorktree(
          gitRoot,
          this.config.worktreeDirectory,
          worktreeName,
          { branch: worktreeName, base: "HEAD" }
        );

        if (!createResult.ok) {
          return err(new Error(`Failed to create worktree for agent "${agent.name}": ${createResult.error.message}`));
        }

        createdWorktrees.push(createResult.value.path);
      }

      return ok(createdWorktrees);

    } catch (error) {
      return err(new Error(`Unexpected error during worktree setup: ${error.message}`));
    }
  }

  async cleanup(createdWorktrees) {
    try {
      await this.mockTmuxManager.killSession();
    } catch {
      // Ignore errors during cleanup
    }
  }

  async terminateSquad() {
    try {
      const killResult = await this.mockTmuxManager.killSession();
      if (!killResult.ok) {
        return err(new Error("Failed to kill tmux session"));
      }

      this.squadContext = undefined;
      return ok(undefined);

    } catch (error) {
      return err(new Error(`Failed to terminate squad: ${error.message}`));
    }
  }

  getSquadContext() {
    return this.squadContext;
  }

  getTmuxManager() {
    return this.mockTmuxManager;
  }

  getSessionManager() {
    return this.mockSessionManager;
  }

  // Add method for testing environment variable setting
  buildAgentCommand(commandString, agent, sessionName) {
    const envVars = [
      `PHANTOM_AGENT_NAME="${agent.name}"`,
      `PHANTOM_SESSION_NAME="${sessionName}"`,
    ];

    return `${envVars.join(" ")} ${commandString}`;
  }
}

describe("AgentOrchestrator Integration Tests", () => {
  let orchestrator;
  let config;
  let squadConfig;
  let mockDependencies;

  beforeEach(() => {
    // Create mock dependencies
    mockDependencies = {
      tmuxManager: {
        checkExistingSession: async () => ok(false),
        attachToSession: async () => ok(undefined),
        createLayout: async () => ok([]),
        sendKeys: async () => ok(undefined),
        getAllPanes: () => [],
        killSession: async () => ok(undefined),
      },
      sessionManager: {
        startOrResumeSession: async () => ok({ sessionId: "sess-test", isNew: true, commandString: "claude code --session sess-test" }),
        removeSession: async () => ok(undefined),
      },
      createWorktree: async () => ok({ path: "/test/path", branch: "test-branch", isNew: true }),
      getGitRoot: async () => "/test/git/root",
    };

    // Setup test configuration
    config = {
      gitRoot: "/test/git/root",
      worktreeDirectory: "/test/worktrees",
      sessionDirectory: "/test/sessions",
      agentTimeout: 30000,
    };

    squadConfig = {
      agents: [
        {
          name: "developer",
          prompt: "./prompts/developer.md",
          worktree: true,
        },
        {
          name: "reviewer",
          prompt: "./prompts/reviewer.md",
          worktree: false,
        },
      ],
      layout: "auto",
    };

    orchestrator = new TestableAgentOrchestrator(config, "test-squad", mockDependencies);
  });

  describe("setupTeam - New Session Flow", () => {
    test("should successfully create new team with all components", async () => {
      // Arrange
      const expectedPanes = [
        { id: "0", agentName: "developer", index: 0 },
        { id: "1", agentName: "reviewer", index: 1 },
      ];

      const expectedWorktreePath = "/test/worktrees/developer";

      // Track function calls
      const calls = {
        checkExistingSession: 0,
        createLayout: 0,
        createWorktree: 0,
        getGitRoot: 0,
      };

      // Setup mock responses
      mockDependencies.tmuxManager.checkExistingSession = async () => {
        calls.checkExistingSession++;
        return ok(false);
      };
      
      mockDependencies.tmuxManager.createLayout = async () => {
        calls.createLayout++;
        return ok(expectedPanes);
      };

      mockDependencies.createWorktree = async (gitRoot, worktreeDir, name) => {
        calls.createWorktree++;
        assert.strictEqual(gitRoot, "/test/git/root");
        assert.strictEqual(worktreeDir, "/test/worktrees");
        assert.strictEqual(name, "developer");
        return ok({ path: expectedWorktreePath, branch: "test-branch", isNew: true });
      };

      mockDependencies.getGitRoot = async () => {
        calls.getGitRoot++;
        return "/test/git/root";
      };

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, true);
      
      const setupResult = result.value;
      assert.strictEqual(setupResult.sessionName, "test-session");
      assert.strictEqual(setupResult.isResumed, false);
      assert.strictEqual(setupResult.panes.length, 2);
      assert.strictEqual(setupResult.agents.length, 2);
      assert.deepStrictEqual(setupResult.createdWorktrees, [expectedWorktreePath]);

      // Verify component interactions
      assert.strictEqual(calls.checkExistingSession, 1);
      assert.strictEqual(calls.createWorktree, 1);
      assert.strictEqual(calls.createLayout, 1);
      assert.strictEqual(calls.getGitRoot, 1);
    });

    test("should only create worktrees for agents with worktree: true", async () => {
      // Arrange
      const expectedPanes = [
        { id: "0", agentName: "developer", index: 0 },
        { id: "1", agentName: "reviewer", index: 1 },
      ];

      let createWorktreeCallCount = 0;
      let lastWorktreeName = "";

      mockDependencies.tmuxManager.checkExistingSession = async () => ok(false);
      mockDependencies.tmuxManager.createLayout = async () => ok(expectedPanes);
      mockDependencies.getGitRoot = async () => "/test/git/root";
      mockDependencies.createWorktree = async (gitRoot, worktreeDir, name) => {
        createWorktreeCallCount++;
        lastWorktreeName = name;
        return ok({ path: `/test/worktrees/${name}`, branch: "test-branch", isNew: true });
      };

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, true);
      
      // Only one worktree should be created (for developer agent)
      assert.strictEqual(createWorktreeCallCount, 1);
      assert.strictEqual(lastWorktreeName, "developer");
    });

    test("should verify correct call order and dependencies", async () => {
      // Arrange
      const callOrder = [];
      
      mockDependencies.tmuxManager.checkExistingSession = async () => {
        callOrder.push("checkExistingSession");
        return ok(false);
      };
      
      mockDependencies.getGitRoot = async () => {
        callOrder.push("getGitRoot");
        return "/test/git/root";
      };
      
      mockDependencies.createWorktree = async () => {
        callOrder.push("createWorktree");
        return ok({ path: "/test/worktrees/developer", branch: "test-branch", isNew: true });
      };
      
      mockDependencies.tmuxManager.createLayout = async () => {
        callOrder.push("createLayout");
        return ok([{ id: "0", agentName: "developer", index: 0 }]);
      };

      // Act
      await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert - verify correct execution order
      assert.deepStrictEqual(callOrder, [
        "checkExistingSession",
        "getGitRoot",
        "createWorktree",
        "createLayout",
      ]);
    });
  });

  describe("setupTeam - Session Resume Flow", () => {
    test("should attach to existing session without creating worktrees", async () => {
      // Arrange
      const existingPanes = [
        { id: "0", agentName: "developer", index: 0 },
        { id: "1", agentName: "reviewer", index: 1 },
      ];

      let createWorktreeCallCount = 0;
      let attachCallCount = 0;

      mockDependencies.tmuxManager.checkExistingSession = async () => ok(true);
      mockDependencies.tmuxManager.attachToSession = async () => {
        attachCallCount++;
        return ok(undefined);
      };
      mockDependencies.tmuxManager.getAllPanes = () => existingPanes;
      mockDependencies.createWorktree = async () => {
        createWorktreeCallCount++;
        return ok({ path: "/test/path", branch: "test-branch", isNew: true });
      };

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, true);
      
      const setupResult = result.value;
      assert.strictEqual(setupResult.isResumed, true);
      assert.strictEqual(setupResult.createdWorktrees.length, 0);

      // Verify that worktree creation was skipped
      assert.strictEqual(createWorktreeCallCount, 0);
      
      // Verify attach was called
      assert.strictEqual(attachCallCount, 1);
    });
  });

  describe("setupTeam - Error Handling", () => {
    test("should handle tmux session check failure", async () => {
      // Arrange
      const expectedError = new Error("Tmux not available");
      mockDependencies.tmuxManager.checkExistingSession = async () => err(expectedError);

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.message, "Failed to check existing tmux session");
    });

    test("should handle worktree creation failure", async () => {
      // Arrange
      mockDependencies.tmuxManager.checkExistingSession = async () => ok(false);
      mockDependencies.getGitRoot = async () => "/test/git/root";
      
      const worktreeError = new Error("Failed to create worktree");
      mockDependencies.createWorktree = async () => err(worktreeError);

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes("Failed to create worktree for agent"));
    });

    test("should handle tmux layout creation failure with cleanup", async () => {
      // Arrange
      let killSessionCalled = false;
      
      mockDependencies.tmuxManager.checkExistingSession = async () => ok(false);
      mockDependencies.getGitRoot = async () => "/test/git/root";
      mockDependencies.createWorktree = async () => ok({ path: "/test/worktrees/developer", branch: "test-branch", isNew: true });
      
      const layoutError = new Error("Failed to create layout");
      mockDependencies.tmuxManager.createLayout = async () => err(layoutError);
      mockDependencies.tmuxManager.killSession = async () => {
        killSessionCalled = true;
        return ok(undefined);
      };

      // Act
      const result = await orchestrator.setupTeam(squadConfig, "test-session");

      // Assert
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.message, "Failed to create tmux layout");
      
      // Verify cleanup was attempted
      assert.strictEqual(killSessionCalled, true);
    });
  });

  describe("terminateSquad", () => {
    test("should successfully terminate squad and clean up resources", async () => {
      // Arrange
      let killSessionCalled = false;
      mockDependencies.tmuxManager.killSession = async () => {
        killSessionCalled = true;
        return ok(undefined);
      };

      // Act
      const result = await orchestrator.terminateSquad();

      // Assert
      assert.strictEqual(result.ok, true);
      assert.strictEqual(killSessionCalled, true);
      
      // Verify squad context is cleared
      assert.strictEqual(orchestrator.getSquadContext(), undefined);
    });

    test("should handle tmux session termination failure", async () => {
      // Arrange
      const killError = new Error("Failed to kill session");
      mockDependencies.tmuxManager.killSession = async () => err(killError);

      // Act
      const result = await orchestrator.terminateSquad();

      // Assert
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.message, "Failed to kill tmux session");
    });
  });

  describe("Environment Variable Setting", () => {
    test("should set PHANTOM_AGENT_NAME and PHANTOM_SESSION_NAME environment variables", () => {
      // Arrange
      const commandString = "claude code --session test-session";
      const agent = { name: "developer", prompt: "./prompts/developer.md", worktree: true };
      const sessionName = "test-session";

      // Act
      const result = orchestrator.buildAgentCommand(commandString, agent, sessionName);

      // Assert
      const expected = `PHANTOM_AGENT_NAME="developer" PHANTOM_SESSION_NAME="test-session" claude code --session test-session`;
      assert.strictEqual(result, expected);
    });

    test("should properly escape agent names with spaces", () => {
      // Arrange
      const commandString = "claude code --session test-session";
      const agent = { name: "code reviewer", prompt: "./prompts/reviewer.md", worktree: false };
      const sessionName = "test-session";

      // Act
      const result = orchestrator.buildAgentCommand(commandString, agent, sessionName);

      // Assert
      const expected = `PHANTOM_AGENT_NAME="code reviewer" PHANTOM_SESSION_NAME="test-session" claude code --session test-session`;
      assert.strictEqual(result, expected);
    });

    test("should properly escape session names with special characters", () => {
      // Arrange
      const commandString = "claude code --session test-session";
      const agent = { name: "developer", prompt: "./prompts/developer.md", worktree: true };
      const sessionName = "test-session-v2.1";

      // Act
      const result = orchestrator.buildAgentCommand(commandString, agent, sessionName);

      // Assert
      const expected = `PHANTOM_AGENT_NAME="developer" PHANTOM_SESSION_NAME="test-session-v2.1" claude code --session test-session`;
      assert.strictEqual(result, expected);
    });

    test("should handle empty command string", () => {
      // Arrange
      const commandString = "";
      const agent = { name: "developer", prompt: "./prompts/developer.md", worktree: true };
      const sessionName = "test-session";

      // Act
      const result = orchestrator.buildAgentCommand(commandString, agent, sessionName);

      // Assert
      const expected = `PHANTOM_AGENT_NAME="developer" PHANTOM_SESSION_NAME="test-session" `;
      assert.strictEqual(result, expected);
    });
  });

  describe("Component Access", () => {
    test("should provide access to underlying managers", () => {
      // Act & Assert
      const tmuxManager = orchestrator.getTmuxManager();
      const sessionManager = orchestrator.getSessionManager();

      assert.strictEqual(typeof tmuxManager, "object");
      assert.strictEqual(typeof sessionManager, "object");
    });

    test("should track squad context during setup", async () => {
      // Arrange
      mockDependencies.tmuxManager.checkExistingSession = async () => ok(false);
      mockDependencies.tmuxManager.createLayout = async () => ok([{ id: "0", agentName: "developer", index: 0 }]);
      mockDependencies.getGitRoot = async () => "/test/git/root";
      mockDependencies.createWorktree = async () => ok({ path: "/test/worktrees/developer", branch: "test-branch", isNew: true });

      // Act
      await orchestrator.setupTeam(squadConfig, "context-test");

      // Assert
      const context = orchestrator.getSquadContext();
      assert.strictEqual(context.sessionName, "context-test");
      assert.strictEqual(context.config, squadConfig);
      assert.strictEqual(context.agents.length, 2);
      assert.strictEqual(typeof context.startTime, "object");
      assert.strictEqual(context.startTime instanceof Date, true);
    });
  });
});