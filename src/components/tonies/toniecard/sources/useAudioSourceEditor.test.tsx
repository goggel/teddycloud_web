// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceProfilesResponse } from "../../../../types/audioSourceTypes";
import { useAudioSourceEditor } from "./useAudioSourceEditor";

let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useAudioSourceEditor>;
const ruid = "0123456789abcdef";
const source = "lib://original.taf";
const load = vi.fn<(signal: AbortSignal) => Promise<SourceProfilesResponse>>();
const response: SourceProfilesResponse = {
    revision: 4,
    profiles: {
        audio: { source },
        radio: { source: "https://example.org/live", displayName: "Radio" },
        podcast: { feedUrl: "https://example.org/feed", episodeCount: 7 },
        ard: { ardShowUrl: "https://www.ardsounds.de/sendung/x/123/", episodeCount: 3 },
    },
};
function Probe({ open, polled = 0 }: { open: boolean; polled?: number }) {
    current = useAudioSourceEditor(open, ruid, "", { source, subscription: undefined }, load);
    void polled;
    return null;
}
const render = async (open: boolean, polled = 0) => {
    await act(async () => root.render(<Probe open={open} polled={polled} />));
};
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    load.mockResolvedValue(response);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("four source drafts", () => {
    it("keeps four edits across switches and polling without a mutation", async () => {
        await render(true);
        expect(current.revision).toBe(4);
        await act(async () => {
            current.updateProfile("audio", { source: "lib://new.taf" });
            current.updateProfile("radio", { ...current.drafts.radio, displayName: "New Radio" });
            current.updateProfile("podcast", { ...current.drafts.podcast, episodeCount: 2 });
            current.updateProfile("ard", { ...current.drafts.ard, episodeCount: 9 });
            current.setSelectedKind("ard");
        });
        await render(true, 1);
        expect(current.drafts.audio.source).toBe("lib://new.taf");
        expect(current.drafts.radio.displayName).toBe("New Radio");
        expect(current.drafts.podcast.episodeCount).toBe(2);
        expect(current.drafts.ard.episodeCount).toBe(9);
        expect(current.selectedKind).toBe("ard");
        expect(current.dirtyKinds).toHaveLength(4);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("discards edits on cancel and loads the saved state when reopened", async () => {
        await render(true);
        await act(async () => {
            current.updateProfile("podcast", { ...current.drafts.podcast, episodeCount: 1 });
            current.setSelectedKind("podcast");
        });
        await act(async () => current.cancel());
        expect(current.drafts.podcast.episodeCount).toBe(7);
        expect(current.selectedKind).toBe("audio");
        expect(current.dirtyKinds).toEqual([]);
        await render(false);
        await render(true);
        expect(current.drafts.ard.episodeCount).toBe(3);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("advances only a confirmed profile revision and preserves a conflict draft", async () => {
        await render(true);
        await act(async () => {
            current.updateProfile("radio", { ...current.drafts.radio, displayName: "Changed" });
            current.updateProfile("ard", { ...current.drafts.ard, episodeCount: 10 });
        });
        await act(async () =>
            current.recordSaved("radio", {
                revision: 5,
                profiles: {
                    ...response.profiles,
                    radio: { source: "https://example.org/live", displayName: "Changed" },
                },
            }),
        );
        expect(current.revision).toBe(5);
        expect(current.dirtyKinds).toEqual(["ard"]);
        expect(current.drafts.ard.episodeCount).toBe(10);
    });

    it("does not replace edits or selection when the initial profile GET finishes late", async () => {
        let finish!: (value: SourceProfilesResponse) => void;
        load.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        await render(true);
        await act(async () => {
            current.updateProfile("audio", { source: "lib://draft.taf" });
            current.setSelectedKind("radio");
        });
        await act(async () => finish(response));
        expect(current.drafts.audio.source).toBe("lib://draft.taf");
        expect(current.drafts.podcast.episodeCount).toBe(7);
        expect(current.selectedKind).toBe("radio");
        expect(current.revision).toBe(4);
    });
});
