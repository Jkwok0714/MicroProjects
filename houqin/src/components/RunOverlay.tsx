import type { MigrationProgress } from "../types";

type RunOverlayProps = {
  progress: MigrationProgress | null;
  onCancel: () => void;
};

export function RunOverlay({ progress, onCancel }: RunOverlayProps) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <p className="eyebrow">Migration In Progress</p>
        <h2>{progress?.stepLabel ?? "Preparing job"}</h2>
        <p className="overlay-copy">{progress?.phase ?? "Starting up"} </p>
        <div className="progress-block">
          <span>{progress?.currentDirectory ?? "."}</span>
          <strong>
            {progress?.currentFile ?? 0}/{progress?.totalFiles ?? 0}
          </strong>
        </div>
        <button className="danger-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

