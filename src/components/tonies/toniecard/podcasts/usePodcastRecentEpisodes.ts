import { useCallback, useEffect, useRef, useState } from "react";
import { TeddyCloudApi } from "../../../../api";
import { PodcastCapabilities, PodcastDraft, PodcastPreview } from "../../../../types/podcastTypes";
import { configForCapabilities, sourceToken } from "./podcastValidation";

export const usePodcastRecentEpisodes = (
    api: Pick<TeddyCloudApi, "podcastPreview">,
    draft: PodcastDraft,
    capabilities: PodcastCapabilities,
    onResolved: (source: { token: string; key: string }) => void,
) => {
    const token = sourceToken(draft);
    const currentToken = useRef(token);
    currentToken.current = token;
    const onResolvedRef = useRef(onResolved);
    onResolvedRef.current = onResolved;
    const request = useRef<{ controller: AbortController; generation: number } | undefined>(
        undefined,
    );
    const generation = useRef(0);
    const [result, setResult] = useState<{ token: string; preview: PodcastPreview }>();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [activeIdentity, setActiveIdentity] = useState<string>();

    const clear = useCallback(() => {
        generation.current++;
        request.current?.controller.abort();
        request.current = undefined;
        setResult(undefined);
        setActiveIdentity(undefined);
        setError("");
        setLoading(false);
    }, []);
    useEffect(() => clear, [token, clear]);

    const load = useCallback(async () => {
        request.current?.controller.abort();
        const controller = new AbortController();
        const id = ++generation.current;
        request.current = { controller, generation: id };
        setResult(undefined);
        setActiveIdentity(undefined);
        setError("");
        setLoading(true);
        const snapshot = token;
        const config = configForCapabilities(
            {
                ...draft,
                episodeCount: Math.min(5, capabilities.maxEpisodes || 5),
                order: "newest_first",
                intervalHours: 6,
                trimStartSeconds: 0,
                trimEndSeconds: 0,
                episodeTrims: [],
                episodeTrimSourceKey: "",
            },
            capabilities,
        );
        const current = () =>
            !controller.signal.aborted &&
            id === generation.current &&
            snapshot === currentToken.current;
        try {
            const preview = await api.podcastPreview(config, controller.signal);
            if (current()) {
                setResult({ token: snapshot, preview });
                onResolvedRef.current({ token: snapshot, key: preview.sourceKey || "" });
            }
        } catch (cause) {
            if (current()) setError(String(cause));
        } finally {
            if (current()) setLoading(false);
        }
    }, [api, draft, capabilities, token]);

    return {
        preview: result?.token === token ? result.preview : undefined,
        token,
        error,
        loading,
        activeIdentity,
        setActiveIdentity,
        load,
        clear,
    };
};
