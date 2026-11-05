import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingBudget, ProcessingError, ProviderError, isTransientFailure, requestProviderJson, retryDelayMs } from "@/lib/processing-budget";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T00:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const transient = () => new ProviderError(503, null, {});

describe("SW-15 bounded retries", () => {
  it("waits two seconds and retries once, even after a second transient failure", async () => {
    const operation = vi.fn().mockRejectedValue(transient());
    const pending = new ProcessingBudget().run("synthesis", operation);
    const checked = expect(pending).rejects.toThrow("HTTP 503");
    await vi.advanceTimersByTimeAsync(1999); expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await checked;
    expect(operation).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([400, 401, 403, 404, 422])("does not retry HTTP %s", async (status) => {
    const operation = vi.fn().mockRejectedValue(new ProviderError(status, null, {}));
    await expect(new ProcessingBudget().run("embedding", operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it.each([{ message: "Quota exhausted" }, { quotaId: "GenerateRequestsPerDay" }, { quotaLimit: 0 }])("does not retry exhausted quota: %j", async (details) => {
    const operation = vi.fn().mockRejectedValue(new ProviderError(429, "2", details));
    await expect(new ProcessingBudget().run("extraction", operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("honors a longer Retry-After, including HTTP dates and Gemini RetryInfo", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new ProviderError(429, "5", {})).mockResolvedValue("ok");
    const pending = new ProcessingBudget().run("specialist", operation);
    await vi.advanceTimersByTimeAsync(4999); expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toBe("ok");
    expect(retryDelayMs(new ProviderError(429, new Date(Date.now() + 6000).toUTCString(), {}), Date.now())).toBe(6000);
    expect(retryDelayMs(Object.assign(new Error('{"details":[{"retryDelay":"7s"}]}'), { status: 429 }), Date.now())).toBe(7000);
  });
  it("stops without a retry when the provider delay cannot fit the remaining second", async () => {
    const operation = vi.fn().mockRejectedValue(new ProviderError(429, "5", {}));
    await expect(new ProcessingBudget(Date.now() + 1000).run("PDF", operation)).rejects.toMatchObject({ code: "retry_delay", stage: "PDF" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("aborts a hung provider and rejects its late completion", async () => {
    let signal: AbortSignal | undefined;
    let complete!: (value: string) => void;
    const operation = vi.fn((value: AbortSignal) => { signal = value; return new Promise<string>((resolve) => { complete = resolve; }); });
    const pending = new ProcessingBudget(Date.now() + 1000).run("explanation", operation);
    const checked = expect(pending).rejects.toMatchObject({ code: "deadline" });
    await vi.advanceTimersByTimeAsync(1000); await checked;
    expect(signal?.aborted).toBe(true); complete("too late");
    expect(operation).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([-1, 0, 1])("rejects synchronous completion %s ms relative to the deadline except just before", async (offset) => {
    const deadline = Date.now() + 1000;
    const pending = new ProcessingBudget(deadline).run("PDF", async () => { vi.setSystemTime(deadline + offset); return "draft"; });
    if (offset < 0) await expect(pending).resolves.toBe("draft");
    else await expect(pending).rejects.toMatchObject({ code: "deadline" });
  });
  it("shares one budget across later stages and includes backoff and storage", async () => {
    const budget = new ProcessingBudget();
    const analysis = budget.run("retrieval and analysis", async () => { await new Promise((r) => setTimeout(r, 295000)); }, false);
    await vi.advanceTimersByTimeAsync(295000); await analysis;
    const explanation = vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue("ok");
    const pending = budget.run("explanation", explanation);
    await vi.advanceTimersByTimeAsync(2000); await pending;
    const pdf = budget.run("PDF storage", async () => { await new Promise((r) => setTimeout(r, 4000)); return "draft"; });
    const checked = expect(pdf).rejects.toMatchObject({ stage: "PDF storage", code: "deadline" });
    await vi.advanceTimersByTimeAsync(3000); await checked;
    expect(Date.now()).toBe(budget.deadlineAt);
  });
  it("does not classify validation/programming errors as transient", () => {
    expect(isTransientFailure(new SyntaxError("bad JSON"))).toBe(false);
    expect(isTransientFailure(new Error("invalid input"))).toBe(false);
    expect(isTransientFailure(new ProcessingError("PDF", "deadline"))).toBe(false);
    expect(isTransientFailure(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }))).toBe(true);
  });
  it("reads provider body and Retry-After under the extraction budget", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ message: "temporarily busy" }, { status: 429, headers: { "Retry-After": "5" } })).mockResolvedValueOnce(Response.json({ extracted: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = requestProviderJson("https://provider.invalid", { method: "POST" });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ extracted: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
