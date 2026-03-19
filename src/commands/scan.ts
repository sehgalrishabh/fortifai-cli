import { resolve } from "node:path";
import type { Command } from "commander";
import { REQUEST_TIMEOUT_MS } from "../agents/invokeAgent.js";
import { executeAttacks } from "../attacks/executor.js";
import { loadPayloads } from "../attacks/loadPayloads.js";
import { loadConfig } from "../config/loadConfig.js";
import {
  buildLatencySummary,
  buildRequestOutcomes,
  printSummary,
} from "../report/formatter.js";
import { NdjsonWriter } from "../report/ndjsonWriter.js";
import { uploadScanLog } from "../report/uploadReport.js";
import {
  notifyScanStarted,
  notifyScanFailed,
} from "../report/notifyLifecycle.js";
import type { AttackResult } from "../types/index.js";

const CLI_VERSION = "1.1.0";
const SCHEMA_VERSION = "2.0.0";
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_RATE_LIMIT_PER_SECOND = 5;
const CHECKPOINT_INTERVAL_PCT = 10;

function generateScanId(): string {
  return `scan_${Date.now()}`;
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function statusToLabel(status: AttackResult["response"]["status"]): string {
  if (status === "timeout") return "TIMEOUT";
  if (status === "error") return "ERROR";
  return `HTTP ${status}`;
}

function buildProgressBar(percent: number): string {
  const completed = Math.floor(percent / 5);
  return `${"#".repeat(completed)}${"-".repeat(20 - completed)}`;
}

interface ScanCommandOptions {
  config?: string;
  concurrency?: number;
  rateLimit?: number;
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description(
      "Run adversarial payloads against configured AI agent endpoints",
    )
    .option(
      "--config <path>",
      "Path to working directory containing fortifai config",
    )
    .option("--concurrency <number>", "Max in-flight requests")
    .option(
      "--rate-limit <number>",
      "Max request starts per second (0 disables throttling)",
    )
    .action(async (opts: ScanCommandOptions) => {
      const scanId = generateScanId();
      const scanStartedAt = new Date().toISOString();
      const cwd = resolve(opts.config ?? process.cwd());
      const log = new NdjsonWriter(scanId);

      log.writeMeta({
        cliVersion: CLI_VERSION,
        schemaVersion: SCHEMA_VERSION,
        startedAt: scanStartedAt,
        configPath: cwd,
      });

      console.log(`\nFortifAI - AI Agent Security Scanner`);
      console.log(`Scan ID: ${scanId}\n`);

      // ── Config ──────────────────────────────────────────────────────────────
      console.log("-> Loading configuration...");
      let config;
      try {
        config = await loadConfig(cwd);
      } catch (error) {
        const message = (error as Error).message;
        log.writeError({
          stage: "config",
          message: "Configuration load failed",
          errorName: (error as Error).name,
          errorMessage: message,
        });
        console.error(`x Config error: ${message}`);
        process.exit(1);
      }
      console.log(`   Agents configured: ${config.agents.length}`);

      // ── Payloads ─────────────────────────────────────────────────────────────
      console.log("-> Loading attack payloads...");
      let payloads;
      try {
        payloads = await loadPayloads(config.apiKey);
      } catch (error) {
        const message = (error as Error).message;
        log.writeError({
          stage: "payloads",
          message: "Payload loading failed",
          errorName: (error as Error).name,
          errorMessage: message,
        });
        console.error(`x Payload error: ${message}`);
        process.exit(1);
      }
      console.log(`   Payloads loaded: ${payloads.length}`);

      // ── Execution settings ───────────────────────────────────────────────────
      const configConcurrency = config.scan?.concurrency ?? DEFAULT_CONCURRENCY;
      const configRateLimit =
        config.scan?.rateLimitPerSecond ?? DEFAULT_RATE_LIMIT_PER_SECOND;
      const concurrency =
        opts.concurrency !== undefined
          ? Number(opts.concurrency)
          : configConcurrency;
      const rateLimitPerSecond =
        opts.rateLimit !== undefined ? Number(opts.rateLimit) : configRateLimit;

      if (!Number.isInteger(concurrency) || concurrency < 1) {
        console.error("x Invalid concurrency. Use an integer >= 1.");
        process.exit(1);
      }
      if (!Number.isFinite(rateLimitPerSecond) || rateLimitPerSecond < 0) {
        console.error("x Invalid rate limit. Use a number >= 0.");
        process.exit(1);
      }

      const totalAttacks = config.agents.length * payloads.length;

      log.writeConfig({
        concurrency,
        rateLimitPerSecond,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        agents: config.agents.map((a) => ({
          name: a.name,
          endpoint: a.endpoint,
          method: a.method ?? "POST",
          inputField: a.inputField,
          headerKeys: Object.keys(a.headers ?? {}),
        })),
        payloadCount: payloads.length,
      });

      log.writePhase("execution", "running", "execution", "Attack execution started");

      // Notify dashboard that scan has started (non-blocking)
      if (config.apiKey) {
        notifyScanStarted(scanId, config.apiKey, scanStartedAt, {
          agentsConfigured: config.agents.length,
          payloadsLoaded: payloads.length,
          totalAttacks,
          concurrency,
          rateLimitPerSecond,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
        }).catch(() => {});
      }

      console.log(
        `\n-> Executing ${totalAttacks} attacks (concurrency: ${concurrency}, rate limit: ${rateLimitPerSecond}/s)\n`,
      );

      // ── Attack execution ─────────────────────────────────────────────────────
      let scanResults: AttackResult[] = [];
      let lastCheckpointPct = 0;

      try {
        scanResults = await executeAttacks(
          config.agents,
          payloads,
          (result, index, total) => {
            // Write one attack.result record per attack
            const payload = payloads.find((p) => p.id === result.payloadId);
            log.writeAttackResult({
              agent: result.agent,
              payloadId: result.payloadId,
              campaign: result.category,
              payloadText: result.payload,
              ...(payload?.severity !== undefined ? { payloadSeverity: payload.severity } : {}),
              ...(payload?.attack_vector !== undefined ? { payloadAttackVector: payload.attack_vector } : {}),
              ...(payload?.attack_technique !== undefined ? { payloadAttackTechnique: payload.attack_technique } : {}),
              requestEndpoint: result.request.endpoint,
              requestMethod: result.request.method,
              requestBody: result.request.body,
              responseStatus: result.response.status,
              responseLatencyMs: result.response.latencyMs,
              responseBody: result.response.body,
              ...(result.response.error !== undefined ? { responseError: result.response.error } : {}),
            });

            // Console progress
            const pct = Math.round((index / total) * 100);
            const bar = buildProgressBar(pct);
            const status = statusToLabel(result.response.status);
            process.stdout.write(
              `\r  [${bar}] ${padEnd(String(pct), 3)}%  ${padEnd(result.payloadId, 10)} ${padEnd(status, 10)}`,
            );

            // Checkpoint every 10%
            if (pct - lastCheckpointPct >= CHECKPOINT_INTERVAL_PCT || pct === 100) {
              lastCheckpointPct = pct;
              const currentOutcomes = buildRequestOutcomes(scanResults);
              const currentLatency = buildLatencySummary(scanResults);
              log.writeCheckpoint({
                completedAttempts: index,
                totalAttempts: total,
                requestOutcomes: currentOutcomes,
                latency: currentLatency,
              });
            }
          },
          { concurrency, rateLimitPerSecond },
        );
      } catch (error) {
        const message = (error as Error).message;
        log.writeError({
          stage: "execution",
          message: "Attack execution failed",
          errorName: (error as Error).name,
          errorMessage: message,
        });
        log.writePhase("error", "failed", "execution", message, "ERROR");

        if (config.apiKey) {
          await notifyScanFailed(
            scanId,
            config.apiKey,
            `Execution failed: ${message}`,
          );
        }
        console.error(`\nx Execution error: ${message}`);
        process.exit(1);
      }

      const scanCompletedAt = new Date().toISOString();
      const durationMs =
        new Date(scanCompletedAt).getTime() - new Date(scanStartedAt).getTime();

      const outcomes = buildRequestOutcomes(scanResults);
      const latency = buildLatencySummary(scanResults);

      console.log();
      console.log(
        `\n   Complete - Success: ${outcomes.successful}  Timeout: ${outcomes.timedOut}  Error: ${outcomes.transportErrors}`,
      );

      log.writePhase("execution", "completed", "execution", "Attack execution completed");

      // Final checkpoint with complete stats
      log.writeCheckpoint({ completedAttempts: totalAttacks, totalAttempts: totalAttacks, requestOutcomes: outcomes, latency });

      // Collect per-agent stats for scan.final
      const agentEndpoints: Record<string, string> = {};
      const agentRequestCounts: Record<string, number> = {};
      for (const r of scanResults) {
        agentEndpoints[r.agent] = r.request.endpoint;
        agentRequestCounts[r.agent] = (agentRequestCounts[r.agent] ?? 0) + 1;
      }

      log.writeFinal({
        status: "completed",
        startedAt: scanStartedAt,
        completedAt: scanCompletedAt,
        durationMs,
        agentsConfigured: config.agents.length,
        payloadsLoaded: payloads.length,
        totalAttacks,
        concurrency,
        rateLimitPerSecond,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        requestOutcomes: outcomes,
        latency,
        agentEndpoints,
        agentRequestCounts,
      });

      // Console summary
      printSummary(scanResults, [], scanId);
      console.log(
        "  Note: Security evaluation runs on the dashboard after upload.",
      );

      // ── Upload NDJSON log to dashboard ────────────────────────────────────────
      if (config.apiKey) {
        console.log("\n-> Uploading scan log to dashboard...");
        const uploadResult = await uploadScanLog(scanId, log.getLog(), config.apiKey);

        if (uploadResult.success) {
          console.log(
            `   Dashboard: ${uploadResult.dashboardUrl ?? "https://getfortifai.com/dashboard"}`,
          );
        } else {
          console.warn(`   Upload failed: ${uploadResult.error}`);
        }
      } else {
        console.warn("\n   No API key configured — skipping dashboard upload.");
      }
    });
}
