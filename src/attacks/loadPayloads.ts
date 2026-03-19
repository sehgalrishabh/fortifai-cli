import type { AttackPayload, KbPack } from "../types/index.js";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { DEFAULT_BACKEND_URL } from "../index.js";

const brotliDecompress = promisify(zlib.brotliDecompress);

function deriveKey(apiKey: string, version: string, nonce: string) {
  return crypto
    .createHash("sha256")
    .update(apiKey + version + nonce)
    .digest();
}

export async function loadPayloads(
  apiKey?: string,
  backendUrl: string = DEFAULT_BACKEND_URL,
): Promise<AttackPayload[]> {
  if (!apiKey) {
    throw new Error("CLI is not authenticated. Run 'fortifai auth' first.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${backendUrl}/api/gnosis`, {
      method: "GET",
      headers: {
        "x-fortifai-key": `${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401) {
      const res = (await response.json()) as any;
      throw new Error(res.error || "Invalid API key.");
    }

    if (response.status === 403) {
      const res = (await response.json()) as any;
      throw new Error(
        `Quota Exceeded: ${res.error || "Please upgrade your subscription to run more attacks."}`,
      );
    }

    if (response.status === 429) {
      const res = (await response.json()) as any;
      throw new Error(
        `Rate Limit Exceeded: ${res.error || "Too many requests. Please wait before retrying."}`,
      );
    }

    if (!response.ok) {
      const res = (await response.json()) as any;
      throw new Error(`Backend error: ${res.error || response.statusText}`);
    }

    const payload = (await response.json()) as any;

    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const encrypted = Buffer.from(payload.data, "base64");

    const key = deriveKey(apiKey, payload.version, payload.nonce);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const decompressed = await brotliDecompress(decrypted);

    const kb: KbPack = JSON.parse(decompressed.toString());

    if (!kb || !kb.campaigns) {
      throw new Error("Invalid KB format.");
    }

    const payloads: AttackPayload[] = [];

    for (const campaign of Object.values(kb.campaigns)) {
      if (Array.isArray(campaign.payloads)) {
        payloads.push(...campaign.payloads);
      }
    }

    return payloads;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("KB request timeout.");
    }

    throw new Error(
      `Network error while fetching KB: ${error?.message || "Unknown error"}`,
    );
  }
}
