import type { CommandHelp } from "../help.ts";

export const squadHelp: CommandHelp = {
  name: "squad",
  description:
    "Manage and coordinate development squads for collaborative worktree management",
  usage: "phantom squad [command] [options]",
  options: [
    {
      name: "list",
      short: "l",
      type: "boolean",
      description: "List all active squad members and their assigned roles",
    },
    {
      name: "status",
      short: "s",
      type: "boolean",
      description: "Show the current status and activity of the squad",
    },
    {
      name: "verbose",
      short: "v",
      type: "boolean",
      description: "Show detailed information about squad operations",
    },
  ],
  examples: [
    {
      description: "List all squad members",
      command: "phantom squad --list",
    },
    {
      description: "Check squad status",
      command: "phantom squad --status",
    },
    {
      description: "Add a new member to the squad",
      command: "phantom squad add john-doe",
    },
    {
      description: "Remove a member from the squad",
      command: "phantom squad remove jane-smith",
    },
    {
      description: "Assign a task to a squad member",
      command: "phantom squad assign alice implement-auth-feature",
    },
    {
      description: "View detailed squad information",
      command: "phantom squad --status --verbose",
    },
  ],
  notes: [
    "Squad management helps coordinate multiple developers working on the same project",
    "Each squad member can have different roles and responsibilities",
    "Use squad commands to track task assignments and progress",
    "Squad status shows real-time information about active worktrees and assignments",
  ],
};
