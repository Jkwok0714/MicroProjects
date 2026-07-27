import { useMemo, useState } from "react";

import type { MigrationReport } from "../types";
import { createStepPanels } from "../utils/report";

type ReportAccordionProps = {
  report: MigrationReport;
};

export function ReportAccordion({ report }: ReportAccordionProps) {
  const panels = useMemo(() => createStepPanels(report), [report]);
  const [openLabel, setOpenLabel] = useState<string | null>(panels[0]?.label ?? null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Migration Report</p>
          <h2>{report.status}</h2>
        </div>
        <p className="report-total">{report.totalFilesMoved} files moved</p>
      </div>
      <div className="accordion">
        {panels.map((panel) => {
          const isOpen = openLabel === panel.label;
          return (
            <article className="accordion-item" key={panel.label}>
              <button
                className="accordion-trigger"
                onClick={() => setOpenLabel(isOpen ? null : panel.label)}
                type="button"
              >
                <span>{panel.label}</span>
                <span>
                  {panel.filesMoved} moved / {panel.conflictsCount} conflicts
                </span>
              </button>
              {isOpen ? (
                <div className="accordion-body">
                  {panel.subdirectories.map((subdirectory) => (
                    <div className="subdirectory-row" key={`${panel.label}-${subdirectory.directory}`}>
                      <span>{subdirectory.directory}</span>
                      <strong>{subdirectory.filesMoved}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

