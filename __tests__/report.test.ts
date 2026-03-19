import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EvaluationResult } from "@fortifai/core";
import type { AttackResult } from "../src/types/index.js";
import { buildSummary } from "../src/report/formatter.js";
import { writeReport } from "../src/report/jsonWriter.js";

function makeEvaluationResult(agentName: string): EvaluationResult {
    return {
        evaluationId: "eval-1",
        targetId: `scan_1::${agentName}`,
        timestamp: "2026-03-05T00:00:00.000Z",
        signals: [],
        deduplicatedSignals: [
            {
                id: "sig-1",
                ruleId: "EXEC-002",
                ruleVersion: "1.0.0",
                severity: "HIGH",
                confidence: 0.91,
                snippet: "test",
                location: { source: "response" },
                tags: ["OWASP-LLM01"],
                metadata: {},
                scoreImpact: 70,
            },
        ],
        verdict: "FAIL",
        policyName: "default",
        policyRulesFired: [],
        compositeScore: 72,
        scoreBreakdown: {},
        stability: {
            stabilityIndex: 1,
            normalizedVariance: 0,
            jaccardConsistency: 1,
            totalRuns: 1,
            consistentRuns: 1,
        },
        confidence: 0.9,
        complianceMapping: [],
        runs: [],
        errors: [],
        durationMs: 1,
        engineVersion: "2.0.0",
        knowledgeBaseVersion: "1.0.0",
    } as unknown as EvaluationResult;
}

const scanResults: AttackResult[] = [
    {
        agent: "agent-one",
        payloadId: "P-001",
        category: "prompt-injection",
        payload: "payload-one",
        request: {
            endpoint: "http://localhost:3000/api/chat",
            method: "POST",
            body: { message: "payload-one" },
        },
        response: { status: 200, body: "ok", latencyMs: 120 },
        timestamp: "2026-03-05T00:00:00.000Z",
    },
    {
        agent: "agent-one",
        payloadId: "P-002",
        category: "prompt-injection",
        payload: "payload-two",
        request: {
            endpoint: "http://localhost:3000/api/chat",
            method: "POST",
            body: { message: "payload-two" },
        },
        response: { status: 502, body: "bad gateway", latencyMs: 320 },
        timestamp: "2026-03-05T00:00:01.000Z",
    },
    {
        agent: "agent-one",
        payloadId: "P-003",
        category: "jailbreak",
        payload: "payload-three",
        request: {
            endpoint: "http://localhost:3000/api/chat",
            method: "POST",
            body: { message: "payload-three" },
        },
        response: {
            status: "timeout",
            body: "",
            latencyMs: 10_000,
            error: "timeout",
        },
        timestamp: "2026-03-05T00:00:02.000Z",
    },
];

describe("report formatting", () => {
    let tempDir: string | null = null;

    afterEach(() => {
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    it("builds a summary with request outcomes and latency", () => {
        const summary = buildSummary(scanResults, [makeEvaluationResult("agent-one")]);

        expect(summary.payloadsExecuted).toBe(3);
        expect(summary.requestOutcomes.total).toBe(3);
        expect(summary.requestOutcomes.http2xx).toBe(1);
        expect(summary.requestOutcomes.http5xx).toBe(1);
        expect(summary.requestOutcomes.timedOut).toBe(1);
        expect(summary.latency.maxMs).toBe(10_000);
    });

    it("writes a dashboard-oriented report payload", () => {
        tempDir = mkdtempSync(join(tmpdir(), "fortifai-report-test-"));

        const path = writeReport(
            "scan_1",
            scanResults,
            [makeEvaluationResult("agent-one")],
            {
                outDir: tempDir,
                scanWindow: {
                    startedAt: "2026-03-05T00:00:00.000Z",
                    completedAt: "2026-03-05T00:00:10.000Z",
                    durationMs: 10_000,
                },
                execution: {
                    configPath: tempDir,
                    agentsConfigured: 1,
                    payloadsLoaded: 3,
                    totalAttacks: 3,
                    concurrency: 2,
                    rateLimitPerSecond: 1,
                    requestTimeoutMs: 10_000,
                },
                timeline: [
                    {
                        sequence: 1,
                        timestamp: "2026-03-05T00:00:00.000Z",
                        level: "INFO",
                        event: "scan.started",
                        message: "Scan started",
                    },
                ],
                eventLogPath: join(tempDir, "events.log"),
            },
        );

        const raw = readFileSync(path, "utf-8");
        const report = JSON.parse(raw);

        expect(report.schemaVersion).toBe("2.0.0");
        expect(report.kpis.successRatePct).toBeGreaterThan(0);
        expect(report.agentSummaries).toHaveLength(1);
        expect(report.campaignSummaries).toHaveLength(2);
        expect(report.findings.totalSignals).toBe(1);
        expect(report.timeline).toHaveLength(1);
    });
});
