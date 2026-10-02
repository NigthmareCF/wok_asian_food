import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyAuditReport,
  isAllowedVulnerability,
} from "./audit-production-dependencies.mjs";

const allowedNodeForge = {
  name: "node-forge",
  severity: "high",
  via: [
    {
      severity: "high",
      url: "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
    },
  ],
};

test("permite solamente el aviso documentado de node-forge", () => {
  const vulnerabilities = { "node-forge": allowedNodeForge };

  assert.equal(isAllowedVulnerability("node-forge", vulnerabilities), true);
  assert.deepEqual(classifyAuditReport({ vulnerabilities }), {
    allowed: ["node-forge"],
    blocking: [],
  });
});

test("permite dependencias afectadas solo de forma transitiva por el aviso documentado", () => {
  const vulnerabilities = {
    "node-forge": allowedNodeForge,
    uuid: {
      severity: "moderate",
      via: [
        {
          severity: "moderate",
          url: "https://github.com/advisories/GHSA-w5hq-g745-h8pq",
        },
      ],
    },
    "@expo/cli": { severity: "high", via: ["node-forge", "uuid"] },
    expo: { severity: "high", via: ["@expo/cli", "uuid"] },
  };

  assert.deepEqual(classifyAuditReport({ vulnerabilities }), {
    allowed: ["node-forge", "@expo/cli", "expo"],
    blocking: [],
  });
});

test("bloquea cualquier aviso alto diferente", () => {
  const vulnerabilities = {
    "other-package": {
      severity: "critical",
      via: [
        {
          severity: "critical",
          url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz",
        },
      ],
    },
  };

  assert.deepEqual(classifyAuditReport({ vulnerabilities }), {
    allowed: [],
    blocking: ["other-package"],
  });
});

test("bloquea respuestas incompletas del registro", () => {
  assert.throws(() => classifyAuditReport({}), /incompleta/);
});
