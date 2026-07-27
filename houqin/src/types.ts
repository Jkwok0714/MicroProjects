export type HouqinConfig = {
  chain: string[];
  excludes: string[];
  seeds: string[];
};

export type ChainStep = {
  sourceIndex: number;
  destinationIndex: number;
  sourcePath: string;
  destinationPath: string;
  filesMoved: number;
  subdirectories: SubdirectoryReport[];
};

export type ConflictRecord = {
  stepLabel: string;
  source: string;
  destination: string;
};

export type SubdirectoryReport = {
  directory: string;
  filesMoved: number;
};

export type MigrationReport = {
  jobId: string;
  status: "completed" | "canceled" | "failed";
  totalFilesMoved: number;
  steps: ChainStep[];
  conflicts: ConflictRecord[];
};

export type MigrationProgress = {
  jobId: string;
  stepIndex: number;
  stepLabel: string;
  currentDirectory: string;
  currentFile: number;
  totalFiles: number;
  phase: string;
};

export type StartMigrationResult = {
  jobId: string;
  status: string;
};

export type CancelMigrationResult = {
  jobId: string;
  status: string;
  found: boolean;
};

export type SeedResult = {
  created: string[];
};

export type StepPanel = {
  label: string;
  filesMoved: number;
  conflictsCount: number;
  subdirectories: SubdirectoryReport[];
};

