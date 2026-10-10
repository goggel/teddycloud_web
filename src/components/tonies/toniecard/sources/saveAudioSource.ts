import {
    AudioSourceKind,
    AudioSourceProfiles,
    SourceProfilesResponse,
} from "../../../../types/audioSourceTypes";
import { PodcastCapabilities, PodcastSubscription } from "../../../../types/podcastTypes";
import { configForCapabilities, validPodcastConfig } from "../podcasts/podcastValidation";
import { ownsSourceAssignment } from "./sourceProfiles";

export interface SourceSaveRequest {
    ruid: string;
    overlay: string;
    currentKind: AudioSourceKind;
    selectedKind: AudioSourceKind;
    currentSource: string;
    drafts: AudioSourceProfiles;
    dirtyKinds: AudioSourceKind[];
    profileRevision: number;
    profilesSupported: boolean;
    subscription?: PodcastSubscription;
    podcastCapabilities: PodcastCapabilities;
}

export interface SourceSaveOperations {
    saveProfile: (
        kind: AudioSourceKind,
        revision: number,
        profile: AudioSourceProfiles[AudioSourceKind],
    ) => Promise<SourceProfilesResponse>;
    savePodcast: (
        config: AudioSourceProfiles["podcast"] | AudioSourceProfiles["ard"],
        subscription?: PodcastSubscription,
    ) => Promise<PodcastSubscription>;
    detachPodcast: (subscription: PodcastSubscription) => Promise<void>;
    assignDirectSource: (source: string, live: boolean) => Promise<void>;
    recordProfile: (kind: AudioSourceKind, response: SourceProfilesResponse) => void;
    recordSubscription: (subscription?: PodcastSubscription) => void;
    recordActivation: (kind: AudioSourceKind) => void;
}

export class SourceSaveError extends Error {
    constructor(
        readonly stage: "profile" | "podcast" | "detach" | "source",
        readonly savedProfiles: AudioSourceKind[],
        readonly detached: boolean,
        cause: unknown,
        readonly reason?: "invalidDirect" | "legacyOwnership",
    ) {
        super(String(cause));
        this.name = "SourceSaveError";
    }
}

const isPodcast = (kind: AudioSourceKind) => kind === "podcast" || kind === "ard";

// Legacy HTTP/TAP audio assignments need the existing streaming path. Radio is
// explicit, while a legacy audio path is never classified as a radio by its URL.
export const directSourceLive = (kind: "audio" | "radio", source: string): boolean =>
    kind === "radio" || /^https?:\/\//i.test(source) || /\.tap(?:\?.*)?$/i.test(source);

export const validDirectSource = (kind: "audio" | "radio", source: string): boolean => {
    if (new TextEncoder().encode(source).length > 255 || /[\x00-\x1f\x7f]/.test(source))
        return false;
    if (kind === "audio") return true;
    try {
        const url = new URL(source);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
        return false;
    }
};

export const profilesToPersist = (
    dirtyKinds: AudioSourceKind[],
    missingKinds: AudioSourceKind[],
    currentKind: AudioSourceKind,
    targetKind: AudioSourceKind,
): AudioSourceKind[] => {
    const result = [...dirtyKinds];
    if (
        currentKind !== targetKind &&
        missingKinds.includes(currentKind) &&
        !result.includes(currentKind)
    )
        result.unshift(currentKind);
    return result;
};

export const saveAudioSource = async (
    request: SourceSaveRequest,
    operations: SourceSaveOperations,
): Promise<AudioSourceKind[]> => {
    const savedProfiles: AudioSourceKind[] = [];
    const target = request.selectedKind;
    if (target === "audio" || target === "radio") {
        if (!validDirectSource(target, request.drafts[target].source))
            throw new SourceSaveError(
                "source",
                savedProfiles,
                false,
                "Direct source must be a valid URL/path of at most 255 UTF-8 bytes",
                "invalidDirect",
            );
    } else if (!validPodcastConfig(request.drafts[target])) {
        throw new SourceSaveError("podcast", savedProfiles, false, "Invalid podcast settings");
    }
    let revision = request.profileRevision;
    let detached = false;
    for (const kind of request.dirtyKinds) {
        if (!request.profilesSupported) break;
        try {
            const result = await operations.saveProfile(kind, revision, request.drafts[kind]);
            revision = result.revision;
            savedProfiles.push(kind);
            operations.recordProfile(kind, result);
        } catch (cause) {
            throw new SourceSaveError("profile", savedProfiles, detached, cause);
        }
    }

    const changingKind = target !== request.currentKind;
    if (isPodcast(target)) {
        const config = target === "ard" ? request.drafts.ard : request.drafts.podcast;
        if (
            changingKind ||
            request.dirtyKinds.includes(target) ||
            !request.subscription?.ownsAssignment
        ) {
            try {
                const result = await operations.savePodcast(
                    configForCapabilities(config, request.podcastCapabilities) as typeof config,
                    request.subscription,
                );
                operations.recordSubscription(result);
            } catch (cause) {
                throw new SourceSaveError("podcast", savedProfiles, detached, cause);
            }
        }
        operations.recordActivation(target);
        return savedProfiles;
    }

    const direct = target === "radio" ? request.drafts.radio.source : request.drafts.audio.source;
    const mustAssign = changingKind || direct !== request.currentSource;
    const owns = ownsSourceAssignment({
        source: request.currentSource,
        subscription: request.subscription,
    });
    if (
        mustAssign &&
        request.subscription &&
        request.subscription.ownsAssignment === undefined &&
        !owns &&
        request.subscription.enabled
    ) {
        throw new SourceSaveError(
            "detach",
            savedProfiles,
            detached,
            "Subscription ownership is unknown on this server; refresh the card before changing its direct source",
            "legacyOwnership",
        );
    }
    if (request.subscription && owns && mustAssign) {
        try {
            await operations.detachPodcast(request.subscription);
            detached = true;
            operations.recordSubscription(undefined);
        } catch (cause) {
            throw new SourceSaveError("detach", savedProfiles, detached, cause);
        }
    }
    if (mustAssign) {
        try {
            await operations.assignDirectSource(direct, directSourceLive(target, direct));
        } catch (cause) {
            throw new SourceSaveError("source", savedProfiles, detached, cause);
        }
    }
    operations.recordActivation(target);
    return savedProfiles;
};
