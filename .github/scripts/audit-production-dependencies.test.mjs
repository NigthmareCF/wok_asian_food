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

test("la excepcion expira y bloquea tambien dependencias transitivas", () => {
  const vulnerabilities = {
    "node-forge": allowedNodeForge,
    expo: { severity: "high", via: ["node-forge"] },
  };
  assert.equal(isAllowedVulnerability("expo", vulnerabilities, new Set(), "2026-11-02"), true);
  assert.equal(isAllowedVulnerability("expo", vulnerabilities, new Set(), "2026-11-03"), false);
});

test("un aviso critico no hereda una excepcion de severidad alta", () => {
  const vulnerabilities = {
    "node-forge": { ...allowedNodeForge, severity: "critical" },
  };
  assert.equal(isAllowedVulnerability("node-forge", vulnerabilities), false);
});

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

test("permite ciclos que solo alcanzan avisos documentados", () => {
  const vulnerabilities = {
    "node-forge": allowedNodeForge,
    braces: {
      severity: "high",
      via: [
        {
          severity: "high",
          url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
        },
      ],
    },
    micromatch: { severity: "high", via: ["braces"] },
    "metro-file-map": { severity: "high", via: ["micromatch"] },
    metro: { severity: "high", via: ["metro-config", "metro-file-map"] },
    "metro-config": { severity: "high", via: ["metro"] },
    expo: { severity: "high", via: ["metro", "node-forge"] },
  };

  assert.deepEqual(classifyAuditReport({ vulnerabilities }), {
    allowed: [
      "node-forge",
      "braces",
      "micromatch",
      "metro-file-map",
      "metro",
      "metro-config",
      "expo",
    ],
    blocking: [],
  });
});

test("bloquea ciclos que alcanzan un aviso sin excepcion", () => {
  const vulnerabilities = {
    alpha: { severity: "high", via: ["beta", "gamma"] },
    beta: { severity: "high", via: ["alpha"] },
    gamma: {
      severity: "high",
      via: [
        {
          severity: "high",
          url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz",
        },
      ],
    },
  };

  assert.deepEqual(classifyAuditReport({ vulnerabilities }), {
    allowed: [],
    blocking: ["alpha", "beta", "gamma"],
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
