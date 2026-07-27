import type { HouqinConfig } from "../types";
import { StringListEditor } from "./StringListEditor";

type SettingsViewProps = {
  config: HouqinConfig;
  disabled: boolean;
  onChange: (config: HouqinConfig) => void;
  onSeed: () => void;
};

export function SettingsView({ config, disabled, onChange, onSeed }: SettingsViewProps) {
  return (
    <div className="settings-grid">
      <StringListEditor
        disabled={disabled}
        hint="Directory-name excludes are matched case-insensitively against folders only."
        onChange={(excludes) => onChange({ ...config, excludes })}
        title="Excludes"
        values={config.excludes}
      />
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Seed Paths</p>
            <h2>Seed list</h2>
          </div>
          <button className="secondary-button" disabled={disabled} onClick={onSeed} type="button">
            Seed
          </button>
        </div>
        <p className="panel-copy">Each seed is a relative directory that should exist under the first source folder.</p>
        <StringListEditor
          disabled={disabled}
          hint="Examples: Photos/Trips, Shows/Queued"
          onChange={(seeds) => onChange({ ...config, seeds })}
          title="Seed entries"
          values={config.seeds}
        />
      </section>
    </div>
  );
}

