/**
 * @fortifai/cli — Type definitions
 */

export interface AgentConfig {
  /** Human-readable name for the agent under test */
  name: string;
  /** Full URL to the agent's chat/completion endpoint */
  endpoint: string;
  /** HTTP method (default: POST) */
  method?: string;
  /** Body field name that receives the attack payload */
  inputField: string;
  /** Additional body params merged alongside the inputField */
  additionalParams?: Record<string, unknown>;
  /** HTTP headers sent with every request */
  headers?: Record<string, string>;
}

export interface ScanConfig {
  /** Max in-flight requests across all attack invocations */
  concurrency?: number;
  /** Max request starts per second (0 disables throttling) */
  rateLimitPerSecond?: number;
}

export interface CliConfig {
  apiKey?: string;
  agents: AgentConfig[];
  scan?: ScanConfig;
}

/** A single attack payload from the knowledge base */
export interface AttackPayload {
  id: string;
  campaign: string;
  description?: string;
  payload: string;
  severity?: string;
  attack_vector?: string;
  attack_technique?: string;
  expected_vulnerability?: string[];
  owasp_agentic_mapping?: string[];
  owasp_llm_mapping?: string[];
}

export interface KbPackMetadata {
  version: string;
  benchmark: string;
  campaignCount: number;
  payloadCount: number;
  generatedAt: string;
}

export interface KbCampaign {
  version: string;
  benchmark: string;
  aligned_standards?: string[];
  generated_by?: string;
  campaign: string;
  payload_count: number;
  payloads: AttackPayload[];
}

export interface KbPack {
  metadata: KbPackMetadata;
  campaigns: Record<string, KbCampaign>;
}

/** The outcome of invoking one agent with one payload */
export interface AttackResult {
  agent: string;
  payloadId: string;
  category: string;
  payload: string;
  request: {
    endpoint: string;
    method: string;
    body: Record<string, unknown>;
  };
  response: {
    status: number | "timeout" | "error";
    body: string;
    latencyMs: number;
    error?: string;
  };
  timestamp: string;
}

export interface RequestOutcomeSummary {
  total: number;
  successful: number;
  timedOut: number;
  transportErrors: number;
  http2xx: number;
  http3xx: number;
  http4xx: number;
  http5xx: number;
}

export interface LatencySummary {
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface SeverityBreakdown {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

/** Summary counts used for console output */
export interface ScanSummary {
  agentsTested: number;
  payloadsExecuted: number;
  findings: SeverityBreakdown;
  riskScore: number;
  requestOutcomes: RequestOutcomeSummary;
  latency: LatencySummary;
}
