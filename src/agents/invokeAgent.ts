import type {
  AgentConfig,
  AttackPayload,
  AttackResult,
} from "../types/index.js";

export const REQUEST_TIMEOUT_MS = 10_000;

function buildErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const details: string[] = [];

    const message = err.message.trim();
    if (message) details.push(message);

    const name = err.name?.trim();
    if (name && name !== "Error") details.push(`name=${name}`);

    return details.length > 0
      ? details.join(" | ")
      : "Request failed without details";
  }

  if (typeof err === "string") {
    const message = err.trim();
    return message || "Unknown error";
  }

  return "Unknown error";
}

export async function invokeAgent(
  agent: AgentConfig,
  payload: AttackPayload,
): Promise<AttackResult> {
  const method = (agent.method ?? "POST").toUpperCase();

  const body: Record<string, unknown> = {
    ...(agent.additionalParams ?? {}),
    [agent.inputField]: payload.payload,
  };

  const timestamp = new Date().toISOString();
  const startMs = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(agent.endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(agent.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const latencyMs = Date.now() - startMs;

    let responseBody = "";
    try {
      const text = await response.text();
      responseBody = text;
    } catch {
      responseBody = "";
    }

    return {
      agent: agent.name,
      payloadId: payload.id,
      category: payload.campaign,
      payload: payload.payload,
      request: { endpoint: agent.endpoint, method, body },
      response: {
        status: response.status,
        body: responseBody,
        latencyMs,
      },
      timestamp,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);

    const latencyMs = Date.now() - startMs;

    const isTimeout = err instanceof Error && err.name === "AbortError";

    const errorMessage = buildErrorMessage(err);

    return {
      agent: agent.name,
      payloadId: payload.id,
      category: payload.campaign,
      payload: payload.payload,
      request: { endpoint: agent.endpoint, method, body },
      response: {
        status: isTimeout ? "timeout" : "error",
        body: "",
        latencyMs,
        error: errorMessage,
      },
      timestamp,
    };
  }
}
