import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getGitRoot } from "@aku11i/phantom-git";
import inquirer from "inquirer";
import type { Agent, SquadConfig } from "@aku11i/phantom-core";
import { exitCodes, exitWithError, exitWithSuccess } from "../errors.ts";
import { output } from "../output.ts";

interface PhantomInitConfig {
  squad?: SquadConfig;
  postCreate?: {
    copyFiles?: string[];
    commands?: string[];
  };
  preDelete?: {
    commands?: string[];
  };
  worktreesDirectory?: string;
  defaultBranch?: string;
}

export async function initHandler(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      force: {
        type: "boolean",
        short: "f",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  const force = values.force ?? false;

  try {
    const gitRoot = await getGitRoot();
    const configPath = join(gitRoot, "phantom.config.json");

    // Check if config already exists
    try {
      await access(configPath);
      if (!force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: "confirm",
            name: "overwrite",
            message: "phantom.config.json already exists. Overwrite?",
            default: false,
          },
        ]);

        if (!overwrite) {
          output.log("Initialization cancelled.");
          exitWithSuccess();
        }
      }
    } catch {
      // File doesn't exist, continue
    }

    output.log("Welcome to Phantom configuration setup!\n");

    // Ask basic configuration questions
    const basicAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "worktreesDirectory",
        message: "Worktrees directory (relative to git root):",
        default: "worktrees",
        validate: (input: string) => input.trim().length > 0 || "Directory name cannot be empty",
      },
      {
        type: "input",
        name: "defaultBranch",
        message: "Default branch name:",
        default: "main",
        validate: (input: string) => input.trim().length > 0 || "Branch name cannot be empty",
      },
      {
        type: "confirm",
        name: "enableSquad",
        message: "Do you want to configure a development squad?",
        default: false,
      },
    ]);

    const config: PhantomInitConfig = {
      worktreesDirectory: basicAnswers.worktreesDirectory,
      defaultBranch: basicAnswers.defaultBranch,
    };

    // Configure squad if requested
    if (basicAnswers.enableSquad) {
      output.log("\nConfiguring development squad...\n");
      
      const agents: Agent[] = [];
      let addMoreAgents = true;

      while (addMoreAgents) {
        const agentAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: `Agent ${agents.length + 1} name:`,
            validate: (input: string) => {
              const trimmed = input.trim();
              if (trimmed.length === 0) return "Agent name cannot be empty";
              if (trimmed.length > 20) return "Agent name must be 20 characters or less";
              if (agents.some(a => a.name === trimmed)) return "Agent name must be unique";
              return true;
            },
          },
          {
            type: "input",
            name: "prompt",
            message: "Prompt file path (relative to project root):",
            default: (answers: any) => `.claude/roles/${answers.name}.md`,
            validate: (input: string) => input.trim().length > 0 || "Prompt file path cannot be empty",
          },
          {
            type: "confirm",
            name: "worktree",
            message: "Should this agent have its own worktree?",
            default: false,
          },
        ]);

        agents.push({
          name: agentAnswers.name,
          prompt: agentAnswers.prompt,
          worktree: agentAnswers.worktree,
        });

        const { continueAdding } = await inquirer.prompt([
          {
            type: "confirm",
            name: "continueAdding",
            message: "Add another agent?",
            default: false,
          },
        ]);

        addMoreAgents = continueAdding;
      }

      if (agents.length > 0) {
        const layoutAnswer = await inquirer.prompt([
          {
            type: "list",
            name: "layout",
            message: "Tmux layout for squad:",
            choices: [
              { name: "Auto (recommended)", value: "auto" },
              { name: "Grid", value: "grid" },
              { name: "Main-vertical", value: "main-vertical" },
            ],
            default: "auto",
          },
        ]);

        config.squad = {
          agents,
          layout: layoutAnswer.layout,
        };
      }
    }

    // Ask about post-create configuration
    const { configPostCreate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "configPostCreate",
        message: "Configure post-create hooks (copy files, run commands)?",
        default: false,
      },
    ]);

    if (configPostCreate) {
      const postCreateAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "copyFiles",
          message: "Files to copy to new worktrees (comma-separated, optional):",
          filter: (input: string) => {
            const trimmed = input.trim();
            return trimmed ? trimmed.split(",").map(f => f.trim()).filter(f => f.length > 0) : [];
          },
        },
        {
          type: "input",
          name: "commands",
          message: "Commands to run after worktree creation (comma-separated, optional):",
          filter: (input: string) => {
            const trimmed = input.trim();
            return trimmed ? trimmed.split(",").map(c => c.trim()).filter(c => c.length > 0) : [];
          },
        },
      ]);

      if (postCreateAnswers.copyFiles.length > 0 || postCreateAnswers.commands.length > 0) {
        config.postCreate = {};
        if (postCreateAnswers.copyFiles.length > 0) {
          config.postCreate.copyFiles = postCreateAnswers.copyFiles;
        }
        if (postCreateAnswers.commands.length > 0) {
          config.postCreate.commands = postCreateAnswers.commands;
        }
      }
    }

    // Ask about pre-delete configuration
    const { configPreDelete } = await inquirer.prompt([
      {
        type: "confirm",
        name: "configPreDelete",
        message: "Configure pre-delete hooks (cleanup commands)?",
        default: false,
      },
    ]);

    if (configPreDelete) {
      const preDeleteAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "commands",
          message: "Commands to run before worktree deletion (comma-separated, optional):",
          filter: (input: string) => {
            const trimmed = input.trim();
            return trimmed ? trimmed.split(",").map(c => c.trim()).filter(c => c.length > 0) : [];
          },
        },
      ]);

      if (preDeleteAnswers.commands.length > 0) {
        config.preDelete = {
          commands: preDeleteAnswers.commands,
        };
      }
    }

    // Write the configuration file
    const configJson = JSON.stringify(config, null, 2);
    await writeFile(configPath, configJson, "utf8");

    output.log(`\n✅ Configuration saved to ${configPath}`);
    
    // Show summary
    output.log("\nConfiguration summary:");
    output.log(`- Worktrees directory: ${config.worktreesDirectory}`);
    output.log(`- Default branch: ${config.defaultBranch}`);
    
    if (config.squad) {
      output.log(`- Squad: ${config.squad.agents.length} agent(s) configured`);
      config.squad.agents.forEach((agent, index) => {
        output.log(`  ${index + 1}. ${agent.name} (${agent.worktree ? 'separate worktree' : 'shared worktree'})`);
      });
    }
    
    if (config.postCreate) {
      if (config.postCreate.copyFiles?.length) {
        output.log(`- Post-create file copying: ${config.postCreate.copyFiles.length} file(s)`);
      }
      if (config.postCreate.commands?.length) {
        output.log(`- Post-create commands: ${config.postCreate.commands.length} command(s)`);
      }
    }
    
    if (config.preDelete?.commands?.length) {
      output.log(`- Pre-delete commands: ${config.preDelete.commands.length} command(s)`);
    }

    output.log("\nYou can now use `phantom create`, `phantom squad`, and other commands!");
    
    exitWithSuccess();
  } catch (error) {
    exitWithError(
      error instanceof Error ? error.message : String(error),
      exitCodes.generalError,
    );
  }
}