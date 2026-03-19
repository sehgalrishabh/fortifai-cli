import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import yaml from "js-yaml";
import type { CliConfig } from "../types/index.js";

const CONFIG_FILES = [
    "fortifai.config.js",
    "fortifai.config.ts",
    "fortifai.config.yaml",
    "fortifai.config.yml",
];

function validate(config: unknown): CliConfig {
    if (!config || typeof config !== "object") {
        throw new Error("Config must be an object");
    }
    const c = config as Record<string, unknown>;
    if (!Array.isArray(c["agents"]) || c["agents"].length === 0) {
        throw new Error('Config must have a non-empty "agents" array');
    }
    for (const agent of c["agents"] as unknown[]) {
        if (!agent || typeof agent !== "object") {
            throw new Error("Each agent entry must be an object");
        }
        const a = agent as Record<string, unknown>;
        if (typeof a["name"] !== "string" || !a["name"]) {
            throw new Error('Each agent entry must have a "name" string field');
        }
        if (typeof a["endpoint"] !== "string" || !a["endpoint"]) {
            throw new Error('Each agent entry must have an "endpoint" string field');
        }
        if (typeof a["inputField"] !== "string" || !a["inputField"]) {
            throw new Error('Each agent entry must have an "inputField" string field');
        }
    }

    const scan = c["scan"];
    if (scan !== undefined) {
        if (!scan || typeof scan !== "object") {
            throw new Error('"scan" must be an object when provided');
        }
        const s = scan as Record<string, unknown>;
        if (s["concurrency"] !== undefined) {
            const concurrency = s["concurrency"];
            if (
                typeof concurrency !== "number" ||
                !Number.isInteger(concurrency) ||
                concurrency < 1
            ) {
                throw new Error('"scan.concurrency" must be an integer >= 1');
            }
        }
        if (s["rateLimitPerSecond"] !== undefined) {
            const rateLimit = s["rateLimitPerSecond"];
            if (
                typeof rateLimit !== "number" ||
                !Number.isFinite(rateLimit) ||
                rateLimit < 0
            ) {
                throw new Error('"scan.rateLimitPerSecond" must be a number >= 0');
            }
        }
    }

    return config as CliConfig;
}

export async function loadConfig(startDir: string = process.cwd()): Promise<CliConfig> {
    let currentDir = resolve(startDir);
    let foundPath: string | null = null;
    let foundExt = "";

    while (true) {
        for (const filename of CONFIG_FILES) {
            const fullPath = join(currentDir, filename);
            if (existsSync(fullPath)) {
                foundPath = fullPath;
                foundExt = filename.split(".").pop() ?? "";
                break;
            }
        }

        if (foundPath) break;

        const parentDir = resolve(currentDir, "..");
        if (parentDir === currentDir) break; // reached filesystem root
        currentDir = parentDir;
    }

    if (!foundPath) {
        throw new Error(
            `No FortifAI config found starting from ${startDir}. ` +
            `Create one of: ${CONFIG_FILES.join(", ")}`
        );
    }

    if (foundExt === "yaml" || foundExt === "yml") {
        const raw = readFileSync(foundPath, "utf-8");
        const parsed = yaml.load(raw);
        return validate(parsed);
    }

    if (foundExt === "js" || foundExt === "ts") {
        // Dynamic import for ESM; require for CJS fallback
        try {
            const mod = await import(resolve(foundPath));
            const cfg = mod.default ?? mod;
            return validate(cfg);
        } catch {
            // Fallback to require for CJS configs
            const _require = createRequire(import.meta.url);
            const cfg = _require(resolve(foundPath));
            return validate(cfg.default ?? cfg);
        }
    }

    throw new Error(`Unsupported config extension: ${foundExt}`);
}
