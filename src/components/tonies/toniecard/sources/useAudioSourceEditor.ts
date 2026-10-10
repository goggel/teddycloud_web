import { useEffect, useRef, useState } from "react";
import {
    AudioSourceKind,
    AudioSourceProfiles,
    SourceProfilesResponse,
} from "../../../../types/audioSourceTypes";
import {
    activeSourceKind,
    cloneSourceProfiles,
    completeSourceProfiles,
    SourceAssignment,
    sourceProfilesFromResponse,
} from "./sourceProfiles";

export type SourceProfilesLoader = (signal: AbortSignal) => Promise<SourceProfilesResponse>;

export const useAudioSourceEditor = (
    open: boolean,
    ruid: string,
    overlay: string,
    assignment: SourceAssignment,
    loadProfiles?: SourceProfilesLoader,
) => {
    const initial = useRef(assignment);
    const [selectedKind, setSelectedKind] = useState<AudioSourceKind>(() =>
        activeSourceKind(assignment),
    );
    const [drafts, setDrafts] = useState<AudioSourceProfiles>(() =>
        completeSourceProfiles(assignment),
    );
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const baseline = useRef(cloneSourceProfiles(drafts));
    const baselineKind = useRef(selectedKind);
    const generation = useRef(0);
    const touchedKinds = useRef(new Set<AudioSourceKind>());
    const selectionTouched = useRef(false);

    useEffect(() => {
        if (!open) return;
        const session = ++generation.current;
        const controller = new AbortController();
        const currentAssignment = (initial.current = assignment);
        touchedKinds.current.clear();
        selectionTouched.current = false;
        const empty = completeSourceProfiles(currentAssignment);
        baseline.current = cloneSourceProfiles(empty);
        baselineKind.current = activeSourceKind(currentAssignment);
        setDrafts(empty);
        setSelectedKind(baselineKind.current);
        setRevision(0);
        setError("");
        if (loadProfiles) {
            setLoading(true);
            void loadProfiles(controller.signal)
                .then((response) => {
                    if (controller.signal.aborted || generation.current !== session) return;
                    const loaded = sourceProfilesFromResponse(currentAssignment, response);
                    baseline.current = cloneSourceProfiles(loaded.profiles);
                    baselineKind.current = loaded.kind;
                    setDrafts((current) => {
                        const merged = cloneSourceProfiles(loaded.profiles);
                        for (const kind of touchedKinds.current) {
                            // A local edit made while GET was in flight wins in this session.
                            (merged as Record<AudioSourceKind, unknown>)[kind] = current[kind];
                        }
                        return merged;
                    });
                    if (!selectionTouched.current) setSelectedKind(loaded.kind);
                    setRevision(loaded.revision);
                })
                .catch((cause: unknown) => {
                    if (!controller.signal.aborted && generation.current === session) {
                        setError(String(cause));
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted && generation.current === session) {
                        setLoading(false);
                    }
                });
        }
        return () => {
            generation.current++;
            controller.abort();
        };
        // Assignment status can poll while the modal is open. Opening a new editor
        // session, not a status update, initializes its drafts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ruid, overlay]);

    const updateProfile = <K extends AudioSourceKind>(kind: K, value: AudioSourceProfiles[K]) => {
        touchedKinds.current.add(kind);
        setDrafts((current) => ({ ...current, [kind]: value }));
    };
    const selectKind = (kind: AudioSourceKind) => {
        selectionTouched.current = true;
        setSelectedKind(kind);
    };
    const cancel = () => {
        touchedKinds.current.clear();
        selectionTouched.current = false;
        setDrafts(cloneSourceProfiles(baseline.current));
        setSelectedKind(baselineKind.current);
        setError("");
    };
    const recordSaved = (kind: AudioSourceKind, response: SourceProfilesResponse) => {
        const confirmed = completeSourceProfiles(initial.current, response.profiles);
        baseline.current = { ...baseline.current, [kind]: confirmed[kind] };
        setRevision(response.revision);
    };
    const dirtyKinds = (Object.keys(drafts) as AudioSourceKind[]).filter(
        (kind) => JSON.stringify(drafts[kind]) !== JSON.stringify(baseline.current[kind]),
    );
    return {
        selectedKind,
        setSelectedKind: selectKind,
        drafts,
        updateProfile,
        revision,
        loading,
        error,
        dirtyKinds,
        selectionChanged: selectedKind !== baselineKind.current,
        cancel,
        recordSaved,
    };
};
