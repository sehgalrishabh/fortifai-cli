import { existsSync, promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import readline from "node:readline";
import type { Command } from "commander";

const CONFIG_FILES = [
  "fortifai.config.js",
  "fortifai.config.ts",
  "fortifai.config.yaml",
  "fortifai.config.yml",
];

async function promptForApiKey(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("Enter your FortifAI API Key: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isValidApiKey(key: string): boolean {
  return key.startsWith("fai_") && key.length > 10;
}

async function saveApiKey(startDir: string, apiKey: string): Promise<string> {
  let currentDir = resolve(startDir);
  let foundPath: string | null = null;
  let foundFile: string | null = null;

  while (true) {
    for (const file of CONFIG_FILES) {
      const fullPath = join(currentDir, file);
      if (existsSync(fullPath)) {
        foundPath = fullPath;
        foundFile = file;
        break;
      }
    }

    if (foundPath) break;

    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) break; // reached filesystem root
    currentDir = parentDir;
  }

  if (foundPath && foundFile) {
    let content = await fs.readFile(foundPath, "utf-8");

    if (content.match(/apiKey:\s*['"`][^'"`]*['"`]/)) {
      content = content.replace(
        /(apiKey:\s*['"`])[^'"`]*(['"`])/,
        `$1${apiKey}$2`,
      );
    } else if (foundFile.endsWith(".yaml") || foundFile.endsWith(".yml")) {
      content += `\napiKey: "${apiKey}"\n`;
    } else {
      const lastBraceIndex = content.lastIndexOf("}");
      if (lastBraceIndex !== -1) {
        content =
          content.slice(0, lastBraceIndex) +
          `  apiKey: "${apiKey}",\n` +
          content.slice(lastBraceIndex);
      } else {
        throw new Error(
          `Could not automatically instrument ${foundFile}. Please manually add: apiKey: "${apiKey}"`,
        );
      }
    }

    await fs.writeFile(foundPath, content, "utf-8");
    return foundPath;
  }

  // Fallback: If no config exists anywhere up the tree, create one in the directory where the command was executed.
  const defaultPath = join(resolve(startDir), "fortifai.config.js");
  const defaultContent = `export default {\n  apiKey: "${apiKey}",\n  agents: []\n};\n`;
  await fs.writeFile(defaultPath, defaultContent, "utf-8");
  return defaultPath;
}

interface AuthCommandOptions {
  apiKey?: string;
  config?: string;
}

export function registerAuthCommand(program: Command): void {
  program
    .command("auth")
    .description("Authenticate the CLI with your FortifAI API key")
    .option(
      "--api-key <key>",
      "Provide the API key directly (avoids interactive prompt)",
    )
    .option(
      "--config <path>",
      "Path to working directory containing fortifai config",
    )
    .action(async (opts: AuthCommandOptions) => {
      const cwd = resolve(opts.config ?? process.cwd());

      let apiKey = opts.apiKey;
      if (!apiKey) {
        console.log(`\nFortifAI CLI - Authentication`);
        console.log(
          `Get your API key from the dashboard: https://app.fortifai.com/dashboard/settings\n`,
        );
        apiKey = await promptForApiKey();
      }

      if (!apiKey || !isValidApiKey(apiKey)) {
        console.error(
          "\nx Error: Invalid API key format. Must start with 'fai_'.",
        );
        process.exit(1);
      }

      try {
        const updatedFile = await saveApiKey(cwd, apiKey);
        console.log(`\n✓ API key successfully saved to ${updatedFile}`);
        console.log(`You are now authenticated and can run 'fortifai scan'.\n`);
      } catch (error) {
        console.error(`\nx Error saving API key: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
