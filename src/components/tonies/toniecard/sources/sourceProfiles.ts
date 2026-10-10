import {
    AudioSourceKind,
    AudioSourceProfiles,
    SourceProfilesResponse,
    StoredAudioSourceProfiles,
} from "../../../../types/audioSourceTypes";
import { PodcastSubscription } from "../../../../types/podcastTypes";
import { defaultPodcastConfig, podcastConfig } from "../podcasts/podcastValidation";

export interface SourceAssignment {
    source: string;
    subscription?: PodcastSubscription;
}

export const ownsSourceAssignment = (assignment: SourceAssignment): boolean => {
    const subscription = assignment.subscription;
    if (!subscription) return false;
    if (typeof subscription.ownsAssignment === "boolean") return subscription.ownsAssignment;
    // Older servers do not report ownership. An exact generated path is enough
    // for an already prepared subscription; other assignments remain ambiguous.
    return Boolean(
        subscription.audioId &&
        assignment.source ===
            `lib://podcasts/${subscription.id}/${subscription.audioId.toString(16).padStart(8, "0")}.taf`,
    );
};

// A subscription can be paused or can have lost its assignment to a manual edit.
// Its mere presence is not evidence that it controls the Tonie.
export const activeSourceKind = (
    assignment: SourceAssignment,
    profiles: StoredAudioSourceProfiles = {},
): AudioSourceKind => {
    if (ownsSourceAssignment(assignment)) {
        return assignment.subscription?.sourceType === "ard_audiothek" ? "ard" : "podcast";
    }
    // Legacy HTTP audio, TAPs, and live flags alone do not identify a radio.
    if (
        assignment.source &&
        profiles.radio?.source === assignment.source &&
        profiles.audio?.source !== assignment.source
    ) {
        return "radio";
    }
    return "audio";
};

const podcastDraft = (sourceType: "rss" | "ard_audiothek") => ({
    ...defaultPodcastConfig(),
    sourceType,
});

export const completeSourceProfiles = (
    assignment: SourceAssignment,
    stored: StoredAudioSourceProfiles = {},
): AudioSourceProfiles => {
    const kind = activeSourceKind(assignment, stored);
    const subscription = ownsSourceAssignment(assignment) ? assignment.subscription : undefined;
    const podcast =
        subscription?.sourceType !== "ard_audiothek" && subscription
            ? podcastConfig(subscription)
            : undefined;
    const ard =
        subscription?.sourceType === "ard_audiothek" ? podcastConfig(subscription) : undefined;
    const profiles: AudioSourceProfiles = {
        audio: {
            source: kind === "audio" ? assignment.source : "",
            ...stored.audio,
        },
        radio: {
            source: kind === "radio" ? assignment.source : "",
            ...stored.radio,
        },
        podcast: {
            ...podcastDraft("rss"),
            ...podcast,
            ...stored.podcast,
            sourceType: "rss",
            episodeTrims: [...(stored.podcast?.episodeTrims ?? podcast?.episodeTrims ?? [])].map(
                (item) => ({ ...item }),
            ),
        },
        ard: {
            ...podcastDraft("ard_audiothek"),
            ...ard,
            ...stored.ard,
            sourceType: "ard_audiothek",
            episodeTrims: [...(stored.ard?.episodeTrims ?? ard?.episodeTrims ?? [])].map(
                (item) => ({
                    ...item,
                }),
            ),
        },
    };
    // The current assignment and owning subscription are the playback truth.
    // Saved profiles supply inactive drafts, never stale active values.
    if (kind === "audio") profiles.audio.source = assignment.source;
    if (kind === "radio") profiles.radio.source = assignment.source;
    if (kind === "podcast" && podcast) {
        profiles.podcast = {
            ...profiles.podcast,
            ...podcast,
            sourceType: "rss",
            episodeTrims: podcast.episodeTrims.map((item) => ({ ...item })),
        };
    }
    if (kind === "ard" && ard) {
        profiles.ard = {
            ...profiles.ard,
            ...ard,
            sourceType: "ard_audiothek",
            episodeTrims: ard.episodeTrims.map((item) => ({ ...item })),
        };
    }
    return profiles;
};

export const cloneSourceProfiles = (profiles: AudioSourceProfiles): AudioSourceProfiles => ({
    audio: { ...profiles.audio },
    radio: { ...profiles.radio },
    podcast: {
        ...profiles.podcast,
        episodeTrims: profiles.podcast.episodeTrims.map((item) => ({ ...item })),
    },
    ard: { ...profiles.ard, episodeTrims: profiles.ard.episodeTrims.map((item) => ({ ...item })) },
});

export const sourceProfilesFromResponse = (
    assignment: SourceAssignment,
    response: SourceProfilesResponse,
) => ({
    revision: response.revision,
    kind: activeSourceKind(assignment, response.profiles),
    profiles: completeSourceProfiles(assignment, response.profiles),
});
