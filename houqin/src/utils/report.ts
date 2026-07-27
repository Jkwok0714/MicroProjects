import type { MigrationReport, StepPanel } from "../types";

export const createStepPanels = (report: MigrationReport): StepPanel[] =>
  report.steps.map((step) => ({
    label: `${step.sourceIndex} -> ${step.destinationIndex}`,
    filesMoved: step.filesMoved,
    conflictsCount: report.conflicts.filter((conflict) => conflict.stepLabel === `${step.sourceIndex} -> ${step.destinationIndex}`)
      .length,
    subdirectories: [...step.subdirectories].sort((left, right) => left.directory.localeCompare(right.directory)),
  }));

