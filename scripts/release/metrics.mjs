export function summarize(samples, durationMs) {
  const latencies = samples.filter(s => s.outcome === "success").map(s => s.durationMs).sort((a, b) => a - b);
  const successful = latencies.length;
  return {
    attempts: samples.length, successful, failures: samples.length - successful,
    errorRate: samples.length ? (samples.length - successful) / samples.length : 0,
    throughputPerSecond: durationMs > 0 ? successful / (durationMs / 1000) : 0,
    latencyMs: successful ? { min: latencies[0], median: successful % 2 ? latencies[(successful - 1) / 2]
      : (latencies[successful / 2 - 1] + latencies[successful / 2]) / 2,
    p95: latencies[Math.ceil(.95 * successful) - 1], max: latencies.at(-1) } : null,
    within300Seconds: samples.length > 0 && samples.every(s => s.outcome === "success" && s.durationMs <= 300_000),
  };
}

export function validateWorkload(manifest) {
  const url = new URL(manifest.url);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || !/^[a-f0-9]{40}$/.test(manifest.commit) || manifest.syntheticOnly !== true) throw new Error("Invalid release origin, commit or synthetic-data acknowledgement.");
  for (const field of ["deploymentId", "hardware", "network", "providerQuota", "databaseTier", "sourceSnapshot", "providerVerificationRecord"]) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) throw new Error(`Record ${field} before measuring.`);
  }
  if (!Array.isArray(manifest.waves) || !manifest.waves.length) throw new Error("Prepared workload waves are required.");
  const ids = new Set();
  for (const wave of manifest.waves) {
    if (!["warmup", "sequential", "cold", "concurrent", "stress"].includes(wave.kind) || !wave.sessions?.length) throw new Error("Invalid wave.");
    for (const sample of wave.sessions) {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sample.sessionId) || ids.has(sample.sessionId) || !sample.storageState
        || !["full", "partial", "notes"].includes(sample.profile) || !sample.account) throw new Error("Use unique prepared sessions, synthetic account labels and storage-state files.");
      ids.add(sample.sessionId);
    }
  }
}

export function qualificationCoverage(waves) {
  const sequential = waves.filter(w => w.kind === "sequential").flatMap(w => w.sessions);
  const concurrent = waves.filter(w => w.kind === "concurrent");
  return {
    P01: waves.filter(w => w.kind === "warmup").reduce((n, w) => n + w.sessions.length, 0) === 5
      && waves.filter(w => w.kind === "cold").reduce((n, w) => n + w.sessions.length, 0) === 3
      && ["warmup", "sequential", "cold"].every(kind => waves.filter(w => w.kind === kind).every(w => w.sessions.length === 1))
      && ["full", "partial", "notes"].every(profile => sequential.filter(s => s.profile === profile).length === 10),
    P02: concurrent.length === 5 && concurrent.every(w => w.sessions.length === 5
      && new Set(w.sessions.map(s => s.account)).size === 5
      && new Set(w.sessions.map(s => s.storageState)).size === 5)
      && waves.filter(w => w.kind === "stress").length === 1
      && waves.find(w => w.kind === "stress")?.sessions.length === 10,
  };
}
