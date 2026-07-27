import { useCallback, useEffect, useState } from "react";

import { cancelMigration, listenForProgress, listenForResult, startMigration } from "../api/tauri";
import { applyJobProgress, applyJobResult, applyJobStart, createInitialRunState } from "../state/runState";
import type { MigrationReport } from "../types";

export const useMigrationJob = () => {
  const [runState, setRunState] = useState(createInitialRunState);

  useEffect(() => {
    let removeProgress: () => void = () => undefined;
    let removeResult: () => void = () => undefined;

    const bind = async () => {
      removeProgress = await listenForProgress((progress) => {
        setRunState((current) => applyJobProgress(current, progress));
      });
      removeResult = await listenForResult((report) => {
        setRunState((current) => applyJobResult(current, report));
      });
    };

    void bind();

    return () => {
      removeProgress();
      removeResult();
    };
  }, []);

  const runMigration = useCallback(async (chain: string[], excludes: string[]) => {
    const result = await startMigration(chain, excludes);
    setRunState((current) => applyJobStart(current, result.jobId));
  }, []);

  const stopMigration = useCallback(async () => {
    if (!runState.activeJobId) {
      return;
    }
    await cancelMigration(runState.activeJobId);
  }, [runState.activeJobId]);

  const setReport = useCallback((report: MigrationReport | null) => {
    setRunState((current) => ({
      ...current,
      report,
    }));
  }, []);

  return {
    runState,
    runMigration,
    stopMigration,
    setReport,
  };
};
