import { parseArgs } from "node:util";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { exitCodes, exitWithError, exitWithSuccess } from "../errors.ts";
import { output } from "../output.ts";
import { 
  createContext, 
  AgentOrchestrator, 
  type OrchestratorConfig 
} from "@aku11i/phantom-core";

export async function squadHandler(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      config: {
        type: "string",
        short: "c",
        default: "phantom.config.json",
      },
      verbose: {
        type: "boolean",
        short: "v",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  try {
    if (positionals.length === 0) {
      output.log("Usage: phantom squad <session-name>");
      output.log("");
      output.log("Starts a multi-agent development environment using tmux.");
      output.log("");
      output.log("Options:");
      output.log("  -c, --config <file>    Configuration file (default: phantom.config.json)");
      output.log("  -v, --verbose          Enable verbose output");
      exitWithSuccess();
      return;
    }

    const sessionName = positionals[0];
    const configPath = values.config;

    // Check if config file exists
    if (!existsSync(configPath)) {
      exitWithError(
        `Configuration file not found: ${configPath}`,
        exitCodes.validationError,
      );
      return;
    }

    // Load configuration
    const context = await createContext(process.cwd());
    
    if (!context.config) {
      exitWithError(
        `Configuration file not found or invalid: ${configPath}`,
        exitCodes.validationError,
      );
      return;
    }

    const squadConfig = context.config.squad;

    if (!squadConfig) {
      exitWithError(
        "No squad configuration found in phantom.config.json. Please add a 'squad' section to your configuration.",
        exitCodes.validationError,
      );
      return;
    }

    if (values.verbose) {
      output.log(`Starting squad session: ${sessionName}`);
      output.log(`Configuration: ${configPath}`);
      output.log(`Agents: ${squadConfig.agents.map(a => a.name).join(", ")}`);
      output.log(`Layout: ${squadConfig.layout}`);
    }

    // Create orchestrator configuration
    const orchestratorConfig: OrchestratorConfig = {
      gitRoot: context.gitRoot,
      worktreeDirectory: context.worktreesDirectory,
      sessionDirectory: join(context.gitRoot, ".claude_session"),
      agentTimeout: 60000,
    };

    // Create and setup the orchestrator
    const orchestrator = new AgentOrchestrator(orchestratorConfig, sessionName);
    
    output.log(`Setting up multi-agent environment: ${sessionName}`);
    output.log(`Agents to start: ${squadConfig.agents.length}`);

    const setupResult = await orchestrator.setupTeam(squadConfig, sessionName);
    
    if (!setupResult.ok) {
      exitWithError(
        `Failed to setup squad: ${setupResult.error.message}`,
        exitCodes.generalError,
      );
      return;
    }

    const result = setupResult.value;

    if (result.isResumed) {
      output.log(`✅ Attached to existing session: ${sessionName}`);
    } else {
      output.log(`✅ Successfully created squad session: ${sessionName}`);
      
      if (result.createdWorktrees.length > 0) {
        output.log(`📁 Created worktrees: ${result.createdWorktrees.length}`);
        if (values.verbose) {
          for (const worktree of result.createdWorktrees) {
            output.log(`   - ${worktree}`);
          }
        }
      }

      output.log(`🔧 Created tmux panes: ${result.panes.length}`);
      if (values.verbose) {
        for (const pane of result.panes) {
          output.log(`   - Pane ${pane.id}: ${pane.agentName}`);
        }
      }

      output.log(`🤖 Started agents: ${result.agents.length}`);
      if (values.verbose) {
        for (const agent of result.agents) {
          output.log(`   - ${agent.name} (status: ${agent.status}, pane: ${agent.paneId})`);
        }
      }
    }

    output.log("");
    output.log("Your multi-agent development environment is ready!");
    output.log(`Use 'tmux attach-session -t ${sessionName}' to attach to the session.`);

    exitWithSuccess();
  } catch (error) {
    exitWithError(
      error instanceof Error ? error.message : String(error),
      exitCodes.generalError,
    );
  }
}
