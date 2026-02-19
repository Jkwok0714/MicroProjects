import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/api/dialog";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc, invoke } from "@tauri-apps/api/tauri";

import "./App.css";
import { clampSeconds, formatTimestamp, parseTimestamp } from "./time";
import type {
  JobProgress,
  JobResult,
  JobStartResult,
  ProbeResult,
  ResectionRequest,
} from "./types";

const MIN_GAP_SECONDS = 0.05;
const EDGE_EPSILON = 0.01;
const MENU_OPEN_FILE_EVENT = "menu://open-file";
const MENU_CLOSE_FILE_EVENT = "menu://close-file";

type ToastKind = "info" | "success" | "warning" | "error";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

const createFallbackProbe = (path: string, durationS: number): ProbeResult => {
  const extension = path.split(".").pop()?.toLowerCase();
  const container = extension === "mp4" || extension === "mov" ? extension : "unknown";
  return {
    durationS,
    container,
    streams: [],
    metadata: {},
  };
};

const isSupportedVideoPath = (path: string): boolean => {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === "mp4" || extension === "mov";
};

const extractDroppedPath = (event: DragEvent<HTMLElement>): string | null => {
  const droppedFile = event.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
  if (droppedFile?.path) {
    return droppedFile.path;
  }

  const uriPayload = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
  if (!uriPayload) {
    return null;
  }

  const firstLine = uriPayload
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (!firstLine) {
    return null;
  }

  if (firstLine.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(firstLine).pathname);
    } catch {
      return decodeURIComponent(firstLine.replace("file://", ""));
    }
  }

  return firstLine;
};

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const loadFileFromMenuRef = useRef<(path: string) => void>(() => undefined);
  const closeFileFromMenuRef = useRef<() => void>(() => undefined);
  const toastCounterRef = useRef<number>(0);

  const [sourcePath, setSourcePath] = useState<string>("");
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [playerDuration, setPlayerDuration] = useState<number>(0);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [inSeconds, setInSeconds] = useState<number>(0);
  const [outSeconds, setOutSeconds] = useState<number>(0);
  const [inText, setInText] = useState<string>("00:00:00.000");
  const [outText, setOutText] = useState<string>("00:00:00.000");
  const [useFromBeginning, setUseFromBeginning] = useState<boolean>(false);
  const [useToEnd, setUseToEnd] = useState<boolean>(false);

  const [busy, setBusy] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [phase, setPhase] = useState<string>("idle");
  const [jobId, setJobId] = useState<string | null>(null);

  const [showFallbackModal, setShowFallbackModal] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<string>("");

  const [isDropActive, setIsDropActive] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string, timeoutMs = 4200) => {
      const id = toastCounterRef.current + 1;
      toastCounterRef.current = id;

      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => {
        removeToast(id);
      }, timeoutMs);
    },
    [removeToast],
  );

  const duration = probe?.durationS ?? playerDuration;
  const hasUsableDuration = duration > MIN_GAP_SECONDS;

  const effectiveIn = useFromBeginning ? 0 : inSeconds;
  const effectiveOut = useToEnd ? duration : outSeconds;

  const inMarkerPercent = hasUsableDuration ? clampSeconds((effectiveIn / duration) * 100, 0, 100) : 0;
  const outMarkerPercent = hasUsableDuration ? clampSeconds((effectiveOut / duration) * 100, 0, 100) : 0;

  const showInMarker = hasUsableDuration && (useFromBeginning || effectiveIn > EDGE_EPSILON);
  const showOutMarker = hasUsableDuration && (useToEnd || effectiveOut < duration - EDGE_EPSILON);

  const rangeValid = useMemo(() => {
    if (!hasUsableDuration) {
      return false;
    }

    if (effectiveIn < 0 || effectiveOut > duration) {
      return false;
    }

    if (effectiveOut <= effectiveIn) {
      return false;
    }

    if ((effectiveOut - effectiveIn) >= duration - MIN_GAP_SECONDS) {
      return false;
    }

    return true;
  }, [duration, effectiveIn, effectiveOut, hasUsableDuration]);

  useEffect(() => {
    document.body.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  const resetAppState = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    activeJobRef.current = null;
    setSourcePath("");
    setVideoSrc("");
    setProbe(null);
    setPlayerDuration(0);
    setCurrentTime(0);
    setInSeconds(0);
    setOutSeconds(0);
    setInText(formatTimestamp(0));
    setOutText(formatTimestamp(0));
    setUseFromBeginning(false);
    setUseToEnd(false);
    setBusy(false);
    setProgressPercent(0);
    setPhase("idle");
    setJobId(null);
    setShowFallbackModal(false);
    setFallbackReason("");
  }, []);

  const runProbe = useCallback(
    async (path: string, options?: { silentSuccess?: boolean }) => {
      try {
        const result = await invoke<ProbeResult>("probe_video", { path });
        setPlayerDuration(result.durationS);
        setProbe(result);
        setCurrentTime(0);
        setInSeconds(0);
        setOutSeconds(result.durationS);
        setInText(formatTimestamp(0));
        setOutText(formatTimestamp(result.durationS));
        setUseFromBeginning(false);
        setUseToEnd(false);
        if (!options?.silentSuccess) {
          pushToast("success", "Video loaded.");
        }
      } catch (probeError) {
        const message = probeError instanceof Error ? probeError.message : String(probeError);
        pushToast("error", `Probe failed: ${message}`);
        pushToast("info", "Using player metadata fallback for timeline controls.");
      }
    },
    [pushToast],
  );

  const loadFile = useCallback(
    async (path: string) => {
      if (!isSupportedVideoPath(path)) {
        pushToast("error", "Only MP4 and MOV files are supported.");
        return;
      }

      setIsFileLoading(true);

      if (busy && jobId) {
        try {
          await invoke("cancel_resection", { jobId });
          pushToast("info", "Canceled active job and loading dropped file.");
        } catch {
          pushToast("warning", "Could not confirm job cancel before loading next file.");
        }
      }

      resetAppState();
      setSourcePath(path);
      setVideoSrc(convertFileSrc(path));

      await runProbe(path);
      setIsFileLoading(false);
    },
    [busy, jobId, pushToast, resetAppState, runProbe],
  );

  const closeCurrentFile = useCallback(async () => {
    if (!sourcePath && !videoSrc) {
      return;
    }

    if (busy && jobId) {
      try {
        await invoke("cancel_resection", { jobId });
      } catch (cancelError) {
        const message = cancelError instanceof Error ? cancelError.message : String(cancelError);
        pushToast("error", `Failed to cancel active job while closing file: ${message}`);
      }
    }

    resetAppState();
    pushToast("info", "File closed.");
  }, [busy, jobId, pushToast, resetAppState, sourcePath, videoSrc]);

  loadFileFromMenuRef.current = (path: string) => {
    void loadFile(path);
  };

  closeFileFromMenuRef.current = () => {
    void closeCurrentFile();
  };

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenProgress = await listen<JobProgress>("resection://progress", (event) => {
        if (!activeJobRef.current || event.payload.jobId !== activeJobRef.current) {
          return;
        }

        setPhase(event.payload.phase);
        setProgressPercent(Number.isFinite(event.payload.percent) ? event.payload.percent : 0);
      });

      const unlistenResult = await listen<JobResult>("resection://result", (event) => {
        if (!activeJobRef.current || event.payload.jobId !== activeJobRef.current) {
          return;
        }

        setBusy(false);
        setJobId(null);
        activeJobRef.current = null;

        if (event.payload.status === "fallback_required") {
          setFallbackReason(event.payload.reason ?? "Stream-copy mode could not perform an exact cut.");
          setShowFallbackModal(true);
          pushToast("info", "Fallback is required for exact cut boundaries.");
          return;
        }

        if (event.payload.status === "completed") {
          setProgressPercent(100);
          pushToast("success", "Resection completed. Original file was replaced.");
          for (const warning of event.payload.warnings ?? []) {
            pushToast("warning", warning, 7000);
          }

          if (sourcePath) {
            const reloadedVideoSrc = `${convertFileSrc(sourcePath)}?reload=${Date.now()}`;
            setVideoSrc(reloadedVideoSrc);
            setIsFileLoading(true);
            void runProbe(sourcePath, { silentSuccess: true }).finally(() => {
              setIsFileLoading(false);
            });
          }
          return;
        }

        if (event.payload.status === "canceled") {
          pushToast("info", event.payload.reason ?? "Operation canceled.");
          return;
        }

        pushToast("error", event.payload.reason ?? "Resection failed.");
      });

      const unlistenMenuOpen = await listen<string>(MENU_OPEN_FILE_EVENT, (event) => {
        if (typeof event.payload === "string" && event.payload.length > 0) {
          loadFileFromMenuRef.current(event.payload);
        }
      });

      const unlistenMenuClose = await listen<boolean>(MENU_CLOSE_FILE_EVENT, () => {
        closeFileFromMenuRef.current();
      });

      return () => {
        unlistenProgress();
        unlistenResult();
        unlistenMenuOpen();
        unlistenMenuClose();
      };
    };

    let cleanup: (() => void) | undefined;
    void setupListeners().then((handler) => {
      cleanup = handler;
    });

    return () => {
      cleanup?.();
    };
  }, [pushToast, runProbe, sourcePath]);

  const selectFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov"] }],
    });

    if (typeof selected !== "string") {
      return;
    }

    await loadFile(selected);
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropActive(false);

    const droppedPath = extractDroppedPath(event);
    if (!droppedPath) {
      pushToast("error", "Could not read dropped file path. Try Open File.");
      return;
    }

    await loadFile(droppedPath);
  };

  const commitInText = () => {
    const parsed = parseTimestamp(inText);
    if (parsed == null || !hasUsableDuration || useFromBeginning) {
      setInText(formatTimestamp(effectiveIn));
      return;
    }

    const maxIn = Math.max(0, effectiveOut - MIN_GAP_SECONDS);
    const clamped = clampSeconds(parsed, 0, maxIn);
    setInSeconds(clamped);
    setInText(formatTimestamp(clamped));
  };

  const commitOutText = () => {
    const parsed = parseTimestamp(outText);
    if (parsed == null || !hasUsableDuration || useToEnd) {
      setOutText(formatTimestamp(effectiveOut));
      return;
    }

    const minOut = effectiveIn + MIN_GAP_SECONDS;
    const clamped = clampSeconds(parsed, minOut, duration);
    setOutSeconds(clamped);
    setOutText(formatTimestamp(clamped));
  };

  const setInFromPlayhead = () => {
    if (!hasUsableDuration || useFromBeginning) {
      return;
    }
    const value = clampSeconds(currentTime, 0, Math.max(0, effectiveOut - MIN_GAP_SECONDS));
    setInSeconds(value);
    setInText(formatTimestamp(value));
  };

  const setOutFromPlayhead = () => {
    if (!hasUsableDuration || useToEnd) {
      return;
    }
    const value = clampSeconds(currentTime, effectiveIn + MIN_GAP_SECONDS, duration);
    setOutSeconds(value);
    setOutText(formatTimestamp(value));
  };

  const requestStart = async (allowFallbackReencode: boolean) => {
    if (!sourcePath || !rangeValid || busy || isFileLoading) {
      return;
    }

    setBusy(true);
    setShowFallbackModal(false);
    setPhase("starting");
    setProgressPercent(0);

    const req: ResectionRequest = {
      path: sourcePath,
      inSeconds: effectiveIn,
      outSeconds: effectiveOut,
      outputMode: "replace_original",
      allowFallbackReencode,
      fromBeginning: useFromBeginning,
      toEnd: useToEnd,
    };

    try {
      const started = await invoke<JobStartResult>("start_resection", { req });
      setJobId(started.jobId);
      activeJobRef.current = started.jobId;
      pushToast("info", allowFallbackReencode ? "Starting re-encode fallback..." : "Starting stream-copy pass...");
    } catch (startError) {
      setBusy(false);
      const message = startError instanceof Error ? startError.message : String(startError);
      pushToast("error", `Failed to start resection: ${message}`);
    }
  };

  const cancelJob = async () => {
    if (!jobId || !busy) {
      return;
    }

    try {
      await invoke("cancel_resection", { jobId });
      pushToast("info", "Cancel requested...");
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : String(cancelError);
      pushToast("error", `Failed to request cancellation: ${message}`);
    }
  };

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="header-row">
          <h1>Pianyi Resection</h1>
          <label className="theme-toggle" title="Toggle dark mode">
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={(event) => setIsDarkMode(event.currentTarget.checked)}
            />
            <span>Dark</span>
          </label>
        </div>
      </header>

      <section className="file-grid">
        <div
          className={`card file-drop-panel ${isDropActive ? "file-card-drop-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDropActive(true);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDropActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDropActive(false);
            }
          }}
          onDrop={(event) => {
            void handleDrop(event);
          }}
        >
          <div className="file-actions">
            <button type="button" onClick={() => void selectFile()} disabled={isFileLoading}>
              Open File
            </button>
            <button
              type="button"
              onClick={() => void closeCurrentFile()}
              disabled={!sourcePath || isFileLoading}
            >
              Close File
            </button>
          </div>
          <p className="drop-hint">Drag and drop an MP4/MOV file here.</p>
          {isFileLoading && (
            <div className="file-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span>Loading file...</span>
            </div>
          )}
        </div>

        <div className="card file-details-panel">
          <h2>File Details</h2>
          <dl className="details-list">
            <div>
              <dt>Path</dt>
              <dd className="path-line">{sourcePath || "No file selected"}</dd>
            </div>
            <div>
              <dt>Container</dt>
              <dd>{probe?.container ?? "-"}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{hasUsableDuration ? formatTimestamp(duration) : "-"}</dd>
            </div>
            <div>
              <dt>Streams</dt>
              <dd>{probe ? String(probe.streams.length) : "-"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card player-card">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime || 0);
          }}
          onLoadedMetadata={(event) => {
            const loadedDuration = event.currentTarget.duration;
            if (!Number.isFinite(loadedDuration) || loadedDuration <= 0) {
              return;
            }

            setPlayerDuration(loadedDuration);

            if (!probe) {
              setProbe(createFallbackProbe(sourcePath, loadedDuration));
              setCurrentTime(0);
              setInSeconds(0);
              setOutSeconds(loadedDuration);
              setInText(formatTimestamp(0));
              setOutText(formatTimestamp(loadedDuration));
              setUseFromBeginning(false);
              setUseToEnd(false);
              pushToast("info", "Video loaded from player metadata.");
              return;
            }

            if (Math.abs(loadedDuration - probe.durationS) > 0.5) {
              setProbe({ ...probe, durationS: loadedDuration });
            }

            const nextIn = useFromBeginning ? 0 : clampSeconds(inSeconds, 0, loadedDuration);
            const nextOut = useToEnd
              ? loadedDuration
              : clampSeconds(outSeconds, nextIn + MIN_GAP_SECONDS, loadedDuration);

            setInSeconds(nextIn);
            setInText(formatTimestamp(nextIn));
            setOutSeconds(nextOut);
            setOutText(formatTimestamp(nextOut));
          }}
        />

        <div className="timeline-block">
          <label htmlFor="timeline">Playhead</label>
          <div className="timeline-range-wrap">
            <div className="timeline-markers" aria-hidden="true">
              {showInMarker && (
                <span className="timeline-marker timeline-marker-in" style={{ left: `${inMarkerPercent}%` }} />
              )}
              {showOutMarker && (
                <span className="timeline-marker timeline-marker-out" style={{ left: `${outMarkerPercent}%` }} />
              )}
            </div>
            <input
              id="timeline"
              type="range"
              min={0}
              max={Math.max(duration, 0.0001)}
              step={0.01}
              value={Math.min(currentTime, Math.max(duration, 0))}
              disabled={!hasUsableDuration}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                setCurrentTime(next);
                if (videoRef.current) {
                  videoRef.current.currentTime = next;
                }
              }}
            />
          </div>
          <div className="time-readout">
            <span>{formatTimestamp(currentTime)}</span>
            <span>{formatTimestamp(duration)}</span>
          </div>
        </div>

        <div className="point-controls">
          <button type="button" onClick={setInFromPlayhead} disabled={!hasUsableDuration || busy || useFromBeginning}>
            Set In @ Playhead
          </button>
          <button type="button" onClick={setOutFromPlayhead} disabled={!hasUsableDuration || busy || useToEnd}>
            Set Out @ Playhead
          </button>
        </div>

        <div className="timestamp-grid">
          <div className="timestamp-field">
            <div className="timestamp-label-row">
              <span>In</span>
              <label className="inline-option-toggle">
                <input
                  type="checkbox"
                  checked={useFromBeginning}
                  disabled={!hasUsableDuration || busy}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setUseFromBeginning(checked);
                    if (checked) {
                      setInSeconds(0);
                      setInText(formatTimestamp(0));
                      if (useToEnd) {
                        setUseToEnd(false);
                      }
                    }
                  }}
                />
                From beginning
              </label>
            </div>
            <input
              type="text"
              value={inText}
              onChange={(event) => setInText(event.currentTarget.value)}
              onBlur={commitInText}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitInText();
                }
              }}
              disabled={!hasUsableDuration || busy || useFromBeginning}
            />
          </div>

          <div className="timestamp-field">
            <div className="timestamp-label-row">
              <span>Out</span>
              <label className="inline-option-toggle">
                <input
                  type="checkbox"
                  checked={useToEnd}
                  disabled={!hasUsableDuration || busy}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setUseToEnd(checked);
                    if (checked) {
                      setOutSeconds(duration);
                      setOutText(formatTimestamp(duration));
                      if (useFromBeginning) {
                        setUseFromBeginning(false);
                      }
                    }
                  }}
                />
                To end
              </label>
            </div>
            <input
              type="text"
              value={outText}
              onChange={(event) => setOutText(event.currentTarget.value)}
              onBlur={commitOutText}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitOutText();
                }
              }}
              disabled={!hasUsableDuration || busy || useToEnd}
            />
          </div>
        </div>
      </section>

      <section className="card run-card">
        <div className="run-actions">
          <button
            type="button"
            disabled={!rangeValid || busy || isFileLoading}
            onClick={() => void requestStart(false)}
          >
            Remove Selected Segment
          </button>
          <button type="button" disabled={!busy} onClick={() => void cancelJob()}>
            Cancel
          </button>
        </div>

        <div className="progress-block">
          <progress max={100} value={progressPercent} />
          <div className="progress-meta">
            <span>Phase: {phase}</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
        </div>
      </section>

      {showFallbackModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Fallback Required</h2>
            <p>{fallbackReason}</p>
            <p>
              Stream-copy could not satisfy exact cut boundaries. Continue with precise re-encode fallback?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowFallbackModal(false);
                  void requestStart(true);
                }}
              >
                Re-encode and Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFallbackModal(false);
                  pushToast("info", "Fallback canceled by user.");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
