import { parseArgs } from "node:util";
import { exitCodes, exitWithError, exitWithSuccess } from "../errors.ts";
import { output } from "../output.ts";

export async function squadHandler(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      list: {
        type: "boolean",
        short: "l",
      },
      status: {
        type: "boolean",
        short: "s",
      },
      verbose: {
        type: "boolean",
        short: "v",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  try {
    if (values.list) {
      output.log("Squad management: List feature");
      output.log(
        "This feature will list all active squad members and their roles.",
      );
      exitWithSuccess();
      return;
    }

    if (values.status) {
      output.log("Squad management: Status feature");
      output.log("This feature will show the current status of the squad.");
      exitWithSuccess();
      return;
    }

    if (positionals.length === 0) {
      output.log("Squad management: Main interface");
      output.log(
        "Use --list to see squad members or --status to check squad status.",
      );
      exitWithSuccess();
      return;
    }

    const command = positionals[0];
    const commandArgs = positionals.slice(1);

    switch (command) {
      case "add":
        if (commandArgs.length === 0) {
          exitWithError(
            "Please provide a member name to add to the squad",
            exitCodes.validationError,
          );
        }
        output.log(
          `Squad management: Adding member '${commandArgs[0]}' to squad`,
        );
        output.log(
          "This feature will add a new member to the squad with specified role.",
        );
        break;

      case "remove":
        if (commandArgs.length === 0) {
          exitWithError(
            "Please provide a member name to remove from the squad",
            exitCodes.validationError,
          );
        }
        output.log(
          `Squad management: Removing member '${commandArgs[0]}' from squad`,
        );
        output.log("This feature will remove a member from the squad.");
        break;

      case "assign":
        if (commandArgs.length < 2) {
          exitWithError(
            "Please provide member name and task for assignment",
            exitCodes.validationError,
          );
        }
        output.log(
          `Squad management: Assigning task '${commandArgs[1]}' to '${commandArgs[0]}'`,
        );
        output.log("This feature will assign tasks to squad members.");
        break;

      default:
        exitWithError(
          `Unknown squad command: ${command}`,
          exitCodes.validationError,
        );
    }

    if (values.verbose) {
      output.log("Verbose mode enabled - showing detailed squad information");
    }

    exitWithSuccess();
  } catch (error) {
    exitWithError(
      error instanceof Error ? error.message : String(error),
      exitCodes.generalError,
    );
  }
}
