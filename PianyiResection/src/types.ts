export type StreamInfo = {
  index: number;
  codecType: string;
  codecName?: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  rotation?: number;
};

export type ProbeResult = {
  durationS: number;
  container: string;
  streams: StreamInfo[];
  metadata: Record<string, string>;
};

export type ResectionRequest = {
  path: string;
  inSeconds: number;
  outSeconds: number;
  outputMode: "replace_original";
  allowFallbackReencode: boolean;
  fromBeginning?: boolean;
  toEnd?: boolean;
};

export type JobStartResult = {
  jobId: string;
  status: string;
};

export type CancelResult = {
  jobId: string;
  status: string;
  found: boolean;
};

export type JobProgress = {
  jobId: string;
  phase: string;
  percent: number;
  etaMs?: number;
  message?: string;
};

export type JobResult = {
  jobId: string;
  status: "completed" | "failed" | "canceled" | "fallback_required";
  outputPath?: string;
  usedFallback: boolean;
  warnings: string[];
  reason?: string;
};
