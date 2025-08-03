import type { CommandHelp } from "../help.ts";

export const initHelp: CommandHelp = {
  name: "init",
  description: "Initialize phantom configuration interactively",
  usage: "phantom init [options]",
  options: [
    {
      name: "force",
      short: "f",
      type: "boolean",
      description: "Overwrite existing configuration without confirmation",
    },
  ],
  examples: [
    {
      description: "Initialize configuration with interactive prompts",
      command: "phantom init",
    },
    {
      description: "Force overwrite existing configuration",
      command: "phantom init --force",
    },
  ],
  notes: [
    "Creates a phantom.config.json file in the git root directory",
    "Prompts for basic settings, squad configuration, and hooks",
    "Squad configuration includes agents with tmux layout options",
    "Post-create hooks can copy files and run commands",
    "Pre-delete hooks can run cleanup commands",
  ],
};