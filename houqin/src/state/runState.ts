import type { MigrationProgress, MigrationReport } from "../types";

export type RunState = {
  isBusy: boolean;
  activeJobId: string | null;
  progress: MigrationProgress | null;
  report: MigrationReport | null;
};

export const createInitialRunState = (): RunState => ({
  isBusy: false,
  activeJobId: null,
  progress: null,
  report: null,
});

export const applyJobStart = (state: RunState, jobId: string): RunState => ({
  ...state,
  isBusy: true,
  activeJobId: jobId,
  progress: null,
  report: null,
});

export const applyJobProgress = (state: RunState, progress: MigrationProgress): RunState => ({
  ...state,
  progress,
});

export const applyJobResult = (state: RunState, report: MigrationReport): RunState => ({
  ...state,
  isBusy: false,
  activeJobId: null,
  progress: null,
  report,
});

export const canRunMigration = (chain: string[], isBusy: boolean): boolean =>
  !isBusy && chain.filter((value) => value.trim().length > 0).length >= 2;

