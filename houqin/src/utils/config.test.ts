import { describe, expect, it } from "vitest";

import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("returns safe defaults for invalid shapes", () => {
    expect(parseConfig(null)).toEqual({
      chain: [],
      excludes: [],
      seeds: [],
    });
  });

  it("keeps only string values and trims whitespace", () => {
    expect(
      parseConfig({
        chain: [" /source ", 10, "", " /dest "],
        excludes: [" Cache ", null, "skip-me"],
        seeds: [" Photos/Trips ", false, "Shows/Queued"],
      }),
    ).toEqual({
      chain: ["/source", "/dest"],
      excludes: ["Cache", "skip-me"],
      seeds: ["Photos/Trips", "Shows/Queued"],
    });
  });
});

