# Phantom Configuration

## Table of Contents

- [Configuration File](#configuration-file)
- [Configuration Options](#configuration-options)
  - [defaultBranch](#defaultbranch)
  - [worktreesDirectory](#worktreebasedirectory)
  - [squad](#squad)
  - [postCreate.copyFiles](#postcreatecopyfiles)
  - [postCreate.commands](#postcreatecommands)
  - [preDelete.commands](#predeletecommands)

Phantom supports configuration through a `phantom.config.json` file in your repository root. This allows you to define files to be automatically copied and commands to be executed when creating new worktrees.

## Configuration File

Create a `phantom.config.json` file in your repository root:

```json
{
  "defaultBranch": "main",
  "worktreesDirectory": "../phantom-worktrees",
  "squad": {
    "agents": [
      {
        "name": "manager",
        "prompt": ".claude/roles/manager.md",
        "worktree": false
      },
      {
        "name": "developer",
        "prompt": ".claude/roles/developer.md",
        "worktree": true
      },
      {
        "name": "tester",
        "prompt": ".claude/roles/tester.md",
        "worktree": true
      }
    ],
    "layout": "auto"
  },
  "postCreate": {
    "copyFiles": [
      ".env",
      ".env.local",
      "config/local.json"
    ],
    "commands": [
      "pnpm install",
      "pnpm build"
    ]
  },
  "preDelete": {
    "commands": [
      "pnpm run cleanup"
    ]
  }
}
```

## Configuration Options

### defaultBranch

The default base branch to use for the `phantom review` command when no `--base` option is specified.

**Default:** `"main"`

**Example:**
```json
{
  "defaultBranch": "develop"
}
```

**Use Cases:**
- Projects that use `develop` as the main development branch
- Projects with custom main branch names (e.g., `master`, `trunk`, `stable`)
- Different environments requiring different base branches

**Notes:**
- Used by the `phantom review` command when `--base` is not specified
- Falls back to `"main"` if not configured
- Must be a valid branch reference

### worktreesDirectory

A custom base directory where Phantom worktrees will be created. By default, Phantom creates all worktrees in `.git/phantom/worktrees/`, but you can customize this location using the `worktreesDirectory` option.

**Use Cases:**
- Store worktrees outside the main repository directory
- Use a shared location for multiple repositories
- Keep worktrees on a different filesystem or drive
- Organize worktrees in a custom directory structure

**Examples:**

**Relative path (relative to repository root):**
```json
{
  "worktreesDirectory": "../phantom-worktrees"
}
```
This creates worktrees directly in `../phantom-worktrees/` (e.g., `../phantom-worktrees/feature-1`)

**Absolute path:**
```json
{
  "worktreesDirectory": "/tmp/my-phantom-worktrees"
}
```
This creates worktrees directly in `/tmp/my-phantom-worktrees/` (e.g., `/tmp/my-phantom-worktrees/feature-1`)

**Directory Structure:**
With `worktreesDirectory` set to `../phantom-worktrees`, your directory structure will look like:

```
parent-directory/
├── your-project/           # Git repository
│   ├── .git/
│   ├── phantom.config.json
│   └── ...
└── phantom-worktrees/      # Custom worktree location
    ├── feature-1/
    ├── feature-2/
    └── bugfix-login/
```

**Notes:**
- If `worktreesDirectory` is not specified, defaults to `.git/phantom/worktrees`
- Relative paths are resolved from the repository root
- Absolute paths are used as-is
- The directory will be created automatically if it doesn't exist
- When worktreesDirectory is specified, worktrees are created directly in that directory

### squad

Configuration for multi-agent development environments. Defines agents that can work collaboratively in tmux sessions.

**Structure:**
```json
{
  "squad": {
    "agents": [
      {
        "name": "string",
        "prompt": "string",
        "worktree": boolean
      }
    ],
    "layout": "string"
  }
}
```

**Agent Properties:**
- `name` - Unique identifier for the agent (used for tmux pane naming)
- `prompt` - Path to the prompt file (relative to project root)
- `worktree` - Whether this agent should have its own dedicated worktree

**Layout Options:**
- `"auto"` - Automatically select best layout based on agent count (recommended)
- `"grid"` - Arrange panes in a grid pattern
- `"main-vertical"` - One main pane on left, others split vertically on right
- `"main-horizontal"` - One main pane on top, others split horizontally below

**Use Cases:**
- **Collaborative Development** - Multiple agents working on different aspects of the same feature
- **Code Review** - Dedicated agents for review, testing, and documentation
- **Feature Development** - Frontend, backend, and testing agents working in parallel
- **Debugging** - Specialized agents for different debugging approaches

**Examples:**

**Small Team (2-3 agents):**
```json
{
  "squad": {
    "agents": [
      {
        "name": "architect",
        "prompt": ".claude/roles/architect.md",
        "worktree": false
      },
      {
        "name": "frontend",
        "prompt": ".claude/roles/frontend.md",
        "worktree": true
      },
      {
        "name": "backend",
        "prompt": ".claude/roles/backend.md",
        "worktree": true
      }
    ],
    "layout": "main-vertical"
  }
}
```

**Large Team (4+ agents):**
```json
{
  "squad": {
    "agents": [
      {
        "name": "manager",
        "prompt": ".claude/roles/manager.md",
        "worktree": false
      },
      {
        "name": "frontend",
        "prompt": ".claude/roles/frontend.md",
        "worktree": true
      },
      {
        "name": "backend",
        "prompt": ".claude/roles/backend.md",
        "worktree": true
      },
      {
        "name": "tester",
        "prompt": ".claude/roles/tester.md",
        "worktree": true
      },
      {
        "name": "reviewer",
        "prompt": ".claude/roles/reviewer.md",
        "worktree": false
      }
    ],
    "layout": "auto"
  }
}
```

**Specialized Workflows:**
```json
{
  "squad": {
    "agents": [
      {
        "name": "researcher",
        "prompt": ".claude/roles/researcher.md",
        "worktree": false
      },
      {
        "name": "implementer",
        "prompt": ".claude/roles/implementer.md",
        "worktree": true
      },
      {
        "name": "optimizer",
        "prompt": ".claude/roles/optimizer.md",
        "worktree": true
      },
      {
        "name": "documenter",
        "prompt": ".claude/roles/documenter.md",
        "worktree": false
      }
    ],
    "layout": "grid"
  }
}
```

**Requirements:**
- Each agent must have a corresponding prompt file
- Agent names must be unique within the squad
- At least one agent is required
- tmux must be installed to use squad functionality

**Notes:**
- Agents with `worktree: false` share the main project directory
- Agents with `worktree: true` get their own isolated working environment
- Prompt files should contain role-specific instructions for the agent
- Squad sessions can be resumed and will reconnect to existing worktrees
- Each agent runs in its own tmux pane for parallel operation

### postCreate.copyFiles

An array of file paths to automatically copy from the current worktree to newly created worktrees.

**Use Cases:**
- Environment configuration files (`.env`, `.env.local`)
- Local development settings
- Secret files that are gitignored
- Database configuration files
- API keys and certificates

**Example:**
```json
{
  "postCreate": {
    "copyFiles": [
      ".env",
      ".env.local",
      "config/database.local.yml"
    ]
  }
}
```

**Notes:**
- Paths are relative to the repository root
- Currently, glob patterns are not supported
- Files must exist in the source worktree
- Non-existent files are silently skipped
- Can be overridden with `--copy-file` command line options

### postCreate.commands

An array of commands to execute after creating a new worktree.

**Use Cases:**
- Installing dependencies
- Building the project
- Setting up the development environment
- Running database migrations
- Generating configuration files

**Example:**
```json
{
  "postCreate": {
    "commands": [
      "pnpm install",
      "pnpm db:migrate",
      "pnpm db:seed"
    ]
  }
}
```

**Notes:**
- Commands are executed in order
- Execution stops on the first failed command
- Commands run in the new worktree's directory
- Output is displayed in real-time

### preDelete.commands

An array of commands to execute before deleting a worktree. Useful for cleanup operations.

**Use Cases:**
- Stopping running services
- Cleaning up temporary files
- Backing up important data
- Notifying external systems
- Running test cleanup

**Example:**
```json
{
  "preDelete": {
    "commands": [
      "pnpm run stop-services",
      "pnpm run cleanup-temp",
      "rm -rf .cache"
    ]
  }
}
```

**Notes:**
- Commands are executed in order
- Commands run in the worktree's directory before deletion
- Failed commands won't prevent deletion (warnings are shown)
- Output is displayed in real-time
- Useful for graceful shutdown of services

## Best Practices

### Squad Configuration

1. **Start Small** - Begin with 2-3 agents and expand as needed
2. **Clear Roles** - Give each agent a specific, well-defined role
3. **Balanced Workload** - Distribute work appropriately between agents
4. **Shared vs Dedicated** - Use `worktree: false` for coordination agents, `worktree: true` for implementation

### Prompt Files

Create clear, specific prompt files for each agent:

```markdown
# .claude/roles/frontend.md

You are a frontend development specialist focused on React applications.

## Responsibilities
- Implement UI components
- Handle state management
- Ensure responsive design
- Write component tests

## Guidelines
- Use TypeScript for all new code
- Follow the existing component structure
- Ensure accessibility standards
- Write unit tests for components

## Tools Available
- React DevTools
- Storybook for component development
- Jest for testing
```

### File Organization

```
project-root/
├── phantom.config.json
├── .claude/
│   ├── roles/
│   │   ├── manager.md
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   └── tester.md
│   └── settings.local.json
└── worktrees/           # Custom worktree location
    ├── frontend-work/
    ├── backend-work/
    └── testing-work/
```

### Performance Tips

- **Limit Agents** - More than 6 agents can become difficult to manage
- **Use Shared Worktrees** - For coordination and documentation agents
- **Optimize Layout** - Choose appropriate tmux layout for your screen size
- **Resource Management** - Be mindful of system resources with multiple agents

## Troubleshooting

### Common Issues

1. **Squad won't start**
   - Check that `phantom.config.json` exists and has valid `squad` configuration
   - Verify all prompt files exist at specified paths
   - Ensure tmux is installed and accessible

2. **Agent prompt file not found**
   - Check file paths are relative to project root
   - Verify file permissions are readable
   - Ensure files exist and contain valid markdown

3. **Tmux layout issues**
   - Try `"auto"` layout for automatic optimization
   - Ensure terminal window is large enough
   - Check tmux version compatibility

4. **Performance problems**
   - Reduce number of agents
   - Use shared worktrees where possible
   - Check system resource usage

### Getting Help

- Use `phantom init` to create initial configuration
- Check the [Commands Reference](./commands.md) for usage examples
- Review existing configurations in the repository
- Use `phantom squad --verbose` for detailed output

