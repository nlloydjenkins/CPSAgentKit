import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  planKnowledgeDescriptions,
  planEntryFromYaml,
  extractScalar,
  isPlaceholderDescription,
  buildLookupUrl,
} from "../../knowledge/descriptionPlanner.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cps-kdesc-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const SAMPLE_AGENT_ID = "3a76e605-f446-f111-bec5-6045bd09c8e7";
const SAMPLE_TENANT_ID = "11111111-2222-3333-4444-555555555555";
const SAMPLE_ENDPOINT = "https://contoso.crm.dynamics.com";

async function writeConn(folder: string): Promise<void> {
  const mcs = path.join(folder, ".mcs");
  await fs.mkdir(mcs, { recursive: true });
  await fs.writeFile(
    path.join(mcs, "conn.json"),
    JSON.stringify({
      DataverseEndpoint: SAMPLE_ENDPOINT,
      EnvironmentId: "env1",
      AgentId: SAMPLE_AGENT_ID,
      AccountInfo: {
        TenantId: SAMPLE_TENANT_ID,
        AccountEmail: "maker@contoso.com",
      },
    }),
  );
}

async function writeKnowledgeMirror(
  folder: string,
  fileName: string,
  body: string,
): Promise<void> {
  const dir = path.join(folder, "knowledge", "files");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), body);
}

describe("extractScalar", () => {
  it("reads inline values under a parent", () => {
    const yaml = `mcs.metadata:\n  componentName: vpn-setup.md\n  description: Plain inline value\n`;
    expect(extractScalar(yaml, "mcs.metadata", "componentName")).toBe(
      "vpn-setup.md",
    );
    expect(extractScalar(yaml, "mcs.metadata", "description")).toBe(
      "Plain inline value",
    );
  });

  it("reads folded block scalars", () => {
    const yaml =
      "mcs.metadata:\n  description: >-\n    line one\n    line two\nkind: KnowledgeSourceConfiguration\n";
    expect(extractScalar(yaml, "mcs.metadata", "description")).toBe(
      "line one line two",
    );
  });

  it("returns undefined when the parent block does not contain the key", () => {
    const yaml = `mcs.metadata:\n  componentName: vpn-setup.md\nkind: K\n`;
    expect(extractScalar(yaml, "mcs.metadata", "description")).toBeUndefined();
  });

  it("strips surrounding single and double quotes", () => {
    const yaml = `mcs.metadata:\n  description: "Quoted: yes"\n`;
    expect(extractScalar(yaml, "mcs.metadata", "description")).toBe(
      "Quoted: yes",
    );
  });
});

describe("isPlaceholderDescription", () => {
  it("matches the auto-generated mirror placeholder", () => {
    expect(
      isPlaceholderDescription(
        "This knowledge source searches information contained in vpn-setup.md",
      ),
    ).toBe(true);
  });
  it("does not match a real description", () => {
    expect(
      isPlaceholderDescription(
        "UK employee benefits handbook covering health and dental.",
      ),
    ).toBe(false);
  });
  it("treats empty values as not placeholder", () => {
    expect(isPlaceholderDescription(undefined)).toBe(false);
    expect(isPlaceholderDescription("")).toBe(false);
  });
});

describe("buildLookupUrl", () => {
  it("OData-escapes single quotes in the component name", () => {
    const url = buildLookupUrl(SAMPLE_ENDPOINT, SAMPLE_AGENT_ID, "o'reilly.md");
    // The filter is URL-encoded as a whole; check the doubled single quote
    // and the agent id are both present.
    expect(url).toContain(SAMPLE_AGENT_ID);
    expect(decodeURIComponent(url)).toContain("o''reilly.md");
    expect(decodeURIComponent(url)).toContain("componenttype eq 14");
  });
});

describe("planEntryFromYaml", () => {
  const conn = {
    dataverseEndpoint: SAMPLE_ENDPOINT,
    agentId: SAMPLE_AGENT_ID,
    tenantId: SAMPLE_TENANT_ID,
  };

  it("flags placeholder mirror descriptions and marks the entry not-ready", () => {
    const yaml =
      "mcs.metadata:\n" +
      "  componentName: vpn-setup.md\n" +
      "  description: This knowledge source searches information contained in vpn-setup.md\n" +
      "kind: KnowledgeSourceConfiguration\n";
    const entry = planEntryFromYaml("vpn-setup.mcs.yml", yaml, conn);
    expect(entry.componentName).toBe("vpn-setup.md");
    expect(entry.mirrorIsPlaceholder).toBe(true);
    expect(entry.ready).toBe(false);
    expect(entry.notReadyReason).toBe("placeholder-description");
  });

  it("uses an explicit cpsAgentKit.description override when present", () => {
    const yaml =
      "cpsAgentKit:\n" +
      "  description: VPN setup runbook covering split-tunnel and MFA enrolment.\n" +
      "mcs.metadata:\n" +
      "  componentName: vpn-setup.md\n" +
      "  description: This knowledge source searches information contained in vpn-setup.md\n";
    const entry = planEntryFromYaml("vpn-setup.mcs.yml", yaml, conn);
    expect(entry.ready).toBe(true);
    expect(entry.descriptionSource).toBe("cpsAgentKit-override");
    expect(entry.description).toBe(
      "VPN setup runbook covering split-tunnel and MFA enrolment.",
    );
    expect(entry.patchRequest.body.description).toBe(entry.description);
    expect(entry.lookupRequest.url).toContain(SAMPLE_AGENT_ID);
    expect(entry.patchRequest.urlTemplate).toContain("{botComponentId}");
  });

  it("falls back to mcs.metadata.description when it is not a placeholder", () => {
    const yaml =
      "mcs.metadata:\n" +
      "  componentName: vpn-setup.md\n" +
      "  description: Real description authored in the portal.\n";
    const entry = planEntryFromYaml("x.yml", yaml, conn);
    expect(entry.ready).toBe(true);
    expect(entry.descriptionSource).toBe("mcs-metadata");
    expect(entry.description).toBe("Real description authored in the portal.");
  });

  it("marks entries missing componentName as not-ready", () => {
    const yaml = "kind: KnowledgeSourceConfiguration\n";
    const entry = planEntryFromYaml("x.yml", yaml, conn);
    expect(entry.ready).toBe(false);
    expect(entry.notReadyReason).toBe("missing-component-name");
  });
});

describe("planKnowledgeDescriptions", () => {
  it("plans entries for parent and child knowledge mirrors", async () => {
    await writeConn(tmp);
    await writeKnowledgeMirror(
      tmp,
      "vpn.mcs.yml",
      "cpsAgentKit:\n  description: VPN runbook\nmcs.metadata:\n  componentName: vpn.md\n  description: This knowledge source searches information contained in vpn.md\n",
    );
    const child = path.join(tmp, "agents", "Notifier");
    await writeKnowledgeMirror(
      child,
      "notif.mcs.yml",
      "cpsAgentKit:\n  description: Notification templates\nmcs.metadata:\n  componentName: notif.md\n  description: This knowledge source searches information contained in notif.md\n",
    );

    const plan = await planKnowledgeDescriptions(tmp);
    expect(plan.conn.agentId).toBe(SAMPLE_AGENT_ID);
    expect(plan.entries).toHaveLength(2);
    const names = plan.entries.map((e) => e.componentName).sort();
    expect(names).toEqual(["notif.md", "vpn.md"]);
    for (const entry of plan.entries) {
      expect(entry.ready).toBe(true);
      expect(entry.descriptionSource).toBe("cpsAgentKit-override");
      expect(entry.lookupRequest.url).toContain(SAMPLE_AGENT_ID);
    }
  });

  it("throws when conn.json is missing", async () => {
    await expect(planKnowledgeDescriptions(tmp)).rejects.toThrow(/conn\.json/);
  });
});
