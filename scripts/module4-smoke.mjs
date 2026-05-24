#!/usr/bin/env node

const baseUrl = requiredEnv("KUMPAS_BASE_URL").replace(/\/$/, "");
const sessionId = requiredEnv("KUMPAS_SESSION_ID");
const authCookie = requiredEnv("KUMPAS_AUTH_COOKIE");
const shouldMarkComplete = process.env.KUMPAS_MARK_COMPLETE !== "false";

const reportResponse = await postJson(`${baseUrl}/api/reports`, {
  sessionId,
});

assertEqual(reportResponse.sessionId, sessionId, "report sessionId");
assertNumberAtLeast(reportResponse.byteLength, 1, "report byteLength");
assertNumberAtLeast(
  reportResponse.recommendationCount,
  3,
  "report recommendationCount",
);
assertNonEmptyString(reportResponse.downloadUrl, "report downloadUrl");
assertFutureIsoDate(reportResponse.expiresAt, "report expiresAt");
assertNonEmptyString(reportResponse.generatedAt, "report generatedAt");
assertArrayAtLeast(reportResponse.recommendations, 3, "report recommendations");

for (const recommendation of reportResponse.recommendations) {
  assertNonEmptyString(recommendation.id, "recommendation id");
  assertNumberAtLeast(recommendation.rank, 1, "recommendation rank");
  assertNonEmptyString(recommendation.careerPath, "recommendation careerPath");
  assertNumberBetween(
    recommendation.alignmentScore,
    0,
    1,
    "recommendation alignmentScore",
  );
  assertArrayAtLeast(recommendation.keySignals, 1, "recommendation keySignals");
}

await verifySignedUrl(reportResponse.downloadUrl);

let completionResponse = null;
if (shouldMarkComplete) {
  completionResponse = await postJson(
    `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/complete`,
    {},
  );

  assertEqual(completionResponse.sessionId, sessionId, "completion sessionId");
  assertEqual(completionResponse.status, "complete", "completion status");
}

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
      completion: completionResponse,
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

async function verifySignedUrl(url) {
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Signed URL download failed with ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error(`Signed URL returned unexpected content-type: ${contentType}`);
  }

  const byteLength = Number(response.headers.get("content-length") ?? "0");
  if (byteLength < 1) {
    const buffer = await response.arrayBuffer();
    assertNumberAtLeast(buffer.byteLength, 1, "signed URL byteLength");
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
