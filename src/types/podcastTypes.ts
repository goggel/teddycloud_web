export type PodcastSourceType = "rss" | "ard_audiothek";
export interface PodcastEpisodeTrim {
    identity: string;
    trimStartSeconds: number;
    trimEndSeconds: number;
}
export interface PodcastConfig {
    sourceType?: PodcastSourceType;
    feedUrl: string;
    ardShowUrl?: string;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    episodeTrimSourceKey?: string;
    episodeTrims?: PodcastEpisodeTrim[];
    episodeCount: number;
    order: "newest_first" | "oldest_first";
    intervalHours: number;
    refreshOnPlacement: boolean;
    enabled: boolean;
}
export type PodcastDraft = PodcastConfig &
    Required<
        Pick<
            PodcastConfig,
            | "sourceType"
            | "ardShowUrl"
            | "trimStartSeconds"
            | "trimEndSeconds"
            | "episodeTrimSourceKey"
            | "episodeTrims"
        >
    >;
export interface PodcastEpisode {
    identity: string;
    title: string;
    url: string;
    publishedAt: number;
    durationSeconds?: number;
    estimatedTrimmedDurationSeconds?: number;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
    trimmedDurationSeconds?: number;
}
export interface PodcastPreview {
    sourceKey?: string;
    ardShowId?: string;
    ardShowUrl?: string;
    title: string;
    episodes: PodcastEpisode[];
    warnings: string[];
}
export interface PodcastSubscription extends PodcastConfig {
    sourceKey?: string;
    ardShowId?: string;
    id: string;
    revision: number;
    ruid: string;
    overlay: string;
    title?: string;
    state: string;
    episodes: PodcastEpisode[];
    lastSuccessAt?: number;
    lastCheckedAt?: number;
    lastError?: string;
    audioId?: number;
}
type PodcastSearchCommon = { title: string; author: string };
export type PodcastSearchResult = PodcastSearchCommon &
    (
        | { sourceType?: "rss"; providerId: number; feedUrl: string }
        | {
              sourceType: "ard_audiothek";
              providerId: string;
              ardShowUrl: string;
              sourceKey?: string;
          }
    );
export interface PodcastCapabilities {
    supported: boolean;
    message?: string;
    maxEpisodes?: number;
    sourceTypes?: PodcastSourceType[];
    trimSupported?: boolean;
    feedInspectionSupported?: boolean;
    maxTrimSeconds?: number;
    maxEpisodeTrims?: number;
    maxRequestBytes?: number;
}
