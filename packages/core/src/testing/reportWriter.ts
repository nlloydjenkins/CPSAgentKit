// Markdown + JSON report writer.
import { promises as fs } from "fs";
import * as path from "path";
import type { ScenarioResult, TestRunResult } from "./types.js";

export async function writeReports(
  runDir: string,
  run: TestRunResult,
  suiteWarnings: string[] = [],
): Promise<void> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "results.json"),
    JSON.stringify(run, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(runDir, "report.md"),
    renderMarkdown(run, suiteWarnings),
    "utf-8",
  );
}

export function renderMarkdown(
  run: TestRunResult,
  suiteWarnings: string[] = [],
): string {
  const lines: string[] = [];
  const s = run.summary;
  lines.push(`# Agent test report — ${run.agent.displayName}`);
  lines.push("");
  lines.push(`- **Run id:** \`${run.runId}\``);
  lines.push(`- **Started:** ${run.startedAt}`);
  lines.push(`- **Completed:** ${run.completedAt}`);
  lines.push(`- **Agent folder:** \`${run.agent.agentFolder}\``);
  lines.push(`- **Bot schema name:** \`${run.agent.botSchemaName}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Total | Passed | Failed | Inconclusive | Errored |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(
    `| ${s.total} | ${s.passed} | ${s.failed} | ${s.inconclusive} | ${s.errored} |`,
  );
  lines.push("");

  if (suiteWarnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of suiteWarnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  const buckets: Record<string, ScenarioResult[]> = {
    failed: [],
    error: [],
    inconclusive: [],
    passed: [],
  };
  for (const r of run.scenarios) {
    buckets[r.status].push(r);
  }

  const sections: { title: string; key: keyof typeof buckets }[] = [
    { title: "Failed scenarios", key: "failed" },
    { title: "Errored scenarios", key: "error" },
    { title: "Inconclusive scenarios", key: "inconclusive" },
    { title: "Passed scenarios", key: "passed" },
  ];

  for (const sec of sections) {
    if (buckets[sec.key].length === 0) continue;
    lines.push(`## ${sec.title}`);
    lines.push("");
    for (const r of buckets[sec.key]) {
      lines.push(renderScenario(r));
      lines.push("");
    }
  }

  lines.push("## Raw artifacts");
  lines.push("");
  lines.push(
    "Per-scenario raw Direct Line activities are stored in `./activities/` next to this report.",
  );
  lines.push("");
  return lines.join("\n");
}

function renderScenario(r: ScenarioResult): string {
  const lines: string[] = [];
  lines.push(`### ${r.title}`);
  lines.push("");
  lines.push(`- **Id:** \`${r.id}\``);
  lines.push(`- **Status:** ${r.status}`);
  lines.push(`- **Duration:** ${r.durationMs} ms`);
  lines.push(`- **Activities:** \`./${r.activityFile}\``);
  lines.push("");

  if (r.deterministic.checks.length > 0) {
    lines.push("**Deterministic checks**");
    lines.push("");
    for (const c of r.deterministic.checks) {
      const detail = c.detail ? ` — ${c.detail}` : "";
      lines.push(`- ${c.status}: \`${c.name}\`${detail}`);
    }
    lines.push("");
  }

  if (r.judge) {
    lines.push("**Judge**");
    lines.push("");
    lines.push(`- Overall score: ${r.judge.overallScore}`);
    lines.push(`- Passed: ${r.judge.passed}`);
    if (r.judge.inconclusiveReason) {
      lines.push(`- Inconclusive: ${r.judge.inconclusiveReason}`);
    }
    for (const c of r.judge.criteria) {
      lines.push(`  - ${c.id}: ${c.score} — ${c.reason}`);
    }
    for (const f of r.judge.findings) {
      lines.push(`  - finding (${f.severity}): ${f.message}`);
    }
    lines.push("");
  }

  if (r.errors.length > 0) {
    lines.push("**Errors**");
    lines.push("");
    for (const e of r.errors) {
      lines.push(`- \`${e.code}\`: ${e.message}`);
    }
    lines.push("");
  }

  if (r.finalResponse) {
    lines.push("**Final response (truncated)**");
    lines.push("");
    lines.push("```text");
    lines.push(
      r.finalResponse.length > 1200
        ? `${r.finalResponse.slice(0, 1200)}…`
        : r.finalResponse,
    );
    lines.push("```");
  }
  return lines.join("\n");
}

export function buildTimestampFolder(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}
