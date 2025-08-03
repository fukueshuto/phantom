import type { CommandHelp } from "../help.ts";

export const claudeHelp: CommandHelp = {
  name: "claude",
  description:
    "Start or resume a Claude Code session",
  usage: "phantom claude [OPTIONS]",
  options: [
    {
      name: "session-name",
      short: "s",
      type: "string",
      description: "Custom session name (default: current directory name)",
      example: "--session-name my-proj",
    },
    {
      name: "list",
      short: "l",
      type: "boolean",
      description: "List all saved sessions",
    },
    {
      name: "remove",
      short: "r",
      type: "string",
      description: "Remove a saved session",
      example: "--remove my-proj",
    },
    {
      name: "help",
      short: "h",
      type: "boolean",
      description: "Show this help message",
    },
  ],
  examples: [
    {
      description: "Start/resume session with auto-generated name",
      command: "phantom claude",
    },
    {
      description: "Start/resume session named 'my-proj'",
      command: "phantom claude -s my-proj",
    },
    {
      description: "List all saved sessions",
      command: "phantom claude -l",
    },
    {
      description: "Remove session named 'my-proj'",
      command: "phantom claude -r my-proj",
    },
  ],
  notes: [
    "The session will be automatically named based on the current directory",
    "unless a custom name is provided with --session-name.",
    "Sessions are managed using Claude Code's session system.",
    "Each session maintains its own context and history."
  ],
};
