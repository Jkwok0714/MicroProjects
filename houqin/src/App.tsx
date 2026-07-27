import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { loadConfig, pickDirectory, saveConfig, seedDirectories } from "./api/tauri";
import { DirectoryChain } from "./components/DirectoryChain";
import { ReportAccordion } from "./components/ReportAccordion";
import { RunOverlay } from "./components/RunOverlay";
import { SettingsView } from "./components/SettingsView";
import { useMigrationJob } from "./hooks/useMigrationJob";
import { canRunMigration } from "./state/runState";
import type { HouqinConfig } from "./types";
import { parseConfig } from "./utils/config";

type ViewMode = "topology" | "settings";

const EMPTY_CONFIG: HouqinConfig = {
  chain: ["", ""],
  excludes: [],
  seeds: [],
};

function App() {
  const [config, setConfig] = useState<HouqinConfig>(EMPTY_CONFIG);
  const [viewMode, setViewMode] = useState<ViewMode>("topology");
  const [message, setMessage] = useState<string>("Loading configuration...");
  const { runState, runMigration, stopMigration, setReport } = useMigrationJob();

  useEffect(() => {
    const hydrate = async () => {
      try {
        const loaded = await loadConfig();
        setConfig((current) => {
          const next = parseConfig(loaded);
          return {
            ...next,
            chain: next.chain.length >= 2 ? next.chain : current.chain,
          };
        });
        setMessage("Ready.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void hydrate();
  }, []);

  useEffect(() => {
    const persist = async () => {
      try {
        await saveConfig(config);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    };

    void persist();
  }, [config]);

  const runDisabled = useMemo(() => !canRunMigration(config.chain, runState.isBusy), [config.chain, runState.isBusy]);

  const updateChainDirectory = async (index: number) => {
    const chosen = await pickDirectory(config.chain[index]);
    if (!chosen) {
      return;
    }

    setConfig((current) => ({
      ...current,
      chain: current.chain.map((entry, entryIndex) => (entryIndex === index ? chosen : entry)),
    }));
  };

  const addDirectory = () => {
    setConfig((current) => ({
      ...current,
      chain: [...current.chain, ""],
    }));
  };

  const removeDirectory = (index: number) => {
    setConfig((current) => ({
      ...current,
      chain: current.chain.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSeed = async () => {
    const sourceDirectory = config.chain[0];
    if (!sourceDirectory) {
      setMessage("Choose a source directory before seeding.");
      return;
    }

    try {
      const result = await seedDirectories(sourceDirectory, config.seeds);
      setMessage(`Seeded ${result.created.length} directories.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRun = async () => {
    try {
      setReport(null);
      await runMigration(config.chain, config.excludes);
      setMessage("Migration started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">后勤 / Houqin</p>
          <h1>Move files down a directory chain without skipping steps.</h1>
        </div>
        <p className="hero-copy">
          A local desktop migrator for ordered folder queues, case-safe subtree mirroring, and clear post-run reporting.
        </p>
      </header>

      <section className="status-ribbon">
        <span>{message}</span>
        <div className="status-actions">
          <button className="secondary-button" disabled={runState.isBusy} onClick={() => setViewMode("settings")} type="button">
            Settings
          </button>
          <button className="secondary-button" disabled={runState.isBusy} onClick={() => setViewMode("topology")} type="button">
            Topology
          </button>
        </div>
      </section>

      {viewMode === "topology" ? (
        <DirectoryChain
          chain={config.chain}
          disabled={runState.isBusy}
          onAddDirectory={addDirectory}
          onPickDirectory={updateChainDirectory}
          onRemoveDirectory={removeDirectory}
        />
      ) : (
        <SettingsView config={config} disabled={runState.isBusy} onChange={setConfig} onSeed={handleSeed} />
      )}

      <section className="footer-actions">
        <button className="primary-button large-button" disabled={runDisabled} onClick={handleRun} type="button">
          Run
        </button>
      </section>

      {runState.report ? <ReportAccordion report={runState.report} /> : null}
      {runState.isBusy ? <RunOverlay onCancel={() => void stopMigration()} progress={runState.progress} /> : null}
    </main>
  );
}

export default App;

