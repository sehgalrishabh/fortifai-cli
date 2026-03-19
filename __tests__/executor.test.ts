import { describe, it, expect, vi, afterEach } from "vitest";
import type { AgentConfig, AttackPayload } from "../src/types/index.js";

// Mock invokeAgent so tests don't make real HTTP calls
vi.mock("../src/agents/invokeAgent.js", () => ({
    invokeAgent: vi.fn(),
}));

const agents: AgentConfig[] = [
    {
        name: "agent-one",
        endpoint: "http://localhost:3001/chat",
        inputField: "message",
    },
    {
        name: "agent-two",
        endpoint: "http://localhost:3002/chat",
        inputField: "query",
    },
];

const payloads: AttackPayload[] = [
    { id: "P-001", campaign: "injection", payload: "payload one" },
    { id: "P-002", campaign: "injection", payload: "payload two" },
    { id: "P-003", campaign: "jailbreak", payload: "payload three" },
];

describe("executeAttacks", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("calls invokeAgent N*M times (agents × payloads)", async () => {
        const { invokeAgent } = await import("../src/agents/invokeAgent.js");
        const mockInvoke = vi.mocked(invokeAgent);

        mockInvoke.mockImplementation(async (agent, payload) => ({
            agent: agent.name,
            payloadId: payload.id,
            category: payload.campaign,
            payload: payload.payload,
            request: { endpoint: agent.endpoint, method: "POST", body: {} },
            response: { status: 200, body: "ok", latencyMs: 10 },
            timestamp: new Date().toISOString(),
        }));

        const { executeAttacks } = await import("../src/attacks/executor.js");
        const results = await executeAttacks(agents, payloads, undefined, {
            rateLimitPerSecond: 0,
        });

        // 2 agents × 3 payloads = 6 calls
        expect(mockInvoke).toHaveBeenCalledTimes(6);
        expect(results).toHaveLength(6);
    });

    it("returns results for each agent-payload pair", async () => {
        const { invokeAgent } = await import("../src/agents/invokeAgent.js");
        vi.mocked(invokeAgent).mockImplementation(async (agent, payload) => ({
            agent: agent.name,
            payloadId: payload.id,
            category: payload.campaign,
            payload: payload.payload,
            request: { endpoint: agent.endpoint, method: "POST", body: {} },
            response: { status: 200, body: "ok", latencyMs: 5 },
            timestamp: new Date().toISOString(),
        }));

        const { executeAttacks } = await import("../src/attacks/executor.js");
        const results = await executeAttacks(agents, payloads, undefined, {
            rateLimitPerSecond: 0,
        });

        const agentNames = new Set(results.map((r) => r.agent));
        expect(agentNames).toContain("agent-one");
        expect(agentNames).toContain("agent-two");

        const payloadIds = new Set(results.map((r) => r.payloadId));
        expect(payloadIds).toContain("P-001");
        expect(payloadIds).toContain("P-002");
        expect(payloadIds).toContain("P-003");
    });

    it("calls the progress callback for each result", async () => {
        const { invokeAgent } = await import("../src/agents/invokeAgent.js");
        vi.mocked(invokeAgent).mockImplementation(async (agent, payload) => ({
            agent: agent.name,
            payloadId: payload.id,
            category: payload.campaign,
            payload: payload.payload,
            request: { endpoint: agent.endpoint, method: "POST", body: {} },
            response: { status: 200, body: "ok", latencyMs: 5 },
            timestamp: new Date().toISOString(),
        }));

        const progressCb = vi.fn();
        const { executeAttacks } = await import("../src/attacks/executor.js");
        await executeAttacks(agents, payloads, progressCb, {
            rateLimitPerSecond: 0,
        });

        expect(progressCb).toHaveBeenCalledTimes(6);
        // Third argument should be total = 6
        const lastCall = progressCb.mock.calls[5];
        expect(lastCall?.[2]).toBe(6);
    });
});
