import { type Result, err, ok } from "@aku11i/phantom-shared";
import { z } from "zod";
import type { PhantomConfig } from "./loader.ts";

// Squad-related schemas
export const agentSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(20)
    .describe("エージェント名（Tmuxペインのタイトルにも使用）"),
  prompt: z.string().describe("役割指示プロンプトファイルへの相対パス"),
  worktree: z
    .boolean()
    .default(false)
    .describe("独立したworktreeを作成するかどうか"),
});

export const squadConfigSchema = z.object({
  agents: z.array(agentSchema).min(1),
  layout: z.enum(["auto", "grid", "main-vertical"]).default("auto"),
});

// Export TypeScript types
export type Agent = z.infer<typeof agentSchema>;
export type SquadConfig = z.infer<typeof squadConfigSchema>;

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`Invalid phantom.config.json: ${message}`);
    this.name = this.constructor.name;
  }
}

export const phantomConfigSchema = z
  .object({
    squad: squadConfigSchema.optional(),
    postCreate: z
      .object({
        copyFiles: z.array(z.string()).optional(),
        commands: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    preDelete: z
      .object({
        commands: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    worktreesDirectory: z.string().optional(),
    defaultBranch: z.string().optional(),
  })
  .passthrough();

export function validateConfig(
  config: unknown,
): Result<PhantomConfig, ConfigValidationError> {
  const result = phantomConfigSchema.safeParse(config);

  if (!result.success) {
    const error = result.error;

    // Get the first error message from Zod's formatted output
    const firstError = error.errors[0];
    const path = firstError.path.join(".");
    const message = path
      ? `${path}: ${firstError.message}`
      : firstError.message;

    return err(new ConfigValidationError(message));
  }

  return ok(result.data as PhantomConfig);
}
