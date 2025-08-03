import { isOk } from "@aku11i/phantom-shared";
import { type PhantomConfig, loadConfig } from "./config/loader.ts";
import type { SquadConfig } from "./config/validate.ts";
import { getWorktreesDirectory } from "./paths.ts";

export interface Context {
  gitRoot: string;
  worktreesDirectory: string;
  config: PhantomConfig | null;
  squad: SquadConfig | null;
}

export async function createContext(gitRoot: string): Promise<Context> {
  const configResult = await loadConfig(gitRoot);
  const config = isOk(configResult) ? configResult.value : null;
  const worktreesDirectory = config?.worktreesDirectory;

  // Extract squad configuration from config, defaulting to null if not present
  const squad = config?.squad ?? null;

  return {
    gitRoot,
    worktreesDirectory: getWorktreesDirectory(gitRoot, worktreesDirectory),
    config,
    squad,
  };
}
