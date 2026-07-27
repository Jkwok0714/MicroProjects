import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

import type {
  CancelMigrationResult,
  HouqinConfig,
  MigrationProgress,
  MigrationReport,
  SeedResult,
  StartMigrationResult,
} from "../types";
import { parseConfig } from "../utils/config";

export const PROGRESS_EVENT = "houqin://progress";
export const RESULT_EVENT = "houqin://result";

export const pickDirectory = async (currentDirectory?: string): Promise<string | null> =>
  invoke<string | null>("pick_directory", {
    currentDirectory,
  });

export const loadConfig = async (): Promise<HouqinConfig> => parseConfig(await invoke("load_config_command"));

export const saveConfig = async (config: HouqinConfig): Promise<HouqinConfig> =>
  parseConfig(await invoke("save_config_command", { config }));

export const seedDirectories = async (sourceDirectory: string, seeds: string[]): Promise<SeedResult> =>
  invoke("seed_directories_command", {
    request: {
      sourceDirectory,
      seeds,
    },
  });

export const startMigration = async (chain: string[], excludes: string[]): Promise<StartMigrationResult> =>
  invoke("start_migration", {
    request: {
      chain,
      excludes,
    },
  });

export const cancelMigration = async (jobId: string): Promise<CancelMigrationResult> =>
  invoke("cancel_migration", { jobId });

export const listenForProgress = async (handler: (progress: MigrationProgress) => void): Promise<() => void> =>
  listen<MigrationProgress>(PROGRESS_EVENT, (event) => {
    handler(event.payload);
  });

export const listenForResult = async (handler: (report: MigrationReport) => void): Promise<() => void> =>
  listen<MigrationReport>(RESULT_EVENT, (event) => {
    handler(event.payload);
  });

