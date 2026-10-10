// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceProfilesResponse } from "../../../../types/audioSourceTypes";
import { PodcastSubscription } from "../../../../types/podcastTypes";
import { useAudioSourceEditor } from "./useAudioSourceEditor";
import { SourceAssignment } from "./sourceProfiles";

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
function Probe({
    open,
    polled = 0,
    assignment = { source },
}: {
    open: boolean;
    polled?: number;
    assignment?: SourceAssignment;
}) {
    current = useAudioSourceEditor(open, ruid, "", assignment, load);
    void polled;
    return null;
}
const render = async (open: boolean, polled = 0, assignment?: SourceAssignment) => {
    await act(async () =>
        root.render(<Probe open={open} polled={polled} assignment={assignment} />),
    );
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

    it("uses confirmed edits to the active audio profile as the new baseline", async () => {
        await render(true);
        await act(async () => current.updateProfile("audio", { source: "lib://next.taf" }));
        expect(current.dirtyKinds).toEqual(["audio"]);
        await act(async () =>
            current.recordSaved("audio", {
                revision: 5,
                profiles: { ...response.profiles, audio: { source: "lib://next.taf" } },
            }),
        );
        expect(current.dirtyKinds).toEqual([]);
    });

    it("keeps the draft dirty if the server confirms a different active value", async () => {
        await render(true);
        await act(async () => current.updateProfile("audio", { source: "lib://draft.taf" }));
        await act(async () =>
            current.recordSaved("audio", {
                revision: 5,
                profiles: { ...response.profiles, audio: { source: "lib://canonical.taf" } },
            }),
        );
        expect(current.drafts.audio.source).toBe("lib://draft.taf");
        expect(current.dirtyKinds).toEqual(["audio"]);
        await act(async () => current.cancel());
        expect(current.drafts.audio.source).toBe("lib://canonical.taf");
    });

    it("uses confirmed edits to an owning podcast profile as the new baseline", async () => {
        const subscription: PodcastSubscription = {
            id: "1",
            revision: 2,
            ruid,
            overlay: "",
            state: "ready",
            episodes: [],
            ownsAssignment: true,
            sourceType: "rss",
            feedUrl: "https://example.org/feed",
            episodeCount: 7,
            order: "newest_first",
            intervalHours: 0,
            refreshOnPlacement: true,
            enabled: true,
        };
        await render(true, 0, { source: "lib://prepared.taf", subscription });
        expect(current.selectedKind).toBe("podcast");
        await act(async () =>
            current.updateProfile("podcast", { ...current.drafts.podcast, episodeCount: 8 }),
        );
        const confirmed = { ...current.drafts.podcast };
        await act(async () =>
            current.recordSaved("podcast", {
                revision: 5,
                profiles: { ...response.profiles, podcast: confirmed },
            }),
        );
        expect(current.dirtyKinds).toEqual([]);
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

    it("initializes after the owning subscription arrives instead of freezing an audio guess", async () => {
        await render(false);
        const subscription: PodcastSubscription = {
            id: "1",
            revision: 1,
            ruid,
            overlay: "",
            state: "ready",
            episodes: [],
            ownsAssignment: true,
            sourceType: "ard_audiothek",
            feedUrl: "",
            ardShowUrl: "https://www.ardsounds.de/sendung/x/123/",
            episodeCount: 2,
            order: "newest_first",
            intervalHours: 0,
            refreshOnPlacement: true,
            enabled: true,
        };
        await render(true, 0, { source: "lib://prepared.taf", subscription });
        expect(current.selectedKind).toBe("ard");
        expect(current.drafts.ard.ardShowUrl).toBe(subscription.ardShowUrl);
    });

    it("composes canonical preview key and selected name without losing cuts", async () => {
        await render(true);
        await act(async () => {
            current.updateProfile("ard", (draft) => ({
                ...draft,
                episodeTrims: [{ identity: "episode-1", trimStartSeconds: 4, trimEndSeconds: 0 }],
            }));
            current.updateProfile("ard", (draft) => ({ ...draft, sourceKey: "ard:canonical" }));
            current.updateProfile("ard", (draft) => ({
                ...draft,
                displayName: "Sendung",
                displayNameSourceKey: "ard:canonical",
            }));
        });
        expect(current.drafts.ard.sourceKey).toBe("ard:canonical");
        expect(current.drafts.ard.displayName).toBe("Sendung");
        expect(current.drafts.ard.episodeTrims[0].trimStartSeconds).toBe(4);
    });
    it("reopens with the departing legacy audio profile after choosing a podcast", async () => {
        load.mockResolvedValueOnce({ revision: 0, profiles: {} });
        await render(true, 0, { source: "lib://legacy-a.taf" });
        expect(current.missingKinds).toContain("audio");
        await act(async () => current.setSelectedKind("podcast"));
        const persisted: SourceProfilesResponse = {
            revision: 2,
            profiles: {
                audio: { source: "lib://legacy-a.taf" },
                podcast: { feedUrl: "https://example.org/feed" },
            },
        };
        await act(async () =>
            current.recordSaved("audio", {
                revision: 1,
                profiles: { audio: persisted.profiles.audio },
            }),
        );
        await act(async () => current.recordSaved("podcast", persisted));
        await render(false);
        load.mockResolvedValueOnce(persisted);
        const subscription: PodcastSubscription = {
            id: "a".repeat(32),
            revision: 1,
            ruid,
            overlay: "",
            state: "ready",
            episodes: [],
            ownsAssignment: true,
            sourceType: "rss",
            feedUrl: "https://example.org/feed",
            episodeCount: 5,
            order: "newest_first",
            intervalHours: 6,
            refreshOnPlacement: true,
            enabled: true,
        };
        await render(true, 0, { source: "lib://podcasts/prepared.taf", subscription });
        expect(current.selectedKind).toBe("podcast");
        expect(current.drafts.audio.source).toBe("lib://legacy-a.taf");
    });
});
