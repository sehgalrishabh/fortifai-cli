import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config/loadConfig.js";

const tmp = join(tmpdir(), `fortifai-test-cfg-${Date.now()}`);

beforeEach(() => {
    mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

const validConfig = {
    agents: [
        {
            name: "test-agent",
            endpoint: "http://localhost:3000/api/chat",
            inputField: "message",
        },
    ],
};

describe("loadConfig", () => {
    it("loads a valid YAML config", async () => {
        const yaml = `
agents:
  - name: test-agent
    endpoint: http://localhost:3000/api/chat
    inputField: message
scan:
  concurrency: 4
  rateLimitPerSecond: 2.5
`;
        writeFileSync(join(tmp, "fortifai.config.yaml"), yaml);
        const config = await loadConfig(tmp);
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe("test-agent");
        expect(config.agents[0]?.endpoint).toBe("http://localhost:3000/api/chat");
        expect(config.agents[0]?.inputField).toBe("message");
        expect(config.scan?.concurrency).toBe(4);
        expect(config.scan?.rateLimitPerSecond).toBe(2.5);
    });

    it("loads a valid YML config", async () => {
        const yaml = `
agents:
  - name: agent-two
    endpoint: http://localhost:4000/chat
    inputField: query
    additionalParams:
      sessionId: abc
`;
        writeFileSync(join(tmp, "fortifai.config.yml"), yaml);
        const config = await loadConfig(tmp);
        expect(config.agents[0]?.name).toBe("agent-two");
        expect(config.agents[0]?.additionalParams?.["sessionId"]).toBe("abc");
    });

    it("throws when no config file is found", async () => {
        await expect(loadConfig(tmp)).rejects.toThrow("No FortifAI config found");
    });

    it("throws when agents array is missing", async () => {
        writeFileSync(
            join(tmp, "fortifai.config.yaml"),
            "someOtherField: true\n",
        );
        await expect(loadConfig(tmp)).rejects.toThrow('"agents"');
    });

    it("throws when agents array is empty", async () => {
        writeFileSync(join(tmp, "fortifai.config.yaml"), "agents: []\n");
        await expect(loadConfig(tmp)).rejects.toThrow('"agents"');
    });

    it("throws when agent is missing required fields", async () => {
        writeFileSync(
            join(tmp, "fortifai.config.yaml"),
            `agents:\n  - name: only-name\n`,
        );
        await expect(loadConfig(tmp)).rejects.toThrow('"endpoint"');
    });

    it("throws when scan tuning is invalid", async () => {
        writeFileSync(
            join(tmp, "fortifai.config.yaml"),
            `
agents:
  - name: test-agent
    endpoint: http://localhost:3000/api/chat
    inputField: message
scan:
  concurrency: 0
  rateLimitPerSecond: -1
`,
        );
        await expect(loadConfig(tmp)).rejects.toThrow('"scan.concurrency"');
    });
});
