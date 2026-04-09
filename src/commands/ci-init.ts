import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Command } from "commander";

type CiProvider = "github" | "gitlab" | "all";

const GITHUB_WORKFLOW = `# FortifAI — AI Agent Security Scan
# Runs on every push and pull request, blocking merges on critical findings.
# Docs: https://getfortifai.com/docs

name: FortifAI Security Scan

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master]

jobs:
  fortifai-scan:
    name: AI Agent Security Scan
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run FortifAI Security Scan
        env:
          FORTIFAI_API_KEY: \${{ secrets.FORTIFAI_API_KEY }}
        run: npx fortifai@latest scan --fail-on critical

      # Upload scan report as artifact (optional)
      - name: Upload Scan Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: fortifai-scan-report
          path: .fortifai/
          retention-days: 30
`;

const GITLAB_CI = `# FortifAI — AI Agent Security Scan
# Add FORTIFAI_API_KEY to your GitLab CI/CD variables (Settings > CI/CD > Variables)
# Docs: https://getfortifai.com/docs

fortifai-security-scan:
  stage: test
  image: node:20-slim
  script:
    - npx fortifai@latest scan --fail-on critical
  artifacts:
    when: always
    paths:
      - .fortifai/
    expire_in: 30 days
  rules:
    - if: \$CI_PIPELINE_SOURCE == "merge_request_event"
    - if: \$CI_COMMIT_BRANCH == \$CI_DEFAULT_BRANCH
`;

const BITBUCKET_PIPELINE = `# FortifAI — AI Agent Security Scan
# Add FORTIFAI_API_KEY to your Bitbucket repository variables
# Docs: https://getfortifai.com/docs

image: node:20

pipelines:
  default:
    - step:
        name: FortifAI Security Scan
        script:
          - npx fortifai@latest scan --fail-on critical
        artifacts:
          - .fortifai/**
`;

const CIRCLE_CI = `# FortifAI — AI Agent Security Scan
# Add FORTIFAI_API_KEY to your CircleCI project environment variables
# Docs: https://getfortifai.com/docs

version: 2.1

jobs:
  fortifai-scan:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Run FortifAI Security Scan
          command: npx fortifai@latest scan --fail-on critical
      - store_artifacts:
          path: .fortifai

workflows:
  security:
    jobs:
      - fortifai-scan
`;

function writeFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  console.log(`  ✓ Created ${filePath}`);
}

export function registerCiInitCommand(program: Command): void {
  program
    .command("ci-init")
    .description(
      "Scaffold CI/CD workflow files for FortifAI security scanning",
    )
    .option(
      "--provider <provider>",
      "CI provider: github, gitlab, bitbucket, circle, or all (default: github)",
      "github",
    )
    .option(
      "--fail-on <severity>",
      "Severity threshold in generated workflows (default: critical)",
      "critical",
    )
    .option(
      "--cwd <path>",
      "Directory to write workflow files into (default: current directory)",
    )
    .action(
      (opts: { provider: string; failOn: string; cwd?: string }) => {
        const root = resolve(opts.cwd ?? process.cwd());
        const provider = opts.provider.toLowerCase() as CiProvider | "bitbucket" | "circle";

        console.log(`\nFortifAI CI Init`);
        console.log(`Provider: ${provider}`);
        console.log(`Fail-on threshold: ${opts.failOn}\n`);

        // Inject custom fail-on into templates
        const githubWorkflow = GITHUB_WORKFLOW.replace(
          "--fail-on critical",
          `--fail-on ${opts.failOn}`,
        );
        const gitlabCi = GITLAB_CI.replace(
          "--fail-on critical",
          `--fail-on ${opts.failOn}`,
        );
        const bitbucketPipeline = BITBUCKET_PIPELINE.replace(
          "--fail-on critical",
          `--fail-on ${opts.failOn}`,
        );
        const circleCi = CIRCLE_CI.replace(
          "--fail-on critical",
          `--fail-on ${opts.failOn}`,
        );

        if (provider === "github" || provider === "all") {
          writeFile(
            resolve(root, ".github/workflows/fortifai.yml"),
            githubWorkflow,
          );
        }
        if (provider === "gitlab" || provider === "all") {
          writeFile(resolve(root, ".gitlab-ci-fortifai.yml"), gitlabCi);
          console.log(
            "  → Merge this into your existing .gitlab-ci.yml or include it:",
          );
          console.log("    include:\n      - local: .gitlab-ci-fortifai.yml");
        }
        if (provider === "bitbucket" || provider === "all") {
          writeFile(
            resolve(root, "bitbucket-pipelines-fortifai.yml"),
            bitbucketPipeline,
          );
          console.log(
            "  → Copy the step into your existing bitbucket-pipelines.yml",
          );
        }
        if (provider === "circle" || provider === "all") {
          writeFile(resolve(root, ".circleci/fortifai.yml"), circleCi);
        }

        console.log(`
Next steps:
  1. Add your FortifAI API key as a CI secret named FORTIFAI_API_KEY
     (Dashboard → Settings → API Keys → getfortifai.com/dashboard/settings)
  2. Ensure fortifai.config.ts exists in your repo root
  3. Commit the workflow file and push

  Docs: https://getfortifai.com/docs
`);
      },
    );
}
