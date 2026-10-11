import { describe, expect, it } from "vitest";
import { PodcastSubscription } from "../../../../types/podcastTypes";
import { defaultPodcastConfig } from "../podcasts/podcastValidation";
import { activeSourceKind, completeSourceProfiles } from "./sourceProfiles";

const subscription = (sourceType: "rss" | "ard_audiothek", ownsAssignment: boolean) =>
    ({
        ...defaultPodcastConfig(),
        sourceType,
        ownsAssignment,
        id: "abc",
        revision: 1,
        ruid: "0123456789abcdef",
        overlay: "",
        state: "ready",
        episodes: [],
    }) satisfies PodcastSubscription;

describe("source profile detection", () => {
    it("maps only an owning subscription to its RSS or ARD source", () => {
        expect(activeSourceKind({ source: "", subscription: subscription("rss", true) })).toBe(
            "podcast",
        );
        expect(
            activeSourceKind({ source: "", subscription: subscription("ard_audiothek", true) }),
        ).toBe("ard");
        expect(
            activeSourceKind({
                source: "https://example.org/file.mp3",
                subscription: subscription("rss", false),
            }),
        ).toBe("audio");
    });

    it("recognizes only an exact prepared path on older podcast servers", () => {
        const old = {
            ...subscription("rss", true),
            ownsAssignment: undefined,
            id: "a".repeat(32),
            audioId: 31,
        };
        expect(
            activeSourceKind({
                source: `lib://podcasts/${old.id}/0000001f.taf`,
                subscription: old,
            }),
        ).toBe("podcast");
        expect(activeSourceKind({ source: "lib://unrelated.taf", subscription: old })).toBe(
            "audio",
        );
        expect(activeSourceKind({ source: "", subscription: { ...old, audioId: undefined } })).toBe(
            "audio",
        );
    });

    it("leaves ambiguous legacy HTTP and TAP sources in the path editor", () => {
        for (const source of ["https://example.org/live", "file.tap", "lib://record.taf"]) {
            expect(activeSourceKind({ source })).toBe("audio");
            expect(completeSourceProfiles({ source }).audio.source).toBe(source);
        }
    });

    it("recognizes a radio only from a matching saved radio profile", () => {
        const source = "https://example.org/live";
        expect(activeSourceKind({ source }, { radio: { source } })).toBe("radio");
        expect(activeSourceKind({ source }, { audio: { source }, radio: { source } })).toBe(
            "audio",
        );
    });

    it("uses explicit kind before ambiguous profiles and keeps podcast ownership first", () => {
        const source = "https://example.org/shared.mp3";
        const profiles = { audio: { source }, radio: { source } };
        expect(activeSourceKind({ source, sourceKind: "radio" }, profiles)).toBe("radio");
        expect(activeSourceKind({ source, sourceKind: "audio" }, profiles)).toBe("audio");
        expect(
            activeSourceKind(
                { source, sourceKind: "radio", subscription: subscription("rss", true) },
                profiles,
            ),
        ).toBe("podcast");
    });

    it("uses the actual audio assignment after another client replaces it", () => {
        const profiles = completeSourceProfiles(
            { source: "lib://replacement.taf" },
            { audio: { source: "lib://old.taf" }, radio: { source: "https://example.org/live" } },
        );
        expect(profiles.audio.source).toBe("lib://replacement.taf");
        expect(profiles.radio.source).toBe("https://example.org/live");
    });

    it("uses an owning subscription over stale settings in its saved profile", () => {
        const current = {
            ...subscription("rss", true),
            feedUrl: "https://example.org/new",
            episodeCount: 2,
        };
        const profiles = completeSourceProfiles(
            { source: "lib://prepared.taf", subscription: current },
            { podcast: { feedUrl: "https://example.org/old", episodeCount: 8 } },
        );
        expect(profiles.podcast.feedUrl).toBe(current.feedUrl);
        expect(profiles.podcast.episodeCount).toBe(2);
    });

    it("keeps RSS and ARD cuts independent when filling missing defaults", () => {
        const profiles = completeSourceProfiles(
            { source: "lib://existing.taf" },
            {
                podcast: {
                    episodeTrims: [{ identity: "rss-1", trimStartSeconds: 1, trimEndSeconds: 0 }],
                },
                ard: {
                    episodeTrims: [{ identity: "ard-1", trimStartSeconds: 2, trimEndSeconds: 0 }],
                },
            },
        );
        expect(profiles.podcast.sourceType).toBe("rss");
        expect(profiles.ard.sourceType).toBe("ard_audiothek");
        expect(profiles.podcast.episodeTrims[0].identity).toBe("rss-1");
        expect(profiles.ard.episodeTrims[0].identity).toBe("ard-1");
        expect(profiles.audio.source).toBe("lib://existing.taf");
    });
});
