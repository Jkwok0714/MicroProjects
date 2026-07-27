import { describe, expect, it } from "vitest";

import { applyJobResult, applyJobStart, createInitialRunState } from "./runState";

describe("runState helpers", () => {
  it("marks the UI busy when a job starts", () => {
    const next = applyJobStart(createInitialRunState(), "job-7");

    expect(next.isBusy).toBe(true);
    expect(next.activeJobId).toBe("job-7");
    expect(next.report).toBeNull();
  });

  it("releases the UI lock and stores the final report", () => {
    const start = applyJobStart(createInitialRunState(), "job-7");
    const next = applyJobResult(start, {
      jobId: "job-7",
      status: "canceled",
      totalFilesMoved: 1,
      steps: [],
      conflicts: [],
    });

    expect(next.isBusy).toBe(false);
    expect(next.activeJobId).toBeNull();
    expect(next.report?.status).toBe("canceled");
  });
});
