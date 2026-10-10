import { PodcastDraft } from "./podcastTypes";

export type AudioSourceKind = "audio" | "radio" | "podcast" | "ard";

export interface AudioFileSourceProfile {
    source: string;
}

export interface RadioSourceProfile {
    source: string;
    displayName?: string;
}

export type PodcastSourceProfile = PodcastDraft & { sourceType: "rss" };
export type ArdSourceProfile = PodcastDraft & { sourceType: "ard_audiothek" };

export interface AudioSourceProfiles {
    audio: AudioFileSourceProfile;
    radio: RadioSourceProfile;
    podcast: PodcastSourceProfile;
    ard: ArdSourceProfile;
}

export type StoredAudioSourceProfiles = {
    [K in AudioSourceKind]?: Partial<AudioSourceProfiles[K]>;
};

export interface SourceProfilesResponse {
    version?: unknown;
    revision: number;
    profiles: StoredAudioSourceProfiles;
}

export interface SourceProfilesCapabilities {
    supported: boolean;
    version?: number;
    maxRequestBytes?: number;
}
