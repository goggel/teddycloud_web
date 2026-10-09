import { useCallback, useEffect, useRef, useState } from "react";
import { TeddyCloudApi } from "../../../../api";
import { PodcastSearchResult } from "../../../../types/podcastTypes";

export const usePodcastFeedFilter = (
    api: TeddyCloudApi,
    results: PodcastSearchResult[],
    selectedFeedUrl: string,
    enabled: boolean,
) => {
    const cache = useRef(new Map<string, { videoOnly: boolean; checkedAt: number }>());
    const [videoFeeds, setVideoFeeds] = useState(new Set<string>());
    const check = useCallback(
        async (url: string, signal: AbortSignal) => {
            const cached = cache.current.get(url);
            const videoOnly =
                cached && Date.now() - cached.checkedAt < 600_000
                    ? cached.videoOnly
                    : (await api.podcastFeedInfo(url, signal)).videoOnly;
            if (signal.aborted) return;
            if (cache.current.size >= 100) {
                const oldest = cache.current.keys().next().value;
                if (oldest !== undefined) cache.current.delete(oldest);
            }
            cache.current.set(url, { videoOnly, checkedAt: Date.now() });
            setVideoFeeds((previous) => {
                if (previous.has(url) === videoOnly) return previous;
                const next = new Set(previous);
                if (videoOnly) next.add(url);
                else next.delete(url);
                return next;
            });
        },
        [api],
    );
    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        const pending = results
            .filter((item) => item.sourceType !== "ard_audiothek")
            .map((item) => item.feedUrl)
            .slice(0, 20);
        const worker = async () => {
            while (pending.length && !controller.signal.aborted) {
                const url = pending.shift()!;
                // An unavailable feed stays visible and can still be previewed.
                await check(url, controller.signal).catch(() => {});
            }
        };
        // Results render immediately; at most three metadata requests run at once.
        for (let i = 0; i < 3; i++) void worker();
        return () => controller.abort();
    }, [enabled, results, check]);
    useEffect(() => {
        if (!enabled || !selectedFeedUrl) return;
        try {
            if (!["http:", "https:"].includes(new URL(selectedFeedUrl).protocol)) return;
        } catch {
            return;
        }
        const controller = new AbortController();
        // Selection has its own request lifetime: clearing the search dropdown
        // must not cancel validation of a just-selected result.
        const timer = setTimeout(() => {
            void check(selectedFeedUrl, controller.signal).catch(() => {});
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [enabled, selectedFeedUrl, check]);
    return {
        results: results.filter(
            (item) =>
                !enabled || item.sourceType === "ard_audiothek" || !videoFeeds.has(item.feedUrl),
        ),
        selectedVideo: enabled && videoFeeds.has(selectedFeedUrl),
    };
};
