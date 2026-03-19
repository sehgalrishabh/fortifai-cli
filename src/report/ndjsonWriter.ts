/**
 * NdjsonWriter — builds a fortifai.scanlog/v1 NDJSON log in memory.
 *
 * Records are accumulated and serialised to a single NDJSON string for upload.
 * No file I/O; the full log is held in an array until getLog() is called.
 */

import { createHash } from "node:crypto";

const SCHEMA = "fortifai.scanlog/v1" as const;

type LogPhase = "meta" | "execution" | "evaluation" | "finalize" | "error";
type LogLevel = "INFO" | "WARN" | "ERROR";
type LogKind =
  | "scan.meta"
  | "scan.config"
  | "scan.phase"
  | "attack.result"
  | "evaluation.selection"
  | "evaluation.result"
  | "summary.checkpoint"
  | "scan.final"
  | "scan.error";

interface Envelope {
  schema: typeof SCHEMA;
  scanId: string;
  seq: number;
  ts: string;
  kind: LogKind;
  phase: LogPhase;
  level: LogLevel;
  derived: boolean;
  agent?: string;
  payloadId?: string;
  campaign?: string;
  attemptId?: string;
  targetId?: string;
  evaluationRunId?: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export class NdjsonWriter {
  private readonly scanId: string;
  private seq = 0;
  private readonly records: string[] = [];

  /** Count of records by kind — used in scan.final.recordCounts */
  private readonly kindCounts = new Map<LogKind, number>();

  constructor(scanId: string) {
    this.scanId = scanId;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private push(
    kind: LogKind,
    phase: LogPhase,
    level: LogLevel,
    derived: boolean,
    data: unknown,
    extra?: Partial<Omit<Envelope, "schema" | "scanId" | "seq" | "ts" | "kind" | "phase" | "level" | "derived">>,
  ): void {
    this.seq += 1;
    const record: Envelope & { data: unknown } = {
      schema: SCHEMA,
      scanId: this.scanId,
      seq: this.seq,
      ts: new Date().toISOString(),
      kind,
      phase,
      level,
      derived,
      ...extra,
      data,
    };
    this.records.push(JSON.stringify(record));
    this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1);
  }

  // ── Public record writers ─────────────────────────────────────────────────

  writeMeta(data: {
    cliVersion: string;
    schemaVersion: string;
    startedAt: string;
    configPath: string;
  }): void {
    this.push("scan.meta", "meta", "INFO", false, {
      cliVersion: data.cliVersion,
      enginePackage: "@sehgalrishabh/fortifai-core",
      schemaVersion: data.schemaVersion,
      startedAt: data.startedAt,
      configPath: data.configPath,
      platform: process.platform,
      nodeVersion: process.version,
    });
  }

  writeConfig(data: {
    concurrency: number;
    rateLimitPerSecond: number;
    requestTimeoutMs: number;
    agents: Array<{
      name: string;
      endpoint: string;
      method: string;
      inputField: string;
      headerKeys: string[];
    }>;
    payloadCount: number;
  }): void {
    this.push("scan.config", "meta", "INFO", false, {
      execution: {
        concurrency: data.concurrency,
        rateLimitPerSecond: data.rateLimitPerSecond,
        requestTimeoutMs: data.requestTimeoutMs,
      },
      agents: data.agents,
      payloadPack: { payloadCount: data.payloadCount },
    });
  }

  writePhase(
    phase: LogPhase,
    status: "running" | "completed" | "failed",
    stage: string,
    message: string,
    level: LogLevel = "INFO",
  ): void {
    this.push("scan.phase", phase, level, false, { status, stage, message });
  }

  writeAttackResult(data: {
    agent: string;
    payloadId: string;
    campaign: string;
    payloadText: string;
    payloadSeverity?: string;
    payloadAttackVector?: string;
    payloadAttackTechnique?: string;
    requestEndpoint: string;
    requestMethod: string;
    requestBody: Record<string, unknown>;
    responseStatus: number | "timeout" | "error";
    responseLatencyMs: number;
    responseBody: string;
    responseError?: string;
  }): void {
    const reqBodyStr = JSON.stringify(data.requestBody);
    const respBodyStr = data.responseBody;

    this.push(
      "attack.result",
      "execution",
      "INFO",
      false,
      {
        payload: {
          id: data.payloadId,
          campaign: data.campaign,
          severity: data.payloadSeverity,
          attackVector: data.payloadAttackVector,
          attackTechnique: data.payloadAttackTechnique,
          text: data.payloadText,
        },
        request: {
          endpoint: data.requestEndpoint,
          method: data.requestMethod,
          body: data.requestBody,
          bodyBytes: Buffer.byteLength(reqBodyStr, "utf8"),
          bodySha256: sha256(reqBodyStr),
        },
        response: {
          status: data.responseStatus,
          latencyMs: data.responseLatencyMs,
          body: respBodyStr,
          bodyBytes: Buffer.byteLength(respBodyStr, "utf8"),
          bodySha256:
            typeof data.responseStatus === "number"
              ? sha256(respBodyStr)
              : null,
          error: data.responseError ?? null,
        },
      },
      {
        agent: data.agent,
        payloadId: data.payloadId,
        campaign: data.campaign,
        attemptId: `${data.agent}::${data.payloadId}::1`,
      },
    );
  }

  writeCheckpoint(data: {
    completedAttempts: number;
    totalAttempts: number;
    requestOutcomes: {
      total: number;
      successful: number;
      timedOut: number;
      transportErrors: number;
      http2xx: number;
      http3xx: number;
      http4xx: number;
      http5xx: number;
    };
    latency: {
      minMs: number;
      maxMs: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
  }): void {
    this.push("summary.checkpoint", "execution", "INFO", true, data);
  }

  writeFinal(data: {
    status: "completed" | "failed";
    startedAt: string;
    completedAt: string;
    durationMs: number;
    agentsConfigured: number;
    payloadsLoaded: number;
    totalAttacks: number;
    concurrency: number;
    rateLimitPerSecond: number;
    requestTimeoutMs: number;
    requestOutcomes: {
      total: number;
      successful: number;
      timedOut: number;
      transportErrors: number;
      http2xx: number;
      http3xx: number;
      http4xx: number;
      http5xx: number;
    };
    latency: {
      minMs: number;
      maxMs: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
    agentEndpoints: Record<string, string>;
    agentRequestCounts: Record<string, number>;
  }): void {
    const agentSummaries = Object.entries(data.agentRequestCounts).map(
      ([agent, totalRequests]) => ({
        agent,
        endpoint: data.agentEndpoints[agent] ?? "",
        totalRequests,
        evaluation: null,
      }),
    );

    const recordCounts: Record<string, number> = {};
    for (const [kind, count] of this.kindCounts.entries()) {
      recordCounts[kind] = count;
    }

    this.push("scan.final", "finalize", "INFO", true, {
      status: data.status,
      scanWindow: {
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        durationMs: data.durationMs,
      },
      execution: {
        agentsConfigured: data.agentsConfigured,
        payloadsLoaded: data.payloadsLoaded,
        totalAttacks: data.totalAttacks,
        concurrency: data.concurrency,
        rateLimitPerSecond: data.rateLimitPerSecond,
        requestTimeoutMs: data.requestTimeoutMs,
      },
      summary: {
        agentsTested: Object.keys(data.agentRequestCounts).length,
        payloadsExecuted: data.totalAttacks,
        riskScore: null,
        verdict: null,
        requestOutcomes: data.requestOutcomes,
        latency: data.latency,
        findings: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      },
      agentSummaries,
      recordCounts,
    });
  }

  writeError(data: {
    stage: string;
    message: string;
    errorName: string;
    errorMessage: string;
  }): void {
    this.push("scan.error", "error", "ERROR", false, {
      status: "failed",
      stage: data.stage,
      message: data.message,
      error: { name: data.errorName, message: data.errorMessage },
    });
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /** Returns the full NDJSON string — one JSON object per line. */
  getLog(): string {
    return this.records.join("\n") + "\n";
  }

  /** Total record count so far. */
  get recordCount(): number {
    return this.records.length;
  }
}
