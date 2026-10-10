import {
    PodcastCapabilities,
    PodcastConfig,
    PodcastDraft,
    PodcastEpisode,
} from "../../../../types/podcastTypes";
export const defaultPodcastConfig = (): PodcastDraft => ({
    displayName: "",
    displayNameSourceKey: "",
    sourceType: "rss",
    feedUrl: "",
    ardShowUrl: "",
    trimStartSeconds: 0,
    trimEndSeconds: 0,
    episodeTrimSourceKey: "",
    episodeTrims: [],
    episodeCount: 5,
    order: "newest_first",
    intervalHours: 6,
    refreshOnPlacement: true,
    enabled: true,
});
export const podcastConfig = (value: PodcastConfig): PodcastDraft => ({
    displayName: value.displayName ?? "",
    displayNameSourceKey: value.displayNameSourceKey ?? "",
    sourceType: value.sourceType ?? "rss",
    feedUrl: value.feedUrl,
    ardShowUrl: value.ardShowUrl ?? "",
    trimStartSeconds: value.trimStartSeconds ?? 0,
    trimEndSeconds: value.trimEndSeconds ?? 0,
    episodeTrimSourceKey: value.episodeTrimSourceKey ?? "",
    episodeTrims: (value.episodeTrims ?? [])
        .map((item) => ({ ...item }))
        .sort((a, b) => a.identity.localeCompare(b.identity)),
    episodeCount: value.episodeCount,
    order: value.order,
    intervalHours: value.intervalHours,
    refreshOnPlacement: true,
    enabled: value.enabled,
});
export const configForCapabilities = (
    value: PodcastConfig,
    capabilities: PodcastCapabilities,
): PodcastConfig => {
    const config: PodcastConfig = podcastConfig(value);
    if (!capabilities.sourceTypes) {
        delete config.sourceType;
        delete config.ardShowUrl;
    }
    if (!capabilities.trimSupported) {
        delete config.trimStartSeconds;
        delete config.trimEndSeconds;
        delete config.episodeTrimSourceKey;
        delete config.episodeTrims;
    }
    if (!capabilities.displayNameSupported) {
        delete config.displayName;
        delete config.displayNameSourceKey;
    }
    return config;
};
export const validTrim = (value: number) => Number.isInteger(value) && value >= 0 && value <= 21600;
export const rssSourceKey = (feedUrl: string) => {
    try {
        return "rss:" + new URL(feedUrl).href;
    } catch {
        return "";
    }
};
export const sourceToken = (value: PodcastConfig) =>
    (value.sourceType ?? "rss") +
    ":" +
    (value.sourceType === "ard_audiothek" ? value.ardShowUrl : value.feedUrl);
export const effectiveTrim = (config: PodcastConfig, episode: Pick<PodcastEpisode, "identity">) =>
    config.episodeTrims?.find((item) => item.identity === episode.identity) ?? {
        identity: episode.identity,
        trimStartSeconds: config.trimStartSeconds ?? 0,
        trimEndSeconds: config.trimEndSeconds ?? 0,
    };
export const validPodcastConfig = (value: PodcastConfig): boolean => {
    try {
        const config = podcastConfig(value);
        const url = new URL(
            config.sourceType === "ard_audiothek" ? config.ardShowUrl : config.feedUrl,
        );
        // Validate the submitted path before URL normalization can erase dot segments.
        const ardPath = config.ardShowUrl.match(/^https:\/\/[^/?#]+([^?#]*)/i)?.[1] ?? "";
        const ardSegments = ardPath.match(/^\/sendung\/[^/%\\\s]+\/([^/]+)\/?$/);
        const sourceValid =
            config.sourceType === "rss"
                ? ["http:", "https:"].includes(url.protocol) && config.feedUrl.length <= 2048
                : config.sourceType === "ard_audiothek" &&
                  url.protocol === "https:" &&
                  [
                      "ardaudiothek.de",
                      "www.ardaudiothek.de",
                      "ardsounds.de",
                      "www.ardsounds.de",
                  ].includes(url.hostname) &&
                  !url.port &&
                  Boolean(
                      ardSegments &&
                      /^(?:[0-9]{1,20}|urn:ard:show:[a-f0-9]{16})$/.test(
                          decodeURIComponent(ardSegments[1]),
                      ),
                  ) &&
                  config.ardShowUrl.length <= 2048;
        return (
            sourceValid &&
            !url.username &&
            !url.password &&
            !url.hash &&
            Number.isInteger(config.episodeCount) &&
            config.episodeCount >= 1 &&
            config.episodeCount <= 50 &&
            ["newest_first", "oldest_first"].includes(config.order) &&
            Number.isInteger(config.intervalHours) &&
            config.intervalHours >= 0 &&
            config.intervalHours <= 168 &&
            validTrim(config.trimStartSeconds) &&
            validTrim(config.trimEndSeconds) &&
            config.episodeTrims.length <= 50 &&
            new Set(config.episodeTrims.map((e) => e.identity)).size ===
                config.episodeTrims.length &&
            config.episodeTrims.every(
                (item) =>
                    item.identity.length > 0 &&
                    new TextEncoder().encode(item.identity).length <= 512 &&
                    !/[\x00-\x1f\x7f]/.test(item.identity) &&
                    validTrim(item.trimStartSeconds) &&
                    validTrim(item.trimEndSeconds),
            ) &&
            (!config.episodeTrims.length || Boolean(config.episodeTrimSourceKey))
        );
    } catch {
        return false;
    }
};
