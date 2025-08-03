import { parseArgs } from "node:util";
import { exitCodes, exitWithError, exitWithSuccess } from "../errors.ts";
import { output } from "../output.ts";

export async function claudeHandler(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      interactive: {
        type: "boolean",
        short: "i",
      },
      context: {
        type: "string",
        short: "c",
      },
      model: {
        type: "string",
        short: "m",
      },
      temperature: {
        type: "string",
        short: "t",
      },
      file: {
        type: "string",
        short: "f",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  try {
    if (values.interactive) {
      output.log("Claude AI: Interactive mode");
      output.log("Starting interactive Claude session...");
      output.log("This feature will start an interactive chat with Claude AI.");
      exitWithSuccess();
      return;
    }

    if (positionals.length === 0 && !values.file) {
      output.log("Claude AI: Main interface");
      output.log(
        "Use --interactive for chat mode or provide a prompt as argument.",
      );
      output.log("Use --file to process a file with Claude.");
      exitWithSuccess();
      return;
    }

    if (values.file) {
      output.log(`Claude AI: Processing file '${values.file}'`);
      output.log(
        "This feature will process the specified file with Claude AI.",
      );

      if (values.context) {
        output.log(`Using context: ${values.context}`);
      }

      exitWithSuccess();
      return;
    }

    const prompt = positionals.join(" ");
    if (prompt) {
      output.log("Claude AI: Processing prompt");
      output.log(`Prompt: "${prompt}"`);

      if (values.model) {
        output.log(`Using model: ${values.model}`);
      }

      if (values.temperature) {
        output.log(`Temperature setting: ${values.temperature}`);
      }

      if (values.context) {
        output.log(`Context: ${values.context}`);
      }

      output.log(
        "This feature will send your prompt to Claude AI and return the response.",
      );
    }

    exitWithSuccess();
  } catch (error) {
    exitWithError(
      error instanceof Error ? error.message : String(error),
      exitCodes.generalError,
    );
  }
}
