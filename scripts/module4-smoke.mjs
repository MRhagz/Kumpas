#!/usr/bin/env node

const baseUrl = requiredEnv("KUMPAS_BASE_URL").replace(/\/$/, "");
const sessionId = requiredEnv("KUMPAS_SESSION_ID");
const authCookie = requiredEnv("KUMPAS_AUTH_COOKIE");
const runId = requiredEnv("KUMPAS_RUN_ID");

const reportResponse = await postJson(`${baseUrl}/api/reports`, {
  sessionId,
  runId,
});

assertEqual(reportResponse.sessionId, sessionId, "report sessionId");
assertNumberAtLeast(reportResponse.byteLength, 1, "report byteLength");
assertNumberAtLeast(
  reportResponse.recommendationCount,
  1,
  "report recommendationCount",
);
assertNumberAtLeast(reportResponse.reportVersion, 1, "report version");
assertFutureIsoDate(reportResponse.expiresAt, "report expiresAt");
assertNonEmptyString(reportResponse.generatedAt, "report generatedAt");
assertArrayAtLeast(reportResponse.recommendations, 1, "report recommendations");

for (const recommendation of reportResponse.recommendations) {
  assertNonEmptyString(recommendation.id, "recommendation id");
  if (recommendation.rank !== null) assertNumberAtLeast(recommendation.rank, 1, "recommendation rank");
  assertNonEmptyString(recommendation.careerPath, "recommendation careerPath");
  if (recommendation.alignmentScore !== null) assertNumberBetween(
    recommendation.alignmentScore,
    0,
    100,
    "recommendation alignmentScore",
  );
  assertArrayAtLeast(recommendation.keySignals, 1, "recommendation keySignals");
}

assertEqual(Date.parse(reportResponse.expiresAt) - Date.parse(reportResponse.generatedAt),
  24 * 60 * 60 * 1000, "PDF lifetime in milliseconds");
await verifyPdfAccess(reportResponse);

console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId,
      report: {
        byteLength: reportResponse.byteLength,
        recommendationCount: reportResponse.recommendationCount,
        expiresAt: reportResponse.expiresAt,
      },
      reportVersion: reportResponse.reportVersion,
    },
    null,
    2,
  ),
);

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authCookie,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `${url} failed with ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }

  return responseBody;
}

async function verifyPdfAccess(report) {
  const path = `/api/reports/${encodeURIComponent(sessionId)}?version=${report.reportVersion}&download=1`;
  const anonymous = await fetch(baseUrl + path, { redirect: "manual" });
  assertEqual(anonymous.status, 401, "unauthenticated PDF read");
  const response = await fetch(baseUrl + path, { headers: { Cookie: authCookie }, redirect: "manual" });
  if (report.downloadUrl === null) {
    assertEqual(response.status, 404, "unapproved PDF read");
    return;
  }

  assertEqual(report.downloadUrl, path, "approved version URL");
  if (!response.ok) {
    throw new Error(`Authorized PDF read failed with ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error(`PDF route returned unexpected content-type: ${contentType}`);
  }

  const byteLength = Number(response.headers.get("content-length") ?? "0");
  if (byteLength < 1) {
    const buffer = await response.arrayBuffer();
    assertNumberAtLeast(buffer.byteLength, 1, "PDF byteLength");
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 200)}`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${actual}.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNumberAtLeast(value, minimum, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be at least ${minimum}, got ${value}.`);
  }
}

function assertNumberBetween(value, minimum, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum}, got ${value}.`,
    );
  }
}

function assertArrayAtLeast(value, minimumLength, label) {
  if (!Array.isArray(value) || value.length < minimumLength) {
    throw new Error(
      `${label} must contain at least ${minimumLength} item(s), got ${value?.length}.`,
    );
  }
}

function assertFutureIsoDate(value, label) {
  assertNonEmptyString(value, label);

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid ISO date.`);
  }

  if (timestamp <= Date.now()) {
    throw new Error(`${label} must be in the future.`);
  }
}
