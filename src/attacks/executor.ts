import pLimit from "p-limit";
import { invokeAgent } from "../agents/invokeAgent.js";
import type { AgentConfig, AttackPayload, AttackResult } from "../types/index.js";

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_RATE_LIMIT_PER_SECOND = 5;

export interface ExecutionOptions {
    concurrency?: number;
    rateLimitPerSecond?: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRateLimiter(rateLimitPerSecond: number): () => Promise<void> {
    if (!Number.isFinite(rateLimitPerSecond) || rateLimitPerSecond <= 0) {
        return async () => {};
    }

    const minIntervalMs = Math.ceil(1000 / rateLimitPerSecond);
    let nextAllowedMs = 0;

    return async () => {
        const now = Date.now();
        const scheduledMs = Math.max(now, nextAllowedMs);
        nextAllowedMs = scheduledMs + minIntervalMs;

        const waitMs = scheduledMs - now;
        if (waitMs > 0) {
            await sleep(waitMs);
        }
    };
}

export async function executeAttacks(
    agents: AgentConfig[],
    payloads: AttackPayload[],
    onProgress?: (result: AttackResult, index: number, total: number) => void,
    options: ExecutionOptions = {},
): Promise<AttackResult[]> {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const rateLimitPerSecond =
        options.rateLimitPerSecond ?? DEFAULT_RATE_LIMIT_PER_SECOND;

    const limit = pLimit(concurrency);
    const rateLimiter = createRateLimiter(rateLimitPerSecond);
    const results: AttackResult[] = [];

    const tasks: Array<() => Promise<AttackResult>> = [];
    for (const agent of agents) {
        for (const payload of payloads) {
            tasks.push(() => invokeAgent(agent, payload));
        }
    }

    const total = tasks.length;
    let index = 0;

    const settled = await Promise.all(
        tasks.map((task) =>
            limit(async () => {
                await rateLimiter();
                const result = await task();
                index++;
                onProgress?.(result, index, total);
                return result;
            }),
        ),
    );

    results.push(...settled);
    return results;
}
