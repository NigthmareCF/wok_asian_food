import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

// Expo 57 brings node-forge through build-time CLI packages. Upstream has not
// published a patched npm version for this advisory yet.
export const allowedAdvisories = new Map([
  [
    "GHSA-86W9-CPQP-85RV",
    {
      packageName: "node-forge",
      reviewBy: "2026-11-02",
      reason: "Transitive Expo CLI dependency with no patched npm release.",
    },
  ],
]);

function advisoryId(url = "") {
  return url.match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase() ?? null;
}

function directAdvisories(vulnerability) {
  return (vulnerability.via ?? []).filter(
    (entry) => typeof entry === "object" && entry !== null,
  );
}

function transitiveDependencies(vulnerability, vulnerabilities) {
  return (vulnerability.via ?? []).filter(
    (entry) =>
      typeof entry === "string" &&
      BLOCKING_SEVERITIES.has(vulnerabilities[entry]?.severity),
  );
}

export function isAllowedVulnerability(
  packageName,
  vulnerabilities,
  visiting = new Set(),
) {
  if (visiting.has(packageName)) {
    return false;
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) {
    return false;
  }

  const nextVisiting = new Set(visiting).add(packageName);
  const direct = directAdvisories(vulnerability);
  const transitive = transitiveDependencies(vulnerability, vulnerabilities);

  if (direct.length === 0 && transitive.length === 0) {
    return false;
  }

  const directAllowed = direct.every((advisory) => {
    const id = advisoryId(advisory.url);
    const exception = id ? allowedAdvisories.get(id) : undefined;
    return exception?.packageName === packageName;
  });

  const transitiveAllowed = transitive.every((dependencyName) =>
    isAllowedVulnerability(dependencyName, vulnerabilities, nextVisiting),
  );

  return directAllowed && transitiveAllowed;
}

export function classifyAuditReport(report) {
  if (report.error || !report.vulnerabilities) {
    throw new Error(
      report.error?.summary ?? "Respuesta de npm audit incompleta.",
    );
  }

  const blocking = [];
  const allowed = [];

  for (const [packageName, vulnerability] of Object.entries(
    report.vulnerabilities,
  )) {
    if (!BLOCKING_SEVERITIES.has(vulnerability.severity)) {
      continue;
    }

    if (isAllowedVulnerability(packageName, report.vulnerabilities)) {
      allowed.push(packageName);
    } else {
      blocking.push(packageName);
    }
  }

  return { allowed, blocking };
}

function runAudit() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCliPath = process.env.WOK_NPM_CLI_PATH;
  const command = npmCliPath ? process.execPath : npmCommand;
  const args = npmCliPath
    ? [npmCliPath, "audit", "--omit=dev", "--json"]
    : ["audit", "--omit=dev", "--json"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `npm audit no devolvio JSON valido. ${result.stderr}`.trim(),
    );
  }

  const { allowed, blocking } = classifyAuditReport(report);

  if (allowed.length > 0) {
    console.warn(
      `Excepcion temporal documentada: ${allowed.sort().join(", ")}. ` +
        "Consultar docs/security/DEPENDENCY_EXCEPTIONS.md.",
    );
  }

  if (blocking.length > 0) {
    console.error(
      `Alertas altas o criticas sin excepcion: ${blocking.sort().join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("No hay alertas altas o criticas sin una excepcion documentada.");
}

const executedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  try {
    runAudit();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
