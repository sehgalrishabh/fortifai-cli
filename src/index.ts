#!/usr/bin/env node
import { Command } from "commander";
import { registerScanCommand } from "./commands/scan.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerCiInitCommand } from "./commands/ci-init.js";
import pkg from "../package.json" with { type: "json" };
export const DEFAULT_BACKEND_URL = "https://getfortifai.com";

const program = new Command();

program
  .name("fortifai")
  .description(pkg.description)
  .version(pkg.version)
  .alias("@fortifai/cli");

registerScanCommand(program);
registerAuthCommand(program);
registerCiInitCommand(program);

program.parse(process.argv);
