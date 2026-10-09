import { PodcastConfig } from "../../../../types/podcastTypes";
export const defaultPodcastConfig = (): PodcastConfig => ({
    feedUrl: "",
    episodeCount: 5,
    order: "newest_first",
    intervalHours: 6,
    refreshOnPlacement: false,
    enabled: true,
});
export const podcastConfig = (value: PodcastConfig): PodcastConfig => ({
    feedUrl: value.feedUrl,
    episodeCount: value.episodeCount,
    order: value.order,
    intervalHours: value.intervalHours,
    refreshOnPlacement: value.refreshOnPlacement,
    enabled: value.enabled,
});
export const validPodcastConfig = (value: PodcastConfig): boolean => {
    try {
        const url = new URL(value.feedUrl);
        return (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.hash &&
            value.feedUrl.length <= 2048 &&
            Number.isInteger(value.episodeCount) &&
            value.episodeCount >= 1 &&
            value.episodeCount <= 50 &&
            ["newest_first", "oldest_first"].includes(value.order) &&
            Number.isInteger(value.intervalHours) &&
            value.intervalHours >= 0 &&
            value.intervalHours <= 168
        );
    } catch {
        return false;
    }
};
