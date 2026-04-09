import type {
  AttackResult,
  LatencySummary,
  RequestOutcomeSummary,
  ScanSummary,
} from "../types/index.js";

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const boundedIndex = Math.min(Math.max(index, 0), sorted.length - 1);
  return sorted[boundedIndex] ?? 0;
}

export function buildRequestOutcomes(
  scanResults: AttackResult[],
): RequestOutcomeSummary {
  const outcomes: RequestOutcomeSummary = {
    total: scanResults.length,
    successful: 0,
    timedOut: 0,
    transportErrors: 0,
    http2xx: 0,
    http3xx: 0,
    http4xx: 0,
    http5xx: 0,
  };

  for (const result of scanResults) {
    const status = result.response.status;
    if (status === "timeout") {
      outcomes.timedOut += 1;
      continue;
    }
    if (status === "error") {
      outcomes.transportErrors += 1;
      continue;
    }

    outcomes.successful += 1;
    if (status >= 200 && status < 300) outcomes.http2xx += 1;
    else if (status >= 300 && status < 400) outcomes.http3xx += 1;
    else if (status >= 400 && status < 500) outcomes.http4xx += 1;
    else if (status >= 500) outcomes.http5xx += 1;
  }

  return outcomes;
}

export function buildLatencySummary(
  scanResults: AttackResult[],
): LatencySummary {
  const latencyValues = scanResults
    .map((result) => result.response.latencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (latencyValues.length === 0) {
    return {
      minMs: 0,
      maxMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    };
  }

  const sum = latencyValues.reduce((acc, value) => acc + value, 0);
  const minMs = Math.min(...latencyValues);
  const maxMs = Math.max(...latencyValues);

  return {
    minMs,
    maxMs,
    avgMs: Number((sum / latencyValues.length).toFixed(2)),
    p50Ms: percentile(latencyValues, 50),
    p95Ms: percentile(latencyValues, 95),
    p99Ms: percentile(latencyValues, 99),
  };
}

export function buildSummary(scanResults: AttackResult[]): ScanSummary {
  const agentNames = new Set(scanResults.map((result) => result.agent));
  return {
    agentsTested: agentNames.size,
    payloadsExecuted: scanResults.length,
    findings: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    riskScore: 0,
    requestOutcomes: buildRequestOutcomes(scanResults),
    latency: buildLatencySummary(scanResults),
  };
}

function asPercent(value: number, total: number): string {
  if (total === 0) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

export function printSummary(
  scanResults: AttackResult[],
  scanId: string,
): void {
  const summary = buildSummary(scanResults);
  const outcomes = summary.requestOutcomes;

  const line = "=".repeat(72);
  console.log(`\n${line}`);
  console.log("  FortifAI Scan Summary");
  console.log(line);
  console.log(`  Scan ID          : ${scanId}`);
  console.log(`  Agents Tested    : ${summary.agentsTested}`);
  console.log(`  Payloads Fired   : ${summary.payloadsExecuted}`);
  console.log();

  console.log("  Request Outcomes:");
  console.log(
    `    Responded      : ${outcomes.successful}  (${asPercent(outcomes.successful, outcomes.total)})`,
  );
  console.log(
    `    Timed Out      : ${outcomes.timedOut}  (${asPercent(outcomes.timedOut, outcomes.total)})`,
  );
  console.log(
    `    Transport Err  : ${outcomes.transportErrors}  (${asPercent(outcomes.transportErrors, outcomes.total)})`,
  );
  console.log();

  console.log("  HTTP Status Breakdown:");
  console.log(`    2xx success    : ${outcomes.http2xx}`);
  console.log(`    4xx client err : ${outcomes.http4xx}`);
  console.log(`    5xx server err : ${outcomes.http5xx}`);
  console.log();

  console.log("  Latency (ms):");
  console.log(
    `    Avg / P50      : ${summary.latency.avgMs} / ${summary.latency.p50Ms}`,
  );
  console.log(
    `    P95 / P99      : ${summary.latency.p95Ms} / ${summary.latency.p99Ms}`,
  );
  console.log(
    `    Min / Max      : ${summary.latency.minMs} / ${summary.latency.maxMs}`,
  );
  console.log();

  console.log(
    `  Security Evaluation  : pending — results on dashboard after upload`,
  );
  console.log(line);
  console.log();
}
