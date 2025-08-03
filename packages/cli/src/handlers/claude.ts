import { parseArgs } from "node:util";
import { basename } from "node:path";
import { spawn } from "node:child_process";
import { getGitRoot } from "@aku11i/phantom-git";
import { loadConfig, getWorktreesDirectory, ClaudeSessionManager } from "@aku11i/phantom-core";
import { exitCodes, exitWithError, exitWithSuccess } from "../errors.ts";
import { output } from "../output.ts";

export async function claudeHandler(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      sessionName: {
        type: "string",
        short: "s",
      },
      list: {
        type: "boolean",
        short: "l",
      },
      remove: {
        type: "string",
        short: "r",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  try {
    if (values.help) {
      showHelp();
      exitWithSuccess();
    }

    // Get git root and configuration
    const gitRoot = await getGitRoot();
    const configResult = await loadConfig(gitRoot);
    
    if (!configResult.ok) {
      output.error("Failed to load configuration:");
      output.error(configResult.error.message);
      exitWithError("Configuration loading failed", exitCodes.validationError);
    }

    const config = configResult.value;
    const worktreesDirectory = getWorktreesDirectory(gitRoot, config.worktreesDirectory);
    const sessionDirectory = `${worktreesDirectory}/.sessions`;

    // Initialize Claude session manager
    const sessionManager = new ClaudeSessionManager({
      sessionDirectory,
      timeout: 30000, // 30 seconds
    });

    // Handle list sessions
    if (values.list) {
      await handleListSessions(sessionManager);
    } else if (values.remove) {
      // Handle remove session
      await handleRemoveSession(sessionManager, values.remove);
    } else {
      // Handle start/resume session (default behavior)
      await handleStartOrResumeSession(sessionManager, values.sessionName);
    }
  } catch (error) {
    exitWithError(
      error instanceof Error ? error.message : String(error),
      exitCodes.generalError,
    );
  }
}

/**
 * Generates a session name based on the current directory
 */
function generateSessionName(customName?: string): string {
  if (customName) {
    return customName;
  }
  
  // Use current directory name as session name
  const currentDir = process.cwd();
  const dirName = basename(currentDir);
  
  // Sanitize the directory name for use as session name
  return dirName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
}

/**
 * Handles listing all saved sessions
 */
async function handleListSessions(sessionManager: ClaudeSessionManager): Promise<void> {
  const result = await sessionManager.listSessions();
  
  if (!result.ok) {
    output.error("Failed to list sessions:");
    output.error(result.error.message);
    exitWithError("Session listing failed", exitCodes.generalError);
  }

  const sessions = result.value;
  
  if (sessions.length === 0) {
    output.log("No saved sessions found.");
  } else {
    output.log("Saved Claude sessions:");
    sessions.forEach((session: string) => {
      output.log(`  - ${session}`);
    });
  }
  
  exitWithSuccess();
}

/**
 * Handles removing a saved session
 */
async function handleRemoveSession(sessionManager: ClaudeSessionManager, sessionName: string): Promise<void> {
  const result = await sessionManager.removeSession(sessionName);
  
  if (!result.ok) {
    output.error(`Failed to remove session "${sessionName}":`);
    output.error(result.error.message);
    exitWithError("Session removal failed", exitCodes.generalError);
  }

  output.log(`Session "${sessionName}" removed successfully.`);
  exitWithSuccess();
}

/**
 * Handles starting a new session or resuming an existing one
 */
async function handleStartOrResumeSession(
  sessionManager: ClaudeSessionManager, 
  customSessionName?: string
): Promise<void> {
  const sessionName = generateSessionName(customSessionName);
  
  output.log(`Starting Claude session: "${sessionName}"`);
  
  const result = await sessionManager.startOrResumeSession(sessionName);
  
  if (!result.ok) {
    output.error("Failed to start Claude session:");
    output.error(result.error.message);
    exitWithError("Session startup failed", exitCodes.generalError);
  }

  const sessionResult = result.value;
  
  if (sessionResult.isNew) {
    output.log(`New Claude session started: ${sessionResult.sessionId}`);
  } else {
    output.log(`Resumed Claude session: ${sessionResult.sessionId}`);
  }
  
  output.log(`Session name: ${sessionName}`);
  output.log(`Command: ${sessionResult.commandString}`);
  
  // Execute the Claude command
  await executeClaudeCommand(sessionResult.commandString);
}

/**
 * Executes the Claude command and handles the process
 */
async function executeClaudeCommand(commandString: string): Promise<void> {
  output.log("Launching Claude Code...");
  
  // Parse the command string
  const commandParts = commandString.split(' ');
  const command = commandParts[0];
  const args = commandParts.slice(1);
  
  try {
    const claudeProcess = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    claudeProcess.on('close', (code) => {
      if (code === 0) {
        output.log("Claude session ended successfully.");
      } else {
        output.warn(`Claude session ended with exit code: ${code}`);
      }
      process.exit(code || 0);
    });

    claudeProcess.on('error', (error) => {
      output.error("Failed to start Claude:");
      output.error(error.message);
      exitWithError("Claude execution failed", exitCodes.generalError);
    });

  } catch (error) {
    output.error("Failed to execute Claude command:");
    output.error(error instanceof Error ? error.message : String(error));
    exitWithError("Command execution failed", exitCodes.generalError);
  }
}

/**
 * Shows help information for the claude command
 */
function showHelp(): void {
  output.log("phantom claude - Start or resume a Claude Code session");
  output.log("");
  output.log("USAGE:");
  output.log("  phantom claude [OPTIONS]");
  output.log("");
  output.log("OPTIONS:");
  output.log("  -s, --session-name <NAME>   Custom session name (default: current directory name)");
  output.log("  -l, --list                  List all saved sessions");
  output.log("  -r, --remove <NAME>         Remove a saved session");
  output.log("  -h, --help                  Show this help message");
  output.log("");
  output.log("EXAMPLES:");
  output.log("  phantom claude              # Start/resume session with auto-generated name");
  output.log("  phantom claude -s my-proj   # Start/resume session named 'my-proj'");
  output.log("  phantom claude -l           # List all saved sessions");
  output.log("  phantom claude -r my-proj   # Remove session named 'my-proj'");
  output.log("");
  output.log("The session will be automatically named based on the current directory");
  output.log("unless a custom name is provided with --session-name.");
}
