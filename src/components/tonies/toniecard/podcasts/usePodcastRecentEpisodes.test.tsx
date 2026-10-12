// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeddyCloudApi } from "../../../../api";
import { PodcastCapabilities, PodcastDraft, PodcastPreview } from "../../../../types/podcastTypes";
import { defaultPodcastConfig } from "./podcastValidation";
import { usePodcastRecentEpisodes } from "./usePodcastRecentEpisodes";

const response = (title: string): PodcastPreview => ({
    title,
    sourceKey: "rss:https://example.org/feed",
    warnings: [],
    episodes: [{ identity: title, title, url: "https://example.org/a.mp3", publishedAt: 1 }],
});

describe("recent episode requests", () => {
    let root: Root;
    let container: HTMLDivElement;
    let draft: PodcastDraft;
    let current: ReturnType<typeof usePodcastRecentEpisodes>;
    const resolved = vi.fn();
    const podcastPreview = vi.fn();
    const api = { podcastPreview } as unknown as TeddyCloudApi;
    const capabilities: PodcastCapabilities = {
        supported: true,
        trimSupported: true,
        maxEpisodes: 3,
        sourceTypes: ["rss", "ard_audiothek"],
    };
    const View = () => {
        current = usePodcastRecentEpisodes(api, draft, capabilities, resolved);
        return null;
    };
    const render = async () => {
        await act(async () => root.render(<View />));
    };
    beforeEach(async () => {
        vi.resetAllMocks();
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        draft = {
            ...defaultPodcastConfig(),
            feedUrl: "https://example.org/feed",
            episodeCount: 1,
            order: "oldest_first",
            trimStartSeconds: 12,
            trimEndSeconds: 8,
            intervalHours: 2,
            episodeTrims: [{ identity: "old", trimStartSeconds: 4, trimEndSeconds: 3 }],
            episodeTrimSourceKey: "rss:https://example.org/feed",
        };
        container = document.createElement("div");
        root = createRoot(container);
        await render();
    });
    afterEach(async () => {
        await act(async () => root.unmount());
    });

    it("loads a separate newest list without cuts or draft mutation", async () => {
        podcastPreview.mockResolvedValue(response("new"));
        await act(async () => current.load());
        const sent = podcastPreview.mock.calls[0][0];
        expect(sent).toMatchObject({
            episodeCount: 3,
            order: "newest_first",
            trimStartSeconds: 0,
            trimEndSeconds: 0,
            episodeTrims: [],
            episodeTrimSourceKey: "",
        });
        expect(draft.episodeCount).toBe(1);
        expect(draft.order).toBe("oldest_first");
        expect(draft.trimStartSeconds).toBe(12);
        expect(current.preview?.episodes[0].title).toBe("new");
        expect(resolved).toHaveBeenCalledWith({
            token: "rss:https://example.org/feed",
            key: response("new").sourceKey,
        });
        draft = {
            ...draft,
            trimStartSeconds: 20,
            episodeCount: 2,
            order: "newest_first",
            intervalHours: 0,
        };
        await render();
        expect(current.preview?.title).toBe("new");
        expect(podcastPreview).toHaveBeenCalledTimes(1);
    });

    it("ignores superseded requests and clears on source change", async () => {
        const pending: Array<(value: PodcastPreview) => void> = [];
        podcastPreview.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
        await act(async () => {
            void current.load();
        });
        await act(async () => {
            void current.load();
        });
        await act(async () => pending[0](response("stale")));
        expect(current.preview).toBeUndefined();
        await act(async () => pending[1](response("fresh")));
        expect(current.preview?.title).toBe("fresh");
        draft = { ...draft, feedUrl: "https://example.org/other" };
        await render();
        expect(current.preview).toBeUndefined();
        expect(current.activeIdentity).toBeUndefined();
    });

    it("exposes errors and permits explicit retry", async () => {
        podcastPreview
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(response("retry"));
        await act(async () => current.load());
        expect(current.error).toContain("offline");
        await act(async () => current.load());
        expect(current.error).toBe("");
        expect(current.preview?.title).toBe("retry");
    });
    it("uses the ARD source and preserves empty results and warnings", async () => {
        draft = {
            ...draft,
            sourceType: "ard_audiothek",
            ardShowUrl: "https://www.ardsounds.de/sendung/example/123",
        };
        await render();
        podcastPreview.mockResolvedValue({
            sourceKey: "ard:123",
            title: "ARD show",
            episodes: [],
            warnings: ["No published audio"],
        });
        await act(async () => current.load());
        expect(podcastPreview.mock.calls[0][0]).toMatchObject({
            sourceType: "ard_audiothek",
            ardShowUrl: draft.ardShowUrl,
            order: "newest_first",
            episodeCount: 3,
        });
        expect(current.preview?.episodes).toEqual([]);
        expect(current.preview?.warnings).toEqual(["No published audio"]);
        expect(resolved).toHaveBeenCalledWith({
            token: "ard_audiothek:" + draft.ardShowUrl,
            key: "ard:123",
        });
    });
    it("aborts on source change and unmount even when the API ignores abort", async () => {
        const pending: Array<(value: PodcastPreview) => void> = [];
        podcastPreview.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
        await act(async () => {
            void current.load();
        });
        const signal = podcastPreview.mock.calls[0][1] as AbortSignal;
        draft = { ...draft, feedUrl: "https://example.org/changed" };
        await render();
        expect(signal.aborted).toBe(true);
        await act(async () => pending[0](response("obsolete")));
        expect(current.preview).toBeUndefined();
        expect(resolved).not.toHaveBeenCalled();
        await act(async () => {
            void current.load();
        });
        const secondSignal = podcastPreview.mock.calls[1][1] as AbortSignal;
        await act(async () => root.render(null));
        expect(secondSignal.aborted).toBe(true);
        await act(async () => pending[1](response("late")));
        expect(resolved).not.toHaveBeenCalled();
    });
});
