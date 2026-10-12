import { describe, expect, it } from "vitest";
import {
    capturePreviewCut,
    endPreviewPosition,
    formatPreviewTime,
    previewBounds,
    retainedBounds,
} from "./podcastPreviewTiming";

describe("podcast preview timing", () => {
    const zero = { trimStartSeconds: 0, trimEndSeconds: 0 };
    it("captures whole-second start and seconds removed from the end, including zero", () => {
        expect(capturePreviewCut("start", 0, 100, zero)).toEqual(zero);
        expect(capturePreviewCut("start", 5.5, 100, zero)?.trimStartSeconds).toBe(6);
        expect(capturePreviewCut("end", 91.4, 100, zero)?.trimEndSeconds).toBe(9);
        expect(capturePreviewCut("end", 79.8, 100.3, zero)?.trimEndSeconds).toBe(21);
        expect(capturePreviewCut("start", 21600, 21601, zero)?.trimStartSeconds).toBe(21600);
    });
    it("rejects unavailable media, invalid positions and complete removal", () => {
        for (const duration of [0, NaN, Infinity])
            expect(capturePreviewCut("start", 2, duration, zero)).toBeUndefined();
        for (const position of [-1, 101, NaN, Infinity])
            expect(capturePreviewCut("end", position, 100, zero)).toBeUndefined();
        expect(capturePreviewCut("end", 0, 100, zero)).toBeUndefined();
        expect(
            capturePreviewCut("start", 60, 100, { ...zero, trimEndSeconds: 40 }),
        ).toBeUndefined();
        expect(capturePreviewCut("start", 21601, 25000, zero)).toBeUndefined();
    });
    it("bounds context, retained and end previews", () => {
        expect(previewBounds(8, 0)).toEqual({ start: 0, end: 5 });
        expect(previewBounds(8, 8)).toEqual({ start: 3, end: 8 });
        expect(previewBounds(8, 100)).toEqual({ start: 3, end: 8 });
        expect(retainedBounds(100, { trimStartSeconds: 10, trimEndSeconds: 20 })).toEqual({
            start: 10,
            end: 80,
        });
        expect(retainedBounds(10, { trimStartSeconds: 5, trimEndSeconds: 5 })).toBeUndefined();
        expect(endPreviewPosition(10)).toBe(0);
        expect(endPreviewPosition(Infinity)).toBeUndefined();
    });
    it("formats original clocks without nonfinite output", () => {
        expect(formatPreviewTime(0)).toBe("0:00");
        expect(formatPreviewTime(3661.9)).toBe("1:01:01");
        expect(formatPreviewTime(21600)).toBe("6:00:00");
        expect(formatPreviewTime(NaN)).toBe("—");
        expect(formatPreviewTime(Infinity)).toBe("—");
        expect(formatPreviewTime(undefined)).toBe("—");
    });
});
