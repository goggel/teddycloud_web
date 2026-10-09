// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeddyCloudApi } from "../../../../api";
import { PodcastSearchResult } from "../../../../types/podcastTypes";
import { usePodcastFeedFilter } from "./usePodcastFeedFilter";

let root: Root, host: HTMLDivElement;
let current: ReturnType<typeof usePodcastFeedFilter>;
const feedInfo = vi.fn();
const api = { podcastFeedInfo: feedInfo } as unknown as TeddyCloudApi;
const results: PodcastSearchResult[] = Array.from({ length: 5 }, (_, index) => ({
    providerId: index,
    title: "Show " + index,
    author: "Publisher",
    feedUrl: "https://example.org/" + index,
}));
function Harness({ enabled, items }: { enabled: boolean; items: PodcastSearchResult[] }) {
    current = usePodcastFeedFilter(api, items, "", enabled);
    return null;
}
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    feedInfo.mockReset();
    host = document.createElement("div");
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
});
describe("background feed filtering", () => {
    it("limits concurrent probes and cancels queued and obsolete checks when results change", async () => {
        const pending: ((result: { videoOnly: boolean }) => void)[] = [];
        feedInfo.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
        await act(async () => root.render(<Harness enabled items={results} />));
        expect(current.results).toEqual(results);
        expect(feedInfo).toHaveBeenCalledTimes(3);
        await act(async () => pending[0]({ videoOnly: true }));
        expect(feedInfo).toHaveBeenCalledTimes(4);
        expect(current.results).toEqual(results.slice(1));
        const oldSignal = feedInfo.mock.calls[1][1];
        const newer = [
            { providerId: 99, title: "New", author: "", feedUrl: "https://example.org/new" },
        ];
        await act(async () => root.render(<Harness enabled items={newer} />));
        expect(oldSignal.aborted).toBe(true);
        await act(async () => pending[1]({ videoOnly: true }));
        expect(current.results).toEqual(newer);
        expect(feedInfo).toHaveBeenCalledTimes(5);
        expect(feedInfo.mock.calls.some(([url]) => url === "https://example.org/4")).toBe(false);
    });
    it("keeps old backends and ARD results usable without RSS probes", async () => {
        await act(async () => root.render(<Harness enabled={false} items={results} />));
        expect(current.results).toEqual(results);
        expect(feedInfo).not.toHaveBeenCalled();
        const ard: PodcastSearchResult[] = [
            {
                sourceType: "ard_audiothek",
                providerId: "123",
                title: "ARD",
                author: "",
                ardShowUrl: "https://ardsounds.de/sendung/show/123",
            },
        ];
        await act(async () => root.render(<Harness enabled items={ard} />));
        expect(current.results).toEqual(ard);
        expect(feedInfo).not.toHaveBeenCalled();
    });
});
