import { DEFAULT_BACKEND_URL } from "../index.js";

interface ExecutionInfo {
  agentsConfigured: number;
  payloadsLoaded: number;
  totalAttacks: number;
  concurrency: number;
  rateLimitPerSecond: number;
  requestTimeoutMs: number;
}

/**
 * Notify the dashboard that a scan has started (creates a "running" stub).
 * Gracefully degrades — never throws.
 */
export async function notifyScanStarted(
  scanId: string,
  apiKey: string,
  startedAt: string,
  execution: ExecutionInfo,
  backendUrl: string = DEFAULT_BACKEND_URL,
): Promise<void> {
  try {
    await fetch(`${backendUrl}/api/scans`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fortifai-key": apiKey.trim(),
      },
      body: JSON.stringify({
        status: "running",
        scanId,
        startedAt,
        schemaVersion: "2.0.0",
        execution,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Non-blocking — failure is silent
  }
}

/**
 * Notify the dashboard that a scan has failed mid-run.
 * Gracefully degrades — never throws.
 */
export async function notifyScanFailed(
  scanId: string,
  apiKey: string,
  errorMessage: string,
  backendUrl: string = DEFAULT_BACKEND_URL,
): Promise<void> {
  try {
    await fetch(`${backendUrl}/api/scans/${scanId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-fortifai-key": apiKey.trim(),
      },
      body: JSON.stringify({ status: "failed", errorMessage }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Non-blocking — failure is silent
  }
}
