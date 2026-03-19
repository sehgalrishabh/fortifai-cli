import { DEFAULT_BACKEND_URL } from "../index.js";

export interface UploadResult {
  success: boolean;
  dashboardUrl?: string;
  error?: string;
}

/**
 * Upload the NDJSON scan log to the FortifAI dashboard.
 * Sends as text/plain; server stores to Vercel Blob, runs evaluation,
 * and returns a dashboard URL.
 */
export async function uploadScanLog(
  scanId: string,
  ndjson: string,
  apiKey: string,
  backendUrl: string = DEFAULT_BACKEND_URL,
): Promise<UploadResult> {
  try {
    const response = await fetch(`${backendUrl}/api/scans`, {
      method: "POST",
      headers: {
        "content-type": "application/x-ndjson",
        "x-fortifai-key": apiKey.trim(),
        "x-scan-id": scanId,
      },
      body: ndjson,
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        success: false,
        error: errBody.error ?? `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { dashboardUrl?: string };
    return {
      success: true,
      dashboardUrl: data.dashboardUrl ?? `${DEFAULT_BACKEND_URL}/dashboard`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
