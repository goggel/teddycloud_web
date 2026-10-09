import { describe, expect, it } from "vitest";
import {
    defaultPodcastConfig,
    validPodcastConfig,
    effectiveTrim,
    configForCapabilities,
    podcastConfig,
} from "./podcastValidation";
describe("podcast settings", () => {
    const config = { ...defaultPodcastConfig(), feedUrl: "https://example.org/feed.rss" };
    it("accepts public RSS syntax and periodic updates off", () => {
        expect(validPodcastConfig(config)).toBe(true);
        expect(validPodcastConfig({ ...config, intervalHours: 0 })).toBe(true);
    });
    it.each([0, 51, 1.5, NaN])("rejects episode count %s", (episodeCount) => {
        expect(validPodcastConfig({ ...config, episodeCount })).toBe(false);
    });
    it.each([-1, 169, 1.5])("rejects interval %s", (intervalHours) => {
        expect(validPodcastConfig({ ...config, intervalHours })).toBe(false);
    });
    it.each([
        "file:///etc/passwd",
        "ftp://example.org/a",
        "https://user:pass@example.org",
        "bad",
        "https://example.org/#token",
    ])("rejects URL %s", (feedUrl) => {
        expect(validPodcastConfig({ ...config, feedUrl })).toBe(false);
    });
});

describe("extended podcast settings", () => {
    const config = { ...defaultPodcastConfig(), feedUrl: "https://example.org/feed" };
    it.each([-1, 1.5, NaN, Infinity, 21601])("rejects trim %s", (trimStartSeconds) => {
        expect(validPodcastConfig({ ...config, trimStartSeconds })).toBe(false);
    });
    it("uses whole-episode overrides, including zero, and leaves inactive identities intact", () => {
        const draft = {
            ...config,
            trimStartSeconds: 8,
            trimEndSeconds: 9,
            episodeTrimSourceKey: "rss:" + config.feedUrl,
            episodeTrims: [{ identity: "a", trimStartSeconds: 0, trimEndSeconds: 3 }],
        };
        expect(effectiveTrim(draft, { identity: "a" })).toMatchObject({
            trimStartSeconds: 0,
            trimEndSeconds: 3,
        });
        expect(effectiveTrim(draft, { identity: "b" })).toMatchObject({
            trimStartSeconds: 8,
            trimEndSeconds: 9,
        });
        expect(podcastConfig(draft).episodeTrims).toEqual(draft.episodeTrims);
        expect(
            validPodcastConfig({
                ...draft,
                episodeTrims: [...draft.episodeTrims, ...draft.episodeTrims],
            }),
        ).toBe(false);
        expect(
            validPodcastConfig({
                ...draft,
                episodeTrims: [{ ...draft.episodeTrims[0], identity: "€".repeat(171) }],
            }),
        ).toBe(false);
    });
    it("accepts numeric and URN ARD show links and rejects lookalikes and encoded delimiters", () => {
        const ard = { ...config, sourceType: "ard_audiothek" as const };
        for (const id of [
            "23667030",
            "urn:ard:show:0e3f60ed4ba198df",
            "urn%3Aard%3Ashow%3A0e3f60ed4ba198df",
        ])
            expect(
                validPodcastConfig({
                    ...ard,
                    ardShowUrl: "https://ardsounds.de/sendung/example/" + id + "/?share=1",
                }),
            ).toBe(true);
        for (const ardShowUrl of [
            "https://ardsounds.de/x/../sendung/x/23667030/",
            "https://ardsounds.de.evil.org/sendung/x/23667030/",
            "https://ardsounds.de/sendung/x/23667030%2Fextra",
            "https://ardsounds.de/sendung/x/urn%253Aard%253Ashow%253A0e3f60ed4ba198df",
            "https://ardsounds.de/sendung/x/23667030/#x",
        ])
            expect(validPodcastConfig({ ...ard, ardShowUrl })).toBe(false);
    });
    it("strips only unsupported extension fields", () => {
        const legacy = configForCapabilities(config, { supported: true });
        expect(legacy).not.toHaveProperty("episodeTrims");
        expect(legacy).not.toHaveProperty("sourceType");
        expect(
            configForCapabilities(config, {
                supported: true,
                sourceTypes: ["rss"],
                trimSupported: true,
            }),
        ).toEqual(config);
    });
});
