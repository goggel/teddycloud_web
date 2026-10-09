import { describe, expect, it } from "vitest";
import { defaultPodcastConfig, validPodcastConfig } from "./podcastValidation";
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
