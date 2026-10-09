export interface PodcastConfig {
    feedUrl: string;
    episodeCount: number;
    order: "newest_first" | "oldest_first";
    intervalHours: number;
    refreshOnPlacement: boolean;
    enabled: boolean;
}
export interface PodcastEpisode {
    identity: string;
    title: string;
    url: string;
    publishedAt: number;
    duration?: number;
}
export interface PodcastPreview {
    title: string;
    episodes: PodcastEpisode[];
    warnings: string[];
}
export interface PodcastSubscription extends PodcastConfig {
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
export interface PodcastSearchResult {
    providerId: number;
    title: string;
    author: string;
    feedUrl: string;
}
export interface PodcastCapabilities {
    supported: boolean;
    message?: string;
    maxEpisodes?: number;
}
