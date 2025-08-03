import type { CommandHelp } from "../help.ts";

export const claudeHelp: CommandHelp = {
  name: "claude",
  description:
    "Interact with Claude AI for code assistance, review, and development tasks",
  usage: "phantom claude [prompt] [options]",
  options: [
    {
      name: "interactive",
      short: "i",
      type: "boolean",
      description: "Start an interactive chat session with Claude AI",
    },
    {
      name: "context",
      short: "c",
      type: "string",
      description: "Provide additional context for the AI interaction",
      example: "--context 'This is a TypeScript project using React'",
    },
    {
      name: "model",
      short: "m",
      type: "string",
      description: "Specify which Claude model to use for the interaction",
      example: "--model claude-3-sonnet",
    },
    {
      name: "temperature",
      short: "t",
      type: "string",
      description: "Set the creativity/randomness level (0.0 to 1.0)",
      example: "--temperature 0.7",
    },
    {
      name: "file",
      short: "f",
      type: "string",
      description: "Process a specific file with Claude AI",
      example: "--file src/components/Button.tsx",
    },
  ],
  examples: [
    {
      description: "Start an interactive chat with Claude",
      command: "phantom claude --interactive",
    },
    {
      description: "Ask Claude to review a specific file",
      command:
        "phantom claude --file src/auth.ts 'Please review this authentication code'",
    },
    {
      description: "Get help with a coding problem",
      command:
        "phantom claude 'How do I implement JWT authentication in TypeScript?'",
    },
    {
      description: "Use Claude with specific context",
      command:
        "phantom claude --context 'React TypeScript project' 'Generate a custom hook for API calls'",
    },
    {
      description: "Use a specific model with custom temperature",
      command:
        "phantom claude --model claude-3-opus --temperature 0.3 'Optimize this database query'",
    },
    {
      description: "Process a file with additional context",
      command:
        "phantom claude --file package.json --context 'Node.js backend' 'Suggest security improvements'",
    },
  ],
  notes: [
    "Claude AI integration requires valid API credentials",
    "Interactive mode provides a continuous conversation experience",
    "File processing analyzes code and provides suggestions or explanations",
    "Context helps Claude understand your project structure and requirements",
    "Different models have varying capabilities and response speeds",
  ],
};
