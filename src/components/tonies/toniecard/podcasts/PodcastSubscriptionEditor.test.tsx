import { describe, expect, it, vi } from "vitest";
import { AudioSourceKind, AudioSourceProfiles } from "../../../../types/audioSourceTypes";
import { PodcastSubscription } from "../../../../types/podcastTypes";
import { defaultPodcastConfig } from "./podcastValidation";
import {
    profilesToPersist,
    saveAudioSource,
    SourceSaveError,
    SourceSaveOperations,
    SourceSaveRequest,
} from "../sources/saveAudioSource";

const kinds: AudioSourceKind[] = ["audio", "radio", "podcast", "ard"];
const profiles: AudioSourceProfiles = {
    audio: { source: "library.taf" },
    radio: { source: "https://example.org/live", displayName: "Station" },
    podcast: { ...defaultPodcastConfig(), sourceType: "rss", feedUrl: "https://example.org/feed" },
    ard: {
        ...defaultPodcastConfig(),
        sourceType: "ard_audiothek",
        ardShowUrl: "https://www.ardsounds.de/sendung/show/123/",
    },
};
const subscription = (kind: "podcast" | "ard"): PodcastSubscription => ({
    ...profiles[kind],
    id: "a".repeat(32),
    ruid: "0123456789abcdef",
    overlay: "box-1",
    revision: 4,
    state: "ready",
    episodes: [],
    ownsAssignment: true,
});
const request = (
    currentKind: AudioSourceKind,
    selectedKind: AudioSourceKind,
): SourceSaveRequest => ({
    ruid: "0123456789abcdef",
    overlay: "box-1",
    currentKind,
    selectedKind,
    currentSource:
        currentKind === "radio"
            ? profiles.radio.source
            : currentKind === "audio"
              ? profiles.audio.source
              : "managed.taf",
    drafts: profiles,
    dirtyKinds: [],
    profileRevision: 0,
    profilesSupported: true,
    subscription:
        currentKind === "podcast" || currentKind === "ard" ? subscription(currentKind) : undefined,
    podcastCapabilities: {
        supported: true,
        sourceTypes: ["rss", "ard_audiothek"],
        displayNameSupported: true,
        trimSupported: true,
    },
});
const operations = () => {
    const calls: string[] = [];
    const ops: SourceSaveOperations = {
        saveProfile: vi.fn().mockImplementation(async (kind: AudioSourceKind, revision: number) => {
            calls.push(`profile:${kind}:${revision}`);
            return { revision: revision + 1, profiles: { [kind]: profiles[kind] } };
        }),
        savePodcast: vi.fn().mockImplementation(async (_config, previous) => {
            calls.push(`podcast:${previous?.revision ?? "new"}`);
            return { ...subscription("podcast"), revision: 5 };
        }),
        detachPodcast: vi.fn().mockImplementation(async () => {
            calls.push("detach");
        }),
        assignDirectSource: vi.fn().mockImplementation(async (source, live) => {
            calls.push(`assign:${source}:${live}`);
        }),
        recordProfile: vi.fn(),
        recordSubscription: vi.fn(),
        recordActivation: vi.fn(),
    };
    return { ops, calls };
};

describe("four-source save sequencing", () => {
    for (const from of kinds) {
        for (const to of kinds) {
            if (from === to) continue;
            it(`switches ${from} to ${to}`, async () => {
                const { ops, calls } = operations();
                await saveAudioSource(request(from, to), ops);
                expect(ops.recordActivation).toHaveBeenCalledWith(to);
                if (to === "podcast" || to === "ard") {
                    expect(calls).toEqual([
                        `podcast:${from === "podcast" || from === "ard" ? 4 : "new"}`,
                    ]);
                    expect(ops.assignDirectSource).not.toHaveBeenCalled();
                } else {
                    expect(calls).toEqual([
                        ...(from === "podcast" || from === "ard" ? ["detach"] : []),
                        `assign:${profiles[to].source}:${to === "radio"}`,
                    ]);
                }
            });
        }
    }
    it("leaves an unchanged source untouched while saving a model separately", async () => {
        const { ops, calls } = operations();
        await saveAudioSource(request("audio", "audio"), ops);
        expect(calls).toEqual([]);
    });
    it("saves independent profiles with each confirmed revision before activation", async () => {
        const { ops, calls } = operations();
        const input = {
            ...request("audio", "ard"),
            dirtyKinds: ["podcast", "ard"] as AudioSourceKind[],
        };
        await saveAudioSource(input, ops);
        expect(calls).toEqual(["profile:podcast:0", "profile:ard:1", "podcast:new"]);
        expect(ops.recordProfile).toHaveBeenCalledTimes(2);
    });
    it("materializes the departing legacy audio assignment before choosing a podcast", async () => {
        const { ops, calls } = operations();
        const input = request("audio", "podcast");
        input.currentSource = "lib://legacy-a.taf";
        input.drafts = { ...profiles, audio: { source: "lib://legacy-a.taf" } };
        input.dirtyKinds = profilesToPersist(
            ["podcast"],
            ["audio", "podcast", "ard", "radio"],
            "audio",
            "podcast",
        );
        expect(input.dirtyKinds).toEqual(["audio", "podcast"]);
        await saveAudioSource(input, ops);
        expect(calls).toEqual(["profile:audio:0", "profile:podcast:1", "podcast:new"]);
        expect(ops.recordProfile).toHaveBeenCalledWith(
            "audio",
            expect.objectContaining({ revision: 1 }),
        );
    });
    it("materializes an active legacy RSS profile before switching to ARD", () => {
        expect(profilesToPersist(["ard"], ["podcast", "ard"], "podcast", "ard")).toEqual([
            "podcast",
            "ard",
        ]);
    });
    it("stops after a profile conflict without activating or retrying", async () => {
        const { ops } = operations();
        vi.mocked(ops.saveProfile).mockRejectedValueOnce(new Error("409"));
        await expect(
            saveAudioSource({ ...request("audio", "radio"), dirtyKinds: ["radio"] }, ops),
        ).rejects.toMatchObject({ stage: "profile", savedProfiles: [] });
        expect(ops.assignDirectSource).not.toHaveBeenCalled();
        expect(ops.saveProfile).toHaveBeenCalledTimes(1);
    });
    it("reports a detach success followed by assignment failure without claiming activation", async () => {
        const { ops } = operations();
        vi.mocked(ops.assignDirectSource).mockRejectedValueOnce(new Error("503"));
        await expect(saveAudioSource(request("podcast", "audio"), ops)).rejects.toMatchObject({
            stage: "source",
            detached: true,
        });
        expect(ops.recordSubscription).toHaveBeenCalledWith(undefined);
        expect(ops.recordActivation).not.toHaveBeenCalled();
    });
    it("preserves current source when detach fails", async () => {
        const { ops } = operations();
        vi.mocked(ops.detachPodcast).mockRejectedValueOnce(new Error("409"));
        await expect(saveAudioSource(request("ard", "radio"), ops)).rejects.toBeInstanceOf(
            SourceSaveError,
        );
        expect(ops.assignDirectSource).not.toHaveBeenCalled();
    });
    it("rejects an overlong UTF-8 direct URL before persisting or assigning it", async () => {
        const { ops } = operations();
        const input = request("audio", "radio");
        input.drafts = { ...profiles, radio: { source: "https://example.org/" + "é".repeat(120) } };
        input.dirtyKinds = ["radio"];
        await expect(saveAudioSource(input, ops)).rejects.toMatchObject({
            stage: "source",
            reason: "invalidDirect",
        });
        expect(ops.saveProfile).not.toHaveBeenCalled();
        expect(ops.assignDirectSource).not.toHaveBeenCalled();
    });
    it("does not transfer trims between RSS and ARD profiles", async () => {
        const { ops } = operations();
        const separate = {
            ...profiles,
            podcast: { ...profiles.podcast, trimStartSeconds: 15 },
            ard: { ...profiles.ard, trimStartSeconds: 60 },
        };
        await saveAudioSource({ ...request("podcast", "ard"), drafts: separate }, ops);
        expect(ops.savePodcast).toHaveBeenCalledWith(
            expect.objectContaining({ trimStartSeconds: 60, sourceType: "ard_audiothek" }),
            expect.objectContaining({ revision: 4 }),
        );
    });
    it("detaches an exact legacy prepared source and blocks ambiguous active legacy ownership", async () => {
        const { ops } = operations();
        const old = { ...subscription("podcast"), ownsAssignment: undefined, audioId: 31 };
        const prepared = `lib://podcasts/${old.id}/0000001f.taf`;
        await saveAudioSource(
            { ...request("podcast", "radio"), currentSource: prepared, subscription: old },
            ops,
        );
        expect(ops.detachPodcast).toHaveBeenCalledOnce();
        const second = operations();
        await expect(
            saveAudioSource(
                {
                    ...request("audio", "radio"),
                    currentSource: "",
                    subscription: { ...old, audioId: undefined },
                },
                second.ops,
            ),
        ).rejects.toMatchObject({ stage: "detach" });
        expect(second.ops.assignDirectSource).not.toHaveBeenCalled();
    });
});
