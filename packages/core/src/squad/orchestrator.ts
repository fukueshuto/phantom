import { type Result, err, ok } from "@aku11i/phantom-shared";
import { getGitRoot } from "@aku11i/phantom-git";
import { createWorktree } from "../worktree/create.ts";
import { type CreateWorktreeOptions } from "../worktree/create.ts";
import { getWorktreePathFromDirectory } from "../paths.ts";
import { ClaudeSessionManager, type ClaudeSessionConfig, type ClaudeSessionResult } from "../claude/session.ts";
import { TmuxManager, type PaneInfo } from "./tmuxManager.ts";
import type { SquadConfig, Agent, AgentStatus, SquadContext } from "./types.ts";

/**
 * Error types for orchestrator operations
 */
export class OrchestratorError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "OrchestratorError";
    this.cause = cause;
  }
}

export class WorktreeSetupError extends OrchestratorError {
  constructor(message: string, cause?: Error) {
    super(`Worktree setup failed: ${message}`, cause);
    this.name = "WorktreeSetupError";
  }
}

export class TmuxSetupError extends OrchestratorError {
  constructor(message: string, cause?: Error) {
    super(`Tmux setup failed: ${message}`, cause);
    this.name = "TmuxSetupError";
  }
}

export class AgentLaunchError extends OrchestratorError {
  constructor(message: string, cause?: Error) {
    super(`Agent launch failed: ${message}`, cause);
    this.name = "AgentLaunchError";
  }
}

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Root directory of the git repository */
  gitRoot: string;
  /** Directory where worktrees will be created */
  worktreeDirectory: string;
  /** Directory where session files are stored */
  sessionDirectory: string;
  /** Timeout for agent startup in milliseconds */
  agentTimeout?: number;
}

/**
 * Result of setting up the team
 */
export interface SetupTeamResult {
  /** Tmux session name */
  sessionName: string;
  /** Information about created panes */
  panes: PaneInfo[];
  /** Information about started agents */
  agents: AgentStatus[];
  /** Whether the session was resumed or newly created */
  isResumed: boolean;
  /** List of created worktrees */
  createdWorktrees: string[];
}

/**
 * Orchestrates the setup and management of multi-agent development environments.
 * 
 * The AgentOrchestrator coordinates:
 * - Git worktree creation for agents requiring isolation
 * - Tmux session and pane management
 * - Claude agent session management and startup
 * - Proper cleanup and error handling
 */
export class AgentOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly tmuxManager: TmuxManager;
  private readonly sessionManager: ClaudeSessionManager;
  private squadContext?: SquadContext;

  constructor(config: OrchestratorConfig, sessionName: string = "phantom-squad") {
    this.config = {
      agentTimeout: 60000, // 60 seconds default timeout
      ...config,
    };
    
    this.tmuxManager = new TmuxManager(sessionName);
    
    const sessionConfig: ClaudeSessionConfig = {
      sessionDirectory: config.sessionDirectory,
      timeout: config.agentTimeout,
    };
    this.sessionManager = new ClaudeSessionManager(sessionConfig);
  }

  /**
   * Sets up the complete multi-agent environment.
   * 
   * This method orchestrates the entire setup process:
   * 1. Check for existing tmux session and attach if found
   * 2. Create git worktrees for agents with worktree: true
   * 3. Create tmux session and panes according to layout
   * 4. Start Claude agents in appropriate directories
   * 
   * @param squadConfig - Configuration for the squad
   * @param sessionName - Name for the session
   * @returns Promise resolving to setup result
   */
  async setupTeam(
    squadConfig: SquadConfig,
    sessionName: string,
  ): Promise<Result<SetupTeamResult, OrchestratorError>> {
    try {
      // Initialize squad context
      this.squadContext = {
        sessionName,
        config: squadConfig,
        agents: [],
        startTime: new Date(),
      };

      // Step 1: Check for existing tmux session
      const sessionCheckResult = await this.tmuxManager.checkExistingSession();
      if (!sessionCheckResult.ok) {
        return err(new TmuxSetupError("Failed to check existing tmux session", sessionCheckResult.error));
      }

      if (sessionCheckResult.value) {
        // Session exists, attach to it
        const attachResult = await this.tmuxManager.attachToSession();
        if (!attachResult.ok) {
          return err(new TmuxSetupError("Failed to attach to existing session", attachResult.error));
        }

        return ok({
          sessionName,
          panes: this.tmuxManager.getAllPanes(),
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
      const layoutResult = await this.tmuxManager.createLayout(squadConfig);
      if (!layoutResult.ok) {
        await this.cleanup(createdWorktrees);
        return err(new TmuxSetupError("Failed to create tmux layout", layoutResult.error));
      }
      const panes = layoutResult.value;

      // Step 4: Start agents in their respective panes
      // TODO: For now, skip agent startup to test tmux layout creation
      console.log("Skipping agent startup for testing purposes");
      const agents: AgentStatus[] = squadConfig.agents.map((agent, index) => ({
        name: agent.name,
        paneId: panes[index]?.id || "0",
        status: "stopped" as const,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("Team setup error:", errorMessage);
      if (errorStack) {
        console.error("Stack trace:", errorStack);
      }
      return err(
        new OrchestratorError(
          `Unexpected error during team setup: ${errorMessage}`,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  /**
   * Creates git worktrees for agents that require them.
   */
  private async setupWorktrees(agents: Agent[]): Promise<Result<string[], WorktreeSetupError>> {
    const createdWorktrees: string[] = [];
    const worktreeAgents = agents.filter(agent => agent.worktree);

    if (worktreeAgents.length === 0) {
      return ok([]);
    }

    try {
      // Get git root for worktree operations
      const gitRoot = await getGitRoot();

      for (const agent of worktreeAgents) {
        const worktreeName = agent.name;
        const options: CreateWorktreeOptions = {
          branch: worktreeName,
          base: "HEAD",
        };

        const createResult = await createWorktree(
          gitRoot,
          this.config.worktreeDirectory,
          worktreeName,
          options,
          undefined, // postCreateCopyFiles
          undefined, // postCreateCommands
        );

        if (!createResult.ok) {
          // Clean up any worktrees we've already created
          await this.cleanupWorktrees(createdWorktrees);
          console.error(`Worktree creation failed for agent "${agent.name}":`, createResult.error);
          return err(new WorktreeSetupError(
            `Failed to create worktree for agent "${agent.name}": ${createResult.error.message}`,
            createResult.error,
          ));
        }

        createdWorktrees.push(createResult.value.path);
      }

      return ok(createdWorktrees);

    } catch (error) {
      // Clean up any worktrees we've already created
      await this.cleanupWorktrees(createdWorktrees);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("Worktree setup error:", errorMessage);
      if (errorStack) {
        console.error("Stack trace:", errorStack);
      }
      return err(new WorktreeSetupError(
        `Unexpected error during worktree setup: ${errorMessage}`,
        error instanceof Error ? error : new Error(String(error)),
      ));
    }
  }

  /**
   * Starts Claude agents in their respective tmux panes.
   */
  private async startAgents(
    agents: Agent[],
    panes: PaneInfo[],
    sessionName: string,
  ): Promise<Result<AgentStatus[], AgentLaunchError>> {
    const agentStatuses: AgentStatus[] = [];

    try {
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const pane = panes[i];

        if (!pane) {
          return err(new AgentLaunchError(`No pane found for agent "${agent.name}"`));
        }

        // Start or resume Claude session for this agent
        const sessionResult = await this.sessionManager.startOrResumeSession(
          sessionName,
          agent.name,
        );

        if (!sessionResult.ok) {
          console.error(`Session manager error for agent "${agent.name}":`, sessionResult.error);
          return err(new AgentLaunchError(
            `Failed to start session for agent "${agent.name}": ${sessionResult.error.message}`,
            sessionResult.error,
          ));
        }

        const { commandString } = sessionResult.value;

        // Build the complete command with environment variables
        const agentCommand = this.buildAgentCommand(commandString, agent, sessionName);

        // Navigate to appropriate directory and start agent
        let navigationCommand = "";
        if (agent.worktree) {
          const worktreePath = getWorktreePathFromDirectory(this.config.worktreeDirectory, agent.name);
          navigationCommand = `cd "${worktreePath}" && `;
        }

        const fullCommand = `${navigationCommand}${agentCommand}`;

        // Send command to the pane
        const sendResult = await this.tmuxManager.sendKeys(pane.id, fullCommand);
        if (!sendResult.ok) {
          return err(new AgentLaunchError(
            `Failed to send command to pane for agent "${agent.name}"`,
            sendResult.error,
          ));
        }

        // Create agent status
        const agentStatus: AgentStatus = {
          name: agent.name,
          paneId: pane.id,
          status: "starting",
          lastActivity: new Date(),
        };

        agentStatuses.push(agentStatus);
      }

      return ok(agentStatuses);

    } catch (error) {
      return err(new AgentLaunchError(
        "Unexpected error during agent startup",
        error instanceof Error ? error : new Error(String(error)),
      ));
    }
  }

  /**
   * Builds the command string for starting an agent with proper environment variables.
   */
  private buildAgentCommand(commandString: string, agent: Agent, sessionName: string): string {
    const envVars = [
      `PHANTOM_AGENT_NAME="${agent.name}"`,
      `PHANTOM_SESSION_NAME="${sessionName}"`,
    ];

    return `${envVars.join(" ")} ${commandString}`;
  }

  /**
   * Gets the current squad context.
   */
  getSquadContext(): SquadContext | undefined {
    return this.squadContext;
  }

  /**
   * Gets the tmux manager instance.
   */
  getTmuxManager(): TmuxManager {
    return this.tmuxManager;
  }

  /**
   * Gets the session manager instance.
   */
  getSessionManager(): ClaudeSessionManager {
    return this.sessionManager;
  }

  /**
   * Performs cleanup in case of errors.
   */
  private async cleanup(createdWorktrees: string[]): Promise<void> {
    // Kill tmux session if it was created
    try {
      await this.tmuxManager.killSession();
    } catch {
      // Ignore errors during cleanup
    }

    // Clean up worktrees
    await this.cleanupWorktrees(createdWorktrees);
  }

  /**
   * Cleans up created worktrees.
   */
  private async cleanupWorktrees(worktreePaths: string[]): Promise<void> {
    // Note: Actual worktree cleanup should be implemented using 
    // the delete worktree functionality from the worktree package
    // For now, we'll leave this as a placeholder since the cleanup
    // logic depends on the specific worktree deletion implementation
    
    // TODO: Implement proper worktree cleanup when delete functionality is available
    for (const path of worktreePaths) {
      try {
        // Placeholder for worktree deletion
        console.warn(`TODO: Clean up worktree at ${path}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Terminates the squad session and cleans up resources.
   */
  async terminateSquad(): Promise<Result<void, OrchestratorError>> {
    try {
      // Kill tmux session
      const killResult = await this.tmuxManager.killSession();
      if (!killResult.ok) {
        return err(new TmuxSetupError("Failed to kill tmux session", killResult.error));
      }

      // Reset squad context
      this.squadContext = undefined;

      return ok(undefined);

    } catch (error) {
      return err(new OrchestratorError(
        "Failed to terminate squad",
        error instanceof Error ? error : new Error(String(error)),
      ));
    }
  }
}