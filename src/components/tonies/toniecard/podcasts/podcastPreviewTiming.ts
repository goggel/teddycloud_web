import { validTrim } from "./podcastValidation";

export type PreviewCuts = { trimStartSeconds: number; trimEndSeconds: number };

export const knownDuration = (duration: number): duration is number =>
    Number.isFinite(duration) && duration > 0;

export const formatPreviewTime = (seconds?: number) => {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const rest = String(whole % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

export const previewBounds = (duration: number, target: number, radius = 5) => {
    if (!knownDuration(duration) || !Number.isFinite(target)) return undefined;
    const center = Math.max(0, Math.min(duration, target));
    return { start: Math.max(0, center - radius), end: Math.min(duration, center + radius) };
};

export const endPreviewPosition = (duration: number) =>
    knownDuration(duration) ? Math.max(0, duration - 30) : undefined;

export const retainedBounds = (duration: number, cuts: PreviewCuts) => {
    if (
        !knownDuration(duration) ||
        !validTrim(cuts.trimStartSeconds) ||
        !validTrim(cuts.trimEndSeconds)
    )
        return undefined;
    const end = duration - cuts.trimEndSeconds;
    return cuts.trimStartSeconds < end ? { start: cuts.trimStartSeconds, end } : undefined;
};

export const capturePreviewCut = (
    side: "start" | "end",
    currentTime: number,
    duration: number,
    cuts: PreviewCuts,
) => {
    if (
        !knownDuration(duration) ||
        !Number.isFinite(currentTime) ||
        currentTime < 0 ||
        currentTime > duration
    )
        return undefined;
    const value = Math.round(side === "start" ? currentTime : duration - currentTime);
    const next = {
        trimStartSeconds: side === "start" ? value : cuts.trimStartSeconds,
        trimEndSeconds: side === "end" ? value : cuts.trimEndSeconds,
    };
    return validTrim(next.trimStartSeconds) &&
        validTrim(next.trimEndSeconds) &&
        next.trimStartSeconds + next.trimEndSeconds < duration
        ? next
        : undefined;
};
