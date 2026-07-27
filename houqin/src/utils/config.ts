import type { HouqinConfig } from "../types";

const sanitizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseConfig = (value: unknown): HouqinConfig => {
  if (!value || typeof value !== "object") {
    return {
      chain: [],
      excludes: [],
      seeds: [],
    };
  }

  const candidate = value as Record<string, unknown>;
  return {
    chain: sanitizeStringList(candidate.chain),
    excludes: sanitizeStringList(candidate.excludes),
    seeds: sanitizeStringList(candidate.seeds),
  };
};

