#!/usr/bin/env node

const baseUrl = requiredEnv("KUMPAS_BASE_URL").replace(/\/$/, "");
const sessionId = requiredEnv("KUMPAS_SESSION_ID");
const authCookie = requiredEnv("KUMPAS_AUTH_COOKIE");
const cleanupSecret = process.env.KUMPAS_SESSION_CLEANUP_SECRET;
const shouldTerminate = process.env.KUMPAS_TERMINATE_SESSION === "true";

const sessionState = await getJson(
  `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
  { Cookie: authCookie },
);

assertEqual(sessionState.sessionId, sessionId, "session state sessionId");
assertNonEmptyString(sessionState.status, "session state status");
assertNonEmptyString(sessionState.expiresAt, "session state expiresAt");
assertNonEmptyString(sessionState.lastActivity, "session state lastActivity");
assertObject(sessionState.moduleStatus, "session state moduleStatus");
assertNonEmptyString(sessionState.reportStatus, "session state reportStatus");
assertBoolean(sessionState.hasApprovedProfile, "session state hasApprovedProfile");
assertBoolean(sessionState.hasRecommendations, "session state hasRecommendations");
assertBoolean(sessionState.hasReport, "session state hasReport");
assertAllowedValue(sessionState.nextStep, [
  "input",
  "analysis",
  "report",
  "complete",
  "start-new-session",
], "session state nextStep");

const ingestionFreshness = await getJson(`${baseUrl}/api/ingestion/freshness`, {
  Cookie: authCookie,
});
assertNonEmptyString(ingestionFreshness.generatedAt, "ingestion freshness generatedAt");
assertArray(ingestionFreshness.records, "ingestion freshness records");
for (const [index, record] of ingestionFreshness.records.entries()) {
  assertNonEmptyString(
    record.sourceType,
    `ingestion freshness record ${index} sourceType`,
  );
  assertNullableString(
    record.lastIngestionTimestamp,
    `ingestion freshness record ${index} lastIngestionTimestamp`,
  );
  assertNonEmptyString(
    record.updatedAt,
    `ingestion freshness record ${index} updatedAt`,
  );
}

const unauthorizedCleanup = await fetch(`${baseUrl}/api/sessions/expired`, {
  method: "GET",
});
assertEqual(unauthorizedCleanup.status, 401, "unauthorized expired cleanup status");

let cleanupResponse = null;
if (cleanupSecret) {
  cleanupResponse = await getJson(`${baseUrl}/api/sessions/expired?limit=1`, {
    "x-session-cleanup-secret": cleanupSecret,
  });

  assertNonEmptyString(cleanupResponse.cutoff, "expired cleanup cutoff");
  assertNumberAtLeast(cleanupResponse.scannedCount, 0, "expired cleanup scannedCount");
  assertNumberAtLeast(cleanupResponse.expiredCount, 0, "expired cleanup expiredCount");
  assertNumberAtLeast(cleanupResponse.warningCount, 0, "expired cleanup warningCount");
  assertArray(cleanupResponse.warnings, "expired cleanup warnings");
}

let terminationResponse = null;
if (shouldTerminate) {
  terminationResponse = await deleteJson(
    `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
    { Cookie: authCookie },
  );

  assertEqual(terminationResponse.sessionId, sessionId, "termination sessionId");
  assertEqual(terminationResponse.status, "terminated", "termination status");
  assertBoolean(terminationResponse.reportPdfPurged, "termination reportPdfPurged");
  assertNumberAtLeast(
    terminationResponse.redactedImagesPurged,
    0,
    "termination redactedImagesPurged",
  );
  assertBoolean(terminationResponse.sessionRowsPurged, "termination sessionRowsPurged");
  assertBoolean(terminationResponse.sessionScrubbed, "termination sessionScrubbed");
  assertArray(terminationResponse.warnings, "termination warnings");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId,
      sessionState: {
        status: sessionState.status,
        nextStep: sessionState.nextStep,
        reportStatus: sessionState.reportStatus,
      },
      ingestionFreshness: {
        recordCount: ingestionFreshness.records.length,
      },
      expiredCleanup: cleanupResponse,
      termination: terminationResponse,
    },
    null,
    2,
  ),
);

async function getJson(url, headers = {}) {
  const response = await fetch(url, { method: "GET", headers });
  return readOkJson(response, url);
}

async function deleteJson(url, headers = {}) {
  const response = await fetch(url, { method: "DELETE", headers });
  return readOkJson(response, url);
}

async function readOkJson(response, url) {
  const responseBody = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `${url} failed with ${response.status}: ${JSON.stringify(responseBody)}`,
    );
  }

  return responseBody;
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

function assertNullableString(value, label) {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${label} must be null or a string.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

function assertNumberAtLeast(value, minimum, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be at least ${minimum}, got ${value}.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function assertObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertAllowedValue(value, allowedValues, label) {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `${label} must be one of ${allowedValues.join(", ")}, got ${value}.`,
    );
  }
}
