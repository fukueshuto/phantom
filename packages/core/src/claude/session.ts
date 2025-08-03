import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { type Result, ok, err } from "@aku11i/phantom-shared";

/**
 * Error types for Claude session management
 */
export class ClaudeSessionError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ClaudeSessionError";
    this.cause = cause;
  }
}

export class ClaudeSessionSpawnError extends ClaudeSessionError {
  constructor(message: string, cause?: Error) {
    super(`Failed to spawn claude code process: ${message}`, cause);
    this.name = "ClaudeSessionSpawnError";
  }
}

export class ClaudeSessionFileError extends ClaudeSessionError {
  constructor(message: string, cause?: Error) {
    super(`Session file operation failed: ${message}`, cause);
    this.name = "ClaudeSessionFileError";
  }
}

export class ClaudeSessionParseError extends ClaudeSessionError {
  constructor(message: string) {
    super(`Failed to parse session ID: ${message}`);
    this.name = "ClaudeSessionParseError";
  }
}

/**
 * Configuration for Claude session
 */
export interface ClaudeSessionConfig {
  /** Directory where session files are stored */
  sessionDirectory: string;
  /** Timeout for session startup in milliseconds */
  timeout?: number;
}

/**
 * Result of starting or resuming a Claude session
 */
export interface ClaudeSessionResult {
  /** The session ID (e.g., "sess-abc123") */
  sessionId: string;
  /** Whether this was a new session (true) or resumed (false) */
  isNew: boolean;
  /** The command string for executing claude code with this session and agent */
  commandString: string;
}

/**
 * Manages Claude Code sessions for the phantom worktree system.
 *
 * This class provides functionality to:
 * - Start new Claude Code sessions
 * - Resume existing sessions by session name
 * - Extract session IDs from claude code output
 * - Store and retrieve session information
 */
export class ClaudeSessionManager {
  private readonly config: ClaudeSessionConfig;

  constructor(config: ClaudeSessionConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default timeout
      ...config,
    };
  }

  /**
   * Starts a new Claude session or resumes an existing one.
   *
   * @param sessionName - Unique name for the session (used for file storage)
   * @param agentName - Name of the Claude agent to use
   * @returns Promise resolving to session result with session ID and command string
   */
  async startOrResumeSession(
    sessionName: string,
    agentName?: string,
  ): Promise<Result<ClaudeSessionResult, ClaudeSessionError>> {
    try {
      // Check if session already exists
      const existingSessionResult = await this.loadExistingSession(sessionName);
      if (existingSessionResult.ok) {
        const sessionId = existingSessionResult.value;
        const commandString = this.buildCommandString(sessionId, agentName);
        return ok({
          sessionId,
          isNew: false,
          commandString,
        });
      }

      // Start new session
      const newSessionResult = await this.startNewSession(
        sessionName,
        agentName,
      );
      if (!newSessionResult.ok) {
        return err(newSessionResult.error);
      }

      const { sessionId } = newSessionResult.value;
      const commandString = this.buildCommandString(sessionId, agentName);

      return ok({
        sessionId,
        isNew: true,
        commandString,
      });
    } catch (error) {
      return err(
        new ClaudeSessionError(
          `Failed to start or resume session "${sessionName}"`,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  /**
   * Starts a new Claude Code session and extracts the session ID.
   */
  private async startNewSession(
    sessionName: string,
    agentName?: string,
  ): Promise<Result<{ sessionId: string }, ClaudeSessionError>> {
    return new Promise((resolve) => {
      const args = agentName ? ["--agent", agentName] : [];
      const claudeProcess = spawn("claude", ["code", ...args], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let sessionId: string | null = null;

      const timeout = setTimeout(() => {
        claudeProcess.kill();
        if (!sessionId) {
          resolve(
            err(
              new ClaudeSessionSpawnError(
                `Session startup timed out after ${this.config.timeout}ms`,
              ),
            ),
          );
        }
      }, this.config.timeout);

      claudeProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();

        // Extract session ID using regex
        const sessionMatch = stdout.match(/sess-[a-zA-Z0-9]+/);
        if (sessionMatch && !sessionId) {
          sessionId = sessionMatch[0];
          clearTimeout(timeout);

          // Save session ID to file
          const saveResult = this.saveSession(sessionName, sessionId);
          if (saveResult.ok) {
            resolve(ok({ sessionId }));
          } else {
            resolve(err(saveResult.error));
          }

          // Clean up process
          claudeProcess.kill();
        }
      });

      claudeProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      claudeProcess.on("error", (error) => {
        clearTimeout(timeout);
        resolve(
          err(
            new ClaudeSessionSpawnError(
              `Process spawn failed: ${error.message}`,
              error,
            ),
          ),
        );
      });

      claudeProcess.on("exit", (code, signal) => {
        clearTimeout(timeout);
        if (!sessionId) {
          const errorMessage =
            stderr ||
            `Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`;
          resolve(
            err(
              new ClaudeSessionSpawnError(
                `Failed to extract session ID. ${errorMessage}`,
              ),
            ),
          );
        }
      });
    });
  }

  /**
   * Gets the file path for storing a session ID.
   */
  private getSessionFilePath(sessionName: string): string {
    return join(this.config.sessionDirectory, `${sessionName}.session`);
  }

  /**
   * Builds the command string for executing claude code with the session and agent.
   * Public version for testing purposes.
   */
  buildCommandString(sessionId: string, agentName?: string): string {
    const baseCommand = `claude code --session ${sessionId}`;
    return agentName ? `${baseCommand} --agent ${agentName}` : baseCommand;
  }

  /**
   * Saves a session ID to storage.
   * Public version for testing purposes.
   */
  saveSession(
    sessionName: string,
    sessionId: string,
  ): Result<void, ClaudeSessionError> {
    try {
      const sessionFile = this.getSessionFilePath(sessionName);
      const sessionDir = dirname(sessionFile);

      // Ensure directory exists
      if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
      }

      writeFileSync(sessionFile, sessionId, "utf-8");
      return ok(undefined);
    } catch (error) {
      return err(
        new ClaudeSessionFileError(
          `Failed to save session "${sessionName}"`,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  /**
   * Loads an existing session ID from storage.
   * Public version for testing purposes.
   */
  async loadExistingSession(
    sessionName: string,
  ): Promise<Result<string, ClaudeSessionError>> {
    try {
      const sessionFile = this.getSessionFilePath(sessionName);

      if (!existsSync(sessionFile)) {
        return err(
          new ClaudeSessionFileError(`Session file not found: ${sessionFile}`),
        );
      }

      const sessionId = readFileSync(sessionFile, "utf-8").trim();

      if (!sessionId || !sessionId.match(/^sess-[a-zA-Z0-9]+$/)) {
        return err(
          new ClaudeSessionParseError(
            `Invalid session ID format: ${sessionId}`,
          ),
        );
      }

      return ok(sessionId);
    } catch (error) {
      return err(
        new ClaudeSessionFileError(
          `Failed to load session "${sessionName}"`,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  /**
   * Removes a saved session.
   */
  async removeSession(
    sessionName: string,
  ): Promise<Result<void, ClaudeSessionError>> {
    try {
      const sessionFile = this.getSessionFilePath(sessionName);

      if (existsSync(sessionFile)) {
        const fs = await import("node:fs/promises");
        await fs.unlink(sessionFile);
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new ClaudeSessionFileError(
          `Failed to remove session "${sessionName}"`,
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }

  /**
   * Lists all saved sessions.
   */
  async listSessions(): Promise<Result<string[], ClaudeSessionError>> {
    try {
      if (!existsSync(this.config.sessionDirectory)) {
        return ok([]);
      }

      const fs = await import("node:fs/promises");
      const files = await fs.readdir(this.config.sessionDirectory);

      const sessionNames = files
        .filter((file) => file.endsWith(".session"))
        .map((file) => file.replace(".session", ""));

      return ok(sessionNames);
    } catch (error) {
      return err(
        new ClaudeSessionFileError(
          "Failed to list sessions",
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
    }
  }
}
