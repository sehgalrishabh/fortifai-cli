<div align="center">

<img src="https://img.shields.io/badge/fortifai-cli-gold?style=for-the-badge&labelColor=0a0a0a&color=C99A23" alt="FortifAI CLI" />

# @fortifai/cli

### Dynamic adversarial testing for AI agents

[![npm version](https://img.shields.io/npm/v/@fortifai/cli?style=flat-square&color=C99A23&labelColor=0a0a0a)](https://www.npmjs.com/package/@fortifai/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=0a0a0a)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?style=flat-square&labelColor=0a0a0a&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&labelColor=0a0a0a&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-6e9f18?style=flat-square&labelColor=0a0a0a)](https://vitest.dev/)
[![OWASP](https://img.shields.io/badge/OWASP-Agentic%20Top%2010-E5484D?style=flat-square&labelColor=0a0a0a)](https://owasp.org/)

**Point it at your agent. Watch it break. Fix it before your users find out.**

[Quick Start](#quick-start) · [Configuration](#configuration) · [CLI Reference](#cli-reference) · [How It Works](#how-it-works) · [Dashboard](#dashboard) · [Development](#development)

</div>

---

## What is FortifAI CLI?

FortifAI CLI is a black-box adversarial testing tool for production AI agents. It fires a curated library of attack payloads — covering **prompt injection**, **goal hijacking**, **data exfiltration**, **privilege escalation**, and more — directly at your agent's HTTP endpoint and reports every signal it finds.

It is built for teams that ship AI agents and want to know: _"can this be exploited?"_ before someone else answers that question for them.

---

## Coverage

FortifAI payloads are mapped to two industry security standards:

| Standard                 | Coverage                                                 |
| ------------------------ | -------------------------------------------------------- |
| **OWASP Agentic Top 10** | AA1 – AA10 (Goal Hijacking → Resource Exhaustion)        |
| **OWASP LLM Top 10**     | LLM01 – LLM10 (Prompt Injection → Unbounded Consumption) |

Each attack payload carries `severity` (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`) and `attack_vector` metadata so every finding maps back to a real risk category.

---

## Prerequisites

| Requirement      | Version                              |
| ---------------- | ------------------------------------ |
| Node.js          | ≥ 18                                 |
| npm              | ≥ 8                                  |
| FortifAI API key | [Get one →](https://getfortifai.com) |

An API key is required to download the encrypted payload knowledge base. You get one from your FortifAI dashboard.

---

## Quick Start

### 1. Install

```bash
npm install -g @fortifai/cli
```

Or run without installing:

```bash
npx @fortifai/cli scan
```

### 2. Authenticate

```bash
fortifai auth
```

This writes your API key into your config file. To skip the prompt:

```bash
fortifai auth --api-key fai_your_key_here
```

### 3. Configure your agent

Create a `fortifai.config.yaml` (or `.ts` / `.js`) in your project root:

```yaml
# fortifai.config.yaml

agents:
  - name: customer-support-agent
    endpoint: http://localhost:3000/api/chat
    method: POST
    inputField: message
    headers:
      Content-Type: application/json
      Authorization: Bearer your-dev-token

scan:
  concurrency: 5
  rateLimitPerSecond: 5
```

### 4. Run the scan

```bash
fortifai scan
```

That's it. FortifAI will fire all payloads at your endpoint, collect results, and upload a full evaluation report to your dashboard.

---

## Configuration

FortifAI searches upward from the working directory for the first config file it finds. Supported formats (in search order):

```
fortifai.config.ts
fortifai.config.js
fortifai.config.yaml
fortifai.config.yml
```

### Full config reference

```typescript
// fortifai.config.ts
export default {
  // Your FortifAI API key (or set via `fortifai auth`)
  apiKey: "fai_...",

  agents: [
    {
      // ─── Required ──────────────────────────────────────────
      name: "my-agent", // Identifier in reports
      endpoint: "https://my-api.com/v1/chat", // URL to hit
      inputField: "message", // Body key for the payload

      // ─── Optional ──────────────────────────────────────────
      method: "POST", // Default: POST
      headers: {
        Authorization: "Bearer sk-...",
        "Content-Type": "application/json",
      },
      additionalParams: {
        model: "gpt-4o",
        stream: false,
      },
    },
  ],

  scan: {
    concurrency: 5, // Max in-flight requests  (default: 5, min: 1)
    rateLimitPerSecond: 5, // Max new requests/sec    (default: 5, 0 = unlimited)
  },
};
```

### Agent fields

| Field              | Type     | Required | Description                                                       |
| ------------------ | -------- | :------: | ----------------------------------------------------------------- |
| `name`             | `string` |    ✅    | Human-readable agent identifier used in reports                   |
| `endpoint`         | `string` |    ✅    | Full URL of the agent endpoint to test                            |
| `inputField`       | `string` |    ✅    | Body key that receives the attack payload                         |
| `method`           | `string` |    —     | HTTP method (default: `POST`)                                     |
| `headers`          | `object` |    —     | Headers sent with every request (auth tokens, Content-Type, etc.) |
| `additionalParams` | `object` |    —     | Extra body fields merged alongside `inputField`                   |

### Scan tuning fields

| Field                     | Type          | Required | Default | Description                                                      |
| ------------------------- | ------------- | :------: | ------- | ---------------------------------------------------------------- |
| `scan.concurrency`        | `integer ≥ 1` |    —     | `5`     | Maximum parallel in-flight requests                              |
| `scan.rateLimitPerSecond` | `number ≥ 0`  |    —     | `5`     | Maximum new requests started per second. `0` disables throttling |

> **Tip — multiple agents:** Add multiple entries to `agents[]` to test all your AI endpoints in a single scan run.

---

## CLI Reference

### `fortifai scan`

Run adversarial payloads against your configured agents.

```
Usage: fortifai scan [options]

Options:
  --config <path>         Working directory containing fortifai config  (default: cwd)
  --concurrency <number>  Max in-flight requests  (overrides config)
  --rate-limit <number>   Max request starts per second  (overrides config, 0 = unlimited)
  -h, --help              Display help
```

**Examples:**

```bash
# Basic scan from current directory
fortifai scan

# Point at a specific project
fortifai scan --config ./path/to/project

# Stress test — unlimited concurrency, no rate limit
fortifai scan --concurrency 20 --rate-limit 0

# Conservative — 2 parallel requests, 2 per second
fortifai scan --concurrency 2 --rate-limit 2
```

---

### `fortifai auth`

Authenticate the CLI with your FortifAI API key.

```
Usage: fortifai auth [options]

Options:
  --api-key <key>    Provide key directly (skips interactive prompt)
  --config <path>    Working directory containing fortifai config
  -h, --help         Display help
```

The command searches up the directory tree for an existing config file and writes the `apiKey` field into it. If no config exists, a minimal `fortifai.config.yaml` is created.

**Examples:**

```bash
# Interactive prompt
fortifai auth

# Non-interactive (CI / scripts)
fortifai auth --api-key fai_your_key_here
```

---

## How It Works

```
  You                 FortifAI CLI              FortifAI Cloud
  ────                ────────────              ──────────────
   │                       │                        │
   │  fortifai scan        │                        │
   │──────────────────────▶│                        │
   │                       │── loadConfig() ──▶     │
   │                       │                        │
   │                       │── POST /api/payloads ─▶│
   │                       │   x-fortifai-key        │
   │                       │◀── AES-256-GCM pack ───│
   │                       │    (Brotli compressed)  │
   │                       │                        │
   │                       │── notifyScanStarted() ▶│
   │                       │   (creates "running"    │
   │                       │    stub on dashboard)   │
   │                       │                        │
   │          Your Agent   │                        │
   │          ──────────   │                        │
   │                       │── POST /your/endpoint ▶│
   │                       │   { message: payload } │
   │                       │◀── { ... response ... }│
   │                       │   (×150+ with concurrency│
   │                       │    + rate limiting)     │
   │                       │                        │
   │                       │── POST /api/scans ─────▶│
   │                       │   NDJSON scan log       │
   │                       │   (attack results +     │
   │                       │    scan.final)          │
   │                       │                        │
   │                       │◀── { dashboardUrl } ───│
   │◀── Dashboard URL ─────│    (evaluation runs     │
   │                       │     server-side)        │
```

### Execution pipeline (detail)

1. **Config discovery** — walks up the directory tree looking for `fortifai.config.*`
2. **Payload fetch** — downloads the encrypted knowledge base from FortifAI Cloud using your API key; decrypts with AES-256-GCM + Brotli
3. **Scan stub** — notifies the dashboard that a scan has started (creates a `running` entry)
4. **Attack execution** — runs every `agent × payload` combination with configurable concurrency (`p-limit`) and token-bucket rate limiting
5. **Progress tracking** — writes `summary.checkpoint` records to the NDJSON log every 10% of completion
6. **Console summary** — prints request outcomes (2xx/4xx/5xx/timeouts), latency percentiles (p50/p95/p99), and signal counts
7. **Upload** — POSTs the complete NDJSON scan log to the dashboard; evaluation runs server-side and results appear in your dashboard

### Concurrency and rate limiting

Both knobs work together to prevent overloading your agent:

```
rateLimitPerSecond = 5    ← token bucket: max 5 new requests started per second
concurrency = 5           ← p-limit: max 5 requests in flight simultaneously

At steady state: ≤ 5 requests active + no burst beyond 5 new starts/second
```

Setting `--rate-limit 0` disables throttling (only concurrency cap applies). Setting `--concurrency 1` serializes all requests.

### Request handling

| Condition                 | Recorded as                         |
| ------------------------- | ----------------------------------- |
| HTTP response received    | Status code (2xx / 3xx / 4xx / 5xx) |
| No response in 10 seconds | `timeout`                           |
| DNS / network failure     | `error` + error message             |

All request and response bodies are captured verbatim in the NDJSON log for full forensic replay on the dashboard.

---

## NDJSON Scan Log

Every scan produces a structured NDJSON log that is uploaded to the dashboard. Each line is a JSON envelope:

```
{ "schema": "fortifai.scanlog/v1", "scanId": "scan_...", "seq": 1, "ts": "...", "kind": "...", "phase": "...", "level": "INFO", "data": { ... } }
```

### Record kinds

| `kind`               | When       | Description                                    |
| -------------------- | ---------- | ---------------------------------------------- |
| `scan.meta`          | Start      | CLI version, schema version, start time        |
| `scan.config`        | Start      | Execution params, agent list, payload count    |
| `scan.phase`         | Lifecycle  | Phase transitions (init → running → complete)  |
| `attack.result`      | Per attack | Payload sent, full request + response, latency |
| `summary.checkpoint` | Every 10%  | Running totals: outcomes, latency percentiles  |
| `scan.final`         | End        | Aggregate summary, per-agent stats, verdicts   |
| `scan.error`         | On failure | Error stage and message                        |

---

## Dashboard

After a scan completes, FortifAI Cloud evaluates every attack response using its LLM-based evaluation engine and populates your dashboard with:

- **Overall verdict** — `PASS` / `WARN` / `FAIL`
- **Risk score** — 0–10 composite score
- **Signal breakdown** — findings by `CRITICAL` / `HIGH` / `MEDIUM` / `LOW`
- **Per-agent evaluation** — individual verdict, score, and confidence per agent
- **OWASP Agentic Top 10 heatmap** — which attack categories landed
- **Full signal chain** — payload sent → agent response → detection evidence

The dashboard URL is printed at the end of every scan:

```
✔ Dashboard  https://getfortifai.com/dashboard/scans/scan_1234567890
```

---

## Security

- **Payload transport** — The attack knowledge base is encrypted with AES-256-GCM. Your API key is used for key derivation; payloads are never stored unencrypted on disk.
- **API authentication** — All requests to FortifAI Cloud use the `x-fortifai-key` header.
- **No data persistence** — The CLI does not write any files to disk. The scan log is built in memory and uploaded directly.
- **Request isolation** — Each agent invocation is a stateless HTTP call with a 10-second timeout.

---

## Development

### Setup

```bash
git clone https://github.com/fortifai/cli
cd cli
npm install
```

### Commands

```bash
npm run typecheck   # Type-check without emitting
npm test            # Run test suite (vitest)
npm run build       # Compile TypeScript → dist/
npm run dev         # Run CLI directly from source (tsx)
npm run scan        # Alias: tsx src/index.ts scan
```

### Project structure

```
src/
├── index.ts                  CLI entry point (Commander setup)
├── commands/
│   ├── scan.ts               fortifai scan — orchestrates a full scan run
│   └── auth.ts               fortifai auth — API key setup
├── config/
│   └── loadConfig.ts         Config file discovery and validation
├── attacks/
│   ├── loadPayloads.ts       Fetch + decrypt + decompress payload KB
│   └── executor.ts           Concurrent attack runner (p-limit + rate limiter)
├── agents/
│   └── invokeAgent.ts        Single HTTP request to an agent endpoint
├── report/
│   ├── ndjsonWriter.ts       In-memory NDJSON log builder
│   ├── formatter.ts          Console summary + metric aggregation
│   ├── uploadReport.ts       POST scan log to dashboard
│   └── notifyLifecycle.ts    Scan start/failure dashboard stubs
└── types/
    └── index.ts              Shared TypeScript types
```

### Running tests

```bash
npm test

# With coverage
npx vitest run --coverage
```

Tests are colocated in `__tests__/` and cover: config loading, payload decryption, concurrent attack execution, agent HTTP invocation, and report formatting.

---

## Troubleshooting

**`Invalid or inactive API key`**
→ Run `fortifai auth` to re-enter your key. Keys must start with `fai_` and be active in your dashboard.

**`Quota exceeded`**
→ Your plan's monthly attack quota has been reached. Upgrade or wait for the next billing cycle.

**All requests timing out**
→ Your agent endpoint is not reachable or is responding too slowly. Check `endpoint` in your config and ensure the service is running. The default timeout is 10 seconds per request.

**Config not found**
→ FortifAI searches upward from your working directory. Make sure `fortifai.config.yaml` (or `.ts`/`.js`) exists in the current directory or a parent. Use `--config <path>` to be explicit.

**`BLOB_READ_WRITE_TOKEN is not set` (self-hosted)**
→ Your backend is missing blob storage config. See the dashboard deployment guide.

---

## License

MIT © [FortifAI](https://getfortifai.com)

---

<div align="center">

**[FortifAI](https://getfortifai.com)** · **[Dashboard](https://app.getfortifai.com)** · **[npm](https://www.npmjs.com/package/@fortifai/cli)**

</div>
