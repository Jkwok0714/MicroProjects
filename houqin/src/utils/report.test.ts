import { describe, expect, it } from "vitest";

import { createStepPanels } from "./report";

describe("createStepPanels", () => {
  it("combines step movement and conflicts for accordion display", () => {
    const panels = createStepPanels({
      jobId: "job-1",
      status: "completed",
      totalFilesMoved: 3,
      steps: [
        {
          sourceIndex: 1,
          destinationIndex: 2,
          sourcePath: "/one",
          destinationPath: "/two",
          filesMoved: 2,
          subdirectories: [
            { directory: "Docs", filesMoved: 1 },
            { directory: ".", filesMoved: 1 },
          ],
        },
      ],
      conflicts: [
        {
          stepLabel: "1 -> 2",
          source: "/one/Docs/existing.txt",
          destination: "/two/Docs/existing.txt",
        },
      ],
    });

    expect(panels).toEqual([
      {
        label: "1 -> 2",
        filesMoved: 2,
        conflictsCount: 1,
        subdirectories: [
          { directory: ".", filesMoved: 1 },
          { directory: "Docs", filesMoved: 1 },
        ],
      },
    ]);
  });
});

