export const clampSeconds = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const parseTimestamp = (input: string): number | null => {
  const text = input.trim();
  if (!text) {
    return null;
  }

  const parts = text.split(":");
  if (parts.length > 3 || parts.some((part) => part.trim() === "")) {
    return null;
  }

  const normalized = [...parts].map((part) => Number(part));
  if (normalized.some((value) => Number.isNaN(value) || value < 0)) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (normalized.length === 3) {
    [hours, minutes, seconds] = normalized;
  } else if (normalized.length === 2) {
    [minutes, seconds] = normalized;
  } else {
    [seconds] = normalized;
  }

  if (minutes >= 60 || seconds >= 60) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
};

export const formatTimestamp = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(3)
    .padStart(6, "0")}`;
};
