import assert from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { isErr, isOk } from "@aku11i/phantom-shared";
import { ConfigNotFoundError, ConfigParseError, loadConfig } from "./loader.ts";
import { ConfigValidationError } from "./validate.ts";

describe("loadConfig", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "phantom-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("should load valid config file", async () => {
    const config = {
      postCreate: {
        copyFiles: [".env", "config.json"],
      },
    };
    await writeFile(
      path.join(tempDir, "phantom.config.json"),
      JSON.stringify(config),
    );

    const result = await loadConfig(tempDir);

    assert.strictEqual(isOk(result), true);
    if (isOk(result)) {
      assert.deepStrictEqual(result.value, config);
    }
  });

  test("should return ConfigNotFoundError when file doesn't exist", async () => {
    const result = await loadConfig(tempDir);

    assert.strictEqual(isErr(result), true);
    if (isErr(result)) {
      assert.ok(result.error instanceof ConfigNotFoundError);
    }
  });

  test("should return ConfigParseError for invalid JSON", async () => {
    await writeFile(
      path.join(tempDir, "phantom.config.json"),
      "{ invalid json",
    );

    const result = await loadConfig(tempDir);

    assert.strictEqual(isErr(result), true);
    if (isErr(result)) {
      assert.ok(result.error instanceof ConfigParseError);
    }
  });

  test("should load config with only copyFiles", async () => {
    const config = {
      postCreate: {
        copyFiles: [".env", "config.json"],
      },
    };
    await writeFile(
      path.join(tempDir, "phantom.config.json"),
      JSON.stringify(config),
    );

    const result = await loadConfig(tempDir);

    assert.strictEqual(isOk(result), true);
    if (isOk(result)) {
      assert.deepStrictEqual(result.value, config);
    }
  });

  test("should load empty config", async () => {
    await writeFile(path.join(tempDir, "phantom.config.json"), "{}");

    const result = await loadConfig(tempDir);

    assert.strictEqual(isOk(result), true);
    if (isOk(result)) {
      assert.deepStrictEqual(result.value, {});
    }
  });

  describe("validation", () => {
    test("should return ConfigValidationError when config is not an object", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify("string config"),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: Expected object, received string",
        );
      }
    });

    test("should return ConfigValidationError when config is null", async () => {
      await writeFile(path.join(tempDir, "phantom.config.json"), "null");

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: Expected object, received null",
        );
      }
    });

    test("should return ConfigValidationError when postCreate is not an object", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify({ postCreate: "invalid" }),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: postCreate: Expected object, received string",
        );
      }
    });

    test("should return ConfigValidationError when postCreate is null", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify({ postCreate: null }),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: postCreate: Expected object, received null",
        );
      }
    });

    test("should return ConfigValidationError when copyFiles is not an array", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify({ postCreate: { copyFiles: "invalid" } }),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: postCreate.copyFiles: Expected array, received string",
        );
      }
    });

    test("should return ConfigValidationError when copyFiles contains non-string values", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify({ postCreate: { copyFiles: [123, true] } }),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: postCreate.copyFiles.0: Expected string, received number",
        );
      }
    });

    test("should accept valid config with postCreate but no copyFiles", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify({ postCreate: {} }),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isOk(result), true);
      if (isOk(result)) {
        assert.deepStrictEqual(result.value, { postCreate: {} });
      }
    });

    test("should return ConfigValidationError when config is an array", async () => {
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify([]),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.strictEqual(
          result.error.message,
          "Invalid phantom.config.json: Expected object, received array",
        );
      }
    });
  });

  describe("squad configuration validation", () => {
    test("should load valid squad config", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "developer",
              prompt: "./prompts/developer.md",
              worktree: true,
            },
            {
              name: "reviewer",
              prompt: "./prompts/reviewer.md",
              worktree: false,
            },
          ],
          layout: "grid",
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isOk(result), true);
      if (isOk(result)) {
        assert.deepStrictEqual(result.value, config);
      }
    });

    test("should use default layout when not specified", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "developer",
              prompt: "./prompts/developer.md",
            },
          ],
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isOk(result), true);
      if (isOk(result)) {
        // Default layout should be "auto"
        assert.strictEqual(result.value.squad.layout, "auto");
        // Default worktree should be false
        assert.strictEqual(result.value.squad.agents[0].worktree, false);
      }
    });

    test("should return error when squad.agents is empty", async () => {
      const config = {
        squad: {
          agents: [],
          layout: "grid",
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.ok(result.error.message.includes("agents"));
      }
    });

    test("should return error when agent name is empty", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "",
              prompt: "./prompts/developer.md",
            },
          ],
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.ok(result.error.message.includes("name"));
      }
    });

    test("should return error when agent name is too long", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "a".repeat(21), // 21 characters, max is 20
              prompt: "./prompts/developer.md",
            },
          ],
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.ok(result.error.message.includes("name"));
      }
    });

    test("should return error when prompt is missing", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "developer",
            },
          ],
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.ok(result.error.message.includes("prompt"));
      }
    });

    test("should return error when layout is invalid", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "developer",
              prompt: "./prompts/developer.md",
            },
          ],
          layout: "invalid-layout",
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isErr(result), true);
      if (isErr(result)) {
        assert.ok(result.error instanceof ConfigValidationError);
        assert.ok(result.error.message.includes("layout"));
      }
    });

    test("should accept all valid layout options", async () => {
      const layouts = ["auto", "grid", "main-vertical"];

      for (const layout of layouts) {
        const config = {
          squad: {
            agents: [
              {
                name: "developer",
                prompt: "./prompts/developer.md",
              },
            ],
            layout,
          },
        };
        await writeFile(
          path.join(tempDir, "phantom.config.json"),
          JSON.stringify(config),
        );

        const result = await loadConfig(tempDir);

        assert.strictEqual(isOk(result), true, `Layout ${layout} should be valid`);
        if (isOk(result)) {
          assert.strictEqual(result.value.squad.layout, layout);
        }
      }
    });

    test("should handle complex squad configuration", async () => {
      const config = {
        squad: {
          agents: [
            {
              name: "manager",
              prompt: "./prompts/manager.md",
              worktree: false,
            },
            {
              name: "dev-frontend",
              prompt: "./prompts/frontend.md",
              worktree: true,
            },
            {
              name: "dev-backend",
              prompt: "./prompts/backend.md",
              worktree: true,
            },
            {
              name: "tester",
              prompt: "./prompts/tester.md",
              worktree: false,
            },
          ],
          layout: "main-vertical",
        },
        postCreate: {
          copyFiles: [".env", "package.json"],
          commands: ["npm install"],
        },
      };
      await writeFile(
        path.join(tempDir, "phantom.config.json"),
        JSON.stringify(config),
      );

      const result = await loadConfig(tempDir);

      assert.strictEqual(isOk(result), true);
      if (isOk(result)) {
        assert.deepStrictEqual(result.value, config);
        assert.strictEqual(result.value.squad.agents.length, 4);
        assert.strictEqual(result.value.squad.layout, "main-vertical");
      }
    });
  });
});
