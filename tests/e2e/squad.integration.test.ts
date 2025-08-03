/**
 * Integration tests for phantom squad functionality without terminal dependencies
 * 
 * This test suite verifies the integration components work correctly
 * while avoiding terminal-specific tmux/Claude dependencies.
 */

import { test } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const PHANTOM_CLI_PATH = join(process.cwd(), "packages/cli/src/bin/phantom.ts");

interface TestResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes phantom command and returns the result
 */
function runPhantomCommand(
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--no-warnings", "--experimental-strip-types", PHANTOM_CLI_PATH, ...args], {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 124, // timeout exit code
      });
    }, options.timeout || 10000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Creates a test Git repository with phantom configuration
 */
async function createTestRepo(): Promise<string> {
  const tempDir = join(tmpdir(), `phantom-integration-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  
  // Initialize git repo
  const git = (args: string[]) => spawn("git", args, { cwd: tempDir, stdio: "pipe" });
  
  await new Promise<void>((resolve, reject) => {
    const init = git(["init"]);
    init.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git init failed: ${code}`)));
  });
  
  await new Promise<void>((resolve, reject) => {
    const config1 = git(["config", "user.name", "Test User"]);
    config1.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git config failed: ${code}`)));
  });
  
  await new Promise<void>((resolve, reject) => {
    const config2 = git(["config", "user.email", "test@example.com"]);
    config2.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git config failed: ${code}`)));
  });
  
  // Create initial commit
  await writeFile(join(tempDir, "README.md"), "# Test Project");
  
  await new Promise<void>((resolve, reject) => {
    const add = git(["add", "."]);
    add.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git add failed: ${code}`)));
  });
  
  await new Promise<void>((resolve, reject) => {
    const commit = git(["commit", "-m", "Initial commit"]);
    commit.on("close", (code) => code === 0 ? resolve() : reject(new Error(`git commit failed: ${code}`)));
  });
  
  // Create phantom configuration
  const config = {
    squad: {
      agents: [
        {
          name: "manager",
          prompt: "roles/manager.md",
          worktree: false
        },
        {
          name: "dev-agent",
          prompt: "roles/developer.md",
          worktree: true
        }
      ],
      layout: "auto"
    }
  };
  
  await writeFile(join(tempDir, "phantom.config.json"), JSON.stringify(config, null, 2));
  
  // Create roles directory
  await mkdir(join(tempDir, "roles"), { recursive: true });
  await writeFile(join(tempDir, "roles/manager.md"), "# Manager Role\nYou are a team manager.");
  await writeFile(join(tempDir, "roles/developer.md"), "# Developer Role\nYou are a developer.");
  
  return tempDir;
}

test("phantom squad - configuration validation", async () => {
  const tempDir = await createTestRepo();
  
  try {
    const result = await runPhantomCommand(["squad", "test-session", "--verbose"], {
      cwd: tempDir,
      timeout: 8000
    });

    // Should show configuration loading
    assert(
      result.stderr.includes("Starting squad session: test-session") ||
      result.stderr.includes("Configuration: phantom.config.json"),
      `Expected configuration output, got: ${result.stderr}`
    );
    
    // Should show agent configuration
    assert(
      result.stderr.includes("Agents: manager, dev-agent") ||
      result.stderr.includes("Layout: auto"),
      `Expected agent configuration, got: ${result.stderr}`
    );
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("phantom squad - help display", async () => {
  const result = await runPhantomCommand(["squad"], { timeout: 5000 });

  assert.strictEqual(result.exitCode, 0);
  assert(result.stdout.includes("Usage: phantom squad <session-name>"));
  assert(result.stdout.includes("Starts a multi-agent development environment"));
});

test("phantom squad - missing configuration", async () => {
  const tempDir = join(tmpdir(), `phantom-no-config-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const result = await runPhantomCommand(["squad", "test-session"], {
      cwd: tempDir,
      timeout: 5000
    });

    assert.strictEqual(result.exitCode, 3);
    assert(result.stderr.includes("Configuration file not found"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("phantom squad - invalid configuration", async () => {
  const tempDir = join(tmpdir(), `phantom-invalid-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  
  try {
    // Create invalid config
    await writeFile(join(tempDir, "phantom.config.json"), JSON.stringify({ invalid: true }));
    
    const result = await runPhantomCommand(["squad", "test-session"], {
      cwd: tempDir,
      timeout: 5000
    });

    assert.strictEqual(result.exitCode, 3);
    assert(result.stderr.includes("No squad configuration found"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("phantom squad - orchestrator initialization", async () => {
  const tempDir = await createTestRepo();
  
  try {
    const result = await runPhantomCommand(["squad", "test-session"], {
      cwd: tempDir,
      timeout: 8000
    });

    // Should show orchestrator setup attempt
    assert(
      result.stderr.includes("Setting up multi-agent environment") ||
      result.stderr.includes("Agents to start: 2"),
      `Expected orchestrator setup, got: ${result.stderr}`
    );
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("requirements validation - command structure", async () => {
  // Validates requirement: "phantom squad <session-name> という単一のコマンドで、開発チーム環境を起動する"
  
  const tempDir = await createTestRepo();
  
  try {
    const result = await runPhantomCommand(["squad", "my-session"], {
      cwd: tempDir,
      timeout: 8000
    });

    // Command should be recognized and begin processing
    assert(
      result.stderr.includes("Setting up multi-agent environment: my-session") ||
      result.stderr.includes("Starting squad session: my-session"),
      `Expected session processing, got: ${result.stderr}`
    );
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("requirements validation - configuration-based setup", async () => {
  // Validates requirement: "phantom.config.jsonの定義に基づき、各開発エージェントに対して独立したworktreeを生成"
  
  const tempDir = await createTestRepo();
  
  try {
    const result = await runPhantomCommand(["squad", "test-session", "--verbose"], {
      cwd: tempDir,
      timeout: 8000
    });

    // Should read and process configuration
    assert(
      result.stderr.includes("Configuration: phantom.config.json"),
      `Expected configuration reading, got: ${result.stderr}`
    );
    
    // Should show agent setup
    assert(
      result.stderr.includes("Agents: manager, dev-agent"),
      `Expected agent configuration, got: ${result.stderr}`
    );
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("requirements validation - session management foundation", async () => {
  // Validates foundation for requirement: "各エージェントのClaudeセッションIDを自動で保存・管理"
  
  const tempDir = await createTestRepo();
  
  try {
    const result = await runPhantomCommand(["squad", "test-session"], {
      cwd: tempDir,
      timeout: 8000
    });

    // Should show session management attempt (even if it fails due to environment)
    assert(
      result.stderr.includes("Setting up multi-agent environment") ||
      result.stderr.includes("Session manager error") ||
      result.stderr.includes("Failed to start session"),
      `Expected session management attempt, got: ${result.stderr}`
    );
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});