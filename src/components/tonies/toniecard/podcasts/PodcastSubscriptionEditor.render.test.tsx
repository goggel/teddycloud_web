// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodcastSubscriptionEditor } from "./PodcastSubscriptionEditor";
import { usePodcastSubscription } from "./usePodcastSubscription";
import { defaultPodcastConfig } from "./podcastValidation";
const mocks = vi.hoisted(() => ({
    capabilities: vi.fn(),
    subscriptions: vi.fn(),
    save: vi.fn(),
    preview: vi.fn(),
    search: vi.fn(),
    feedInfo: vi.fn(),
    t: (key: string, args?: Record<string, unknown>) => key + (args ? JSON.stringify(args) : ""),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("../../../../api", () => ({
    TeddyCloudApi: class {
        podcastCapabilities = mocks.capabilities;
        podcastSubscriptions = mocks.subscriptions;
        podcastSave = mocks.save;
        podcastPreview = mocks.preview;
        podcastSearch = mocks.search;
        podcastFeedInfo = mocks.feedInfo;
    },
}));
vi.mock("../../../../config/defaultApiConfig", () => ({ defaultAPIConfig: () => ({}) }));
let root: Root, host: HTMLDivElement, current: ReturnType<typeof usePodcastSubscription>;
const url = "https://example.org/feed";
const base = {
    ...defaultPodcastConfig(),
    feedUrl: url,
    sourceKey: "rss:" + url,
    id: "a".repeat(32),
    revision: 1,
    ruid: "0123456789abcdef",
    overlay: "",
    state: "ready",
    episodes: [
        {
            identity: "episode-a",
            title: "Prepared A",
            url: url + "/a.wav",
            publishedAt: 1,
            trimStartSeconds: 1,
            trimEndSeconds: 2,
            trimmedDurationSeconds: 17,
        },
    ],
};
function Harness({
    open,
    disabled,
    kind,
}: {
    open: boolean;
    disabled: boolean;
    kind?: "podcast" | "ard";
}) {
    current = usePodcastSubscription(open, base.ruid, "");
    return open ? (
        <>
            <PodcastSubscriptionEditor
                state={current}
                kind={kind}
                disabled={disabled}
                onDetached={async () => {}}
            />
            <button
                data-save
                disabled={!current.valid || disabled}
                onClick={() => void current.save()}
            >
                Save
            </button>
        </>
    ) : null;
}
async function render(open = true, disabled = false, kind?: "podcast" | "ard") {
    await act(async () => root.render(<Harness open={open} disabled={disabled} kind={kind} />));
}
const button = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;
async function click(element: Element) {
    await act(async () => (element as HTMLElement).click());
}
async function input(label: string, value: string) {
    const element = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(element).toBeTruthy();
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            element,
            value,
        );
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
}
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    mocks.capabilities.mockResolvedValue({
        supported: true,
        sourceTypes: ["rss", "ard_audiothek"],
        trimSupported: true,
        feedInspectionSupported: true,
    });
    mocks.subscriptions.mockResolvedValue({ subscriptions: [base] });
    mocks.save.mockImplementation(async (_r, _o, config) => ({
        subscription: { ...base, ...config, revision: 2 },
    }));
    mocks.preview.mockResolvedValue({
        sourceKey: "rss:" + url,
        title: "Preview show",
        warnings: [],
        episodes: [
            {
                identity: "episode-a",
                title: "Preview A",
                url: url + "/a.wav",
                publishedAt: 1,
                durationSeconds: 20,
            },
        ],
    });
    mocks.search.mockResolvedValue({ results: [] });
    mocks.feedInfo.mockResolvedValue({ videoOnly: false });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
});
describe("rendered podcast editor", () => {
    it("shows search results immediately and clears a selected video feed when its background check completes", async () => {
        const videoUrl = "https://example.org/maus-video.rss";
        const pending: ((result: { videoOnly: boolean }) => void)[] = [];
        mocks.feedInfo.mockImplementation((feedUrl: string) =>
            feedUrl === videoUrl
                ? new Promise((resolve) => pending.push(resolve))
                : Promise.resolve({ videoOnly: false }),
        );
        mocks.search.mockResolvedValue({
            results: [
                { providerId: 1, title: "Video Maus", author: "WDR", feedUrl: videoUrl },
                { providerId: 2, title: "Audio Maus", author: "WDR", feedUrl: url },
            ],
        });
        await render();
        await input("podcasts.search", "Maus");
        await act(async () => vi.advanceTimersByTimeAsync(400));
        const search = host.querySelector('[aria-label="podcasts.search"]')!;
        await act(async () => search.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
        const video = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (element) => element.textContent === "Video Maus — WDR",
        )!;
        expect(video).toBeTruthy();
        expect(pending).toHaveLength(1);
        await click(video);
        expect(current.draft.feedUrl).toBe(videoUrl);
        expect(current.draft.displayName).toBe("Video Maus");
        expect(current.draft.displayNameSourceKey).toBe("rss:" + videoUrl);
        await click(button("podcasts.preview"));
        expect(host.textContent).toContain("Preview show");
        await input("podcasts.trimStart", "9");
        await act(async () => vi.advanceTimersByTimeAsync(400));
        expect(pending).toHaveLength(2);
        await act(async () => pending.forEach((resolve) => resolve({ videoOnly: true })));
        expect(current.draft.feedUrl).toBe("");
        expect(current.draft.displayName).toBe("");
        expect(current.draft.displayNameSourceKey).toBe("");
        expect(current.draft.trimStartSeconds).toBe(9);
        expect(current.valid).toBe(false);
        expect(host.textContent).toContain("podcasts.videoRemoved");
        expect(host.textContent).not.toContain("Preview show");
        expect(mocks.save).not.toHaveBeenCalled();
    });
    it("does not let a stale video check clear a newer audio selection", async () => {
        const videoUrl = "https://example.org/video.rss";
        let resolveVideo!: (result: { videoOnly: boolean }) => void;
        mocks.feedInfo.mockImplementation((feedUrl: string) =>
            feedUrl === videoUrl
                ? new Promise((resolve) => {
                      resolveVideo = resolve;
                  })
                : Promise.resolve({ videoOnly: false }),
        );
        await render();
        await input("podcasts.feedUrl", videoUrl);
        await act(async () => vi.advanceTimersByTimeAsync(400));
        const signal = mocks.feedInfo.mock.calls.find(([feedUrl]) => feedUrl === videoUrl)![1];
        await input("podcasts.feedUrl", url);
        await act(async () => resolveVideo({ videoOnly: true }));
        expect(signal.aborted).toBe(true);
        expect(current.draft.feedUrl).toBe(url);
        expect(host.textContent).not.toContain("podcasts.videoRemoved");
    });
    it("filters video results asynchronously while retaining audio results and failed checks", async () => {
        let resolveVideo!: (result: { videoOnly: boolean }) => void;
        mocks.feedInfo.mockImplementation((feedUrl: string) => {
            if (feedUrl.endsWith("video"))
                return new Promise((resolve) => {
                    resolveVideo = resolve;
                });
            if (feedUrl.endsWith("unavailable")) return Promise.reject(new Error("timeout"));
            return Promise.resolve({ videoOnly: false });
        });
        mocks.search.mockResolvedValue({
            results: ["video", "audio", "unavailable"].map((kind, index) => ({
                providerId: index,
                title: kind,
                author: "WDR",
                feedUrl: "https://example.org/" + kind,
            })),
        });
        await render();
        await input("podcasts.search", "Maus");
        await act(async () => vi.advanceTimersByTimeAsync(400));
        const search = host.querySelector('[aria-label="podcasts.search"]')!;
        await act(async () => search.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
        expect(document.querySelectorAll(".ant-select-item-option")).toHaveLength(3);
        await act(async () => resolveVideo({ videoOnly: true }));
        const labels = Array.from(document.querySelectorAll(".ant-select-item-option")).map(
            (element) => element.textContent,
        );
        expect(labels).toEqual(["audio — WDR", "unavailable — WDR"]);
        expect(current.draft.feedUrl).toBe(url);
    });
    it("edits defaults locally, keeps explicit zero overrides, removes overrides, saves and cancels", async () => {
        await render();
        await input("podcasts.trimStart", "3");
        await input("podcasts.trimEnd", "4");
        expect(current.draft.trimStartSeconds).toBe(3);
        expect(mocks.preview).not.toHaveBeenCalled();
        expect(mocks.save).not.toHaveBeenCalled();
        await click(button("podcasts.preview"));
        const toggle = host.querySelector(
            '[role="switch"][aria-label^="podcasts.overrideEpisode"]',
        )!;
        await click(toggle);
        expect(current.draft.episodeTrims[0]).toMatchObject({
            trimStartSeconds: 3,
            trimEndSeconds: 4,
        });
        const startLabel = "podcasts.episodeTrimStart" + JSON.stringify({ title: "Preview A" });
        // JSON in translated aria labels is selected without CSS escaping.
        const field = Array.from(host.querySelectorAll<HTMLInputElement>("input")).find(
            (e) => e.getAttribute("aria-label") === startLabel,
        )!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
                field,
                "0",
            );
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(current.draft.episodeTrims[0].trimStartSeconds).toBe(0);
        expect(mocks.preview).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain('podcasts.appliedCuts{"start":1,"end":2}');
        expect(host.textContent).toContain('podcasts.effectiveCuts{"start":0,"end":4}');
        await click(host.querySelector("[data-save]")!);
        expect(mocks.save.mock.calls[0][2].episodeTrims[0].trimStartSeconds).toBe(0);
        await click(button("podcasts.removeOverride"));
        expect(current.draft.episodeTrims).toEqual([]);
        await input("podcasts.trimStart", "9");
        await render(false);
        await render();
        expect(current.draft.trimStartSeconds).toBe(0);
    });
    it("requires an explicit clear when changing a source with inactive stored overrides", async () => {
        mocks.subscriptions.mockResolvedValue({
            subscriptions: [
                {
                    ...base,
                    episodeTrimSourceKey: base.sourceKey,
                    episodeTrims: [
                        { identity: "inactive", trimStartSeconds: 0, trimEndSeconds: 5 },
                    ],
                },
            ],
        });
        await render();
        expect(host.textContent).toContain("inactive");
        await input("podcasts.feedUrl", "https://other.example/feed");
        expect(current.sourceMismatch).toBe(true);
        expect((host.querySelector("[data-save]") as HTMLButtonElement).disabled).toBe(true);
        expect(current.draft.episodeTrims).toHaveLength(1);
        await click(button("podcasts.clearOverrides"));
        expect(current.sourceMismatch).toBe(false);
        expect(current.valid).toBe(true);
        expect(current.draft.episodeTrims).toEqual([]);
    });
    it("hides extensions for a legacy backend and omits unknown save fields", async () => {
        mocks.capabilities.mockResolvedValue({ supported: true });
        await render();
        expect(host.querySelector('[aria-label="podcasts.trimStart"]')).toBeNull();
        await input("podcasts.feedUrl", "https://other.example/feed");
        await click(host.querySelector("[data-save]")!);
        const payload = mocks.save.mock.calls[0][2];
        for (const key of [
            "sourceType",
            "ardShowUrl",
            "trimStartSeconds",
            "trimEndSeconds",
            "episodeTrims",
            "episodeTrimSourceKey",
        ])
            expect(payload).not.toHaveProperty(key);
    });
    it("blocks an empty trim and retains dirty cuts across status polling", async () => {
        await render();
        await input("podcasts.trimStart", "");
        expect(current.valid).toBe(false);
        expect((host.querySelector("[data-save]") as HTMLButtonElement).disabled).toBe(true);
        await input("podcasts.trimStart", "6");
        mocks.subscriptions.mockResolvedValue({
            subscriptions: [{ ...base, revision: 9, trimStartSeconds: 12 }],
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(current.draft.trimStartSeconds).toBe(6);
        await click(host.querySelector("[data-save]")!);
        expect(mocks.save.mock.calls[0][2].trimStartSeconds).toBe(6);
        expect(mocks.save.mock.calls[0][3].revision).toBe(1);
    });
    it("locks trim and preview controls in read-only mode", async () => {
        await render(true, true);
        expect(
            (host.querySelector('[aria-label="podcasts.trimStart"]') as HTMLInputElement).disabled,
        ).toBe(true);
        expect(button("podcasts.preview").disabled).toBe(true);
        expect(mocks.preview).not.toHaveBeenCalled();
    });
    it("uses the selected ARD source, cancels stale searches, and keeps its selected show name", async () => {
        const ardUrl = "https://www.ardsounds.de/sendung/example/urn:ard:show:0e3f60ed4ba198df/";
        mocks.search.mockResolvedValue({
            results: [
                {
                    sourceType: "ard_audiothek",
                    providerId: "23667030",
                    title: "ARD fixture",
                    author: "Publisher",
                    ardShowUrl: ardUrl,
                    sourceKey: "ard:urn:ard:show:0e3f60ed4ba198df",
                },
            ],
        });
        await render();
        await act(async () => current.setDraft({ ...current.draft, sourceType: "ard_audiothek" }));
        await render(true, false, "ard");
        expect(host.querySelector('[aria-label="podcasts.sourceType"]')).toBeNull();
        expect(current.draft.sourceType).toBe("ard_audiothek");
        const search = Array.from(host.querySelectorAll<HTMLInputElement>("input")).find(
            (e) => e.getAttribute("aria-label") === "podcasts.search",
        )!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
                search,
                "ARD",
            );
            search.dispatchEvent(new Event("input", { bubbles: true }));
            await vi.advanceTimersByTimeAsync(400);
        });
        expect(mocks.search).toHaveBeenCalledWith("ARD", expect.any(AbortSignal), "ard_audiothek");
        const signal = mocks.search.mock.calls[0][1];
        await act(async () => search.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
        const show = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (e) => e.textContent === "ARD fixture — Publisher",
        )!;
        await click(show);
        expect(current.draft.ardShowUrl).toBe(ardUrl);
        expect(current.draft.displayName).toBe("ARD fixture");
        expect(host.textContent).toContain("ARD fixture");
        expect(current.sourceKey).toBe("ard:urn:ard:show:0e3f60ed4ba198df");
        await input("podcasts.ardShowUrl", "https://www.ardsounds.de/sendung/other/123/");
        expect(current.draft.displayName).toBe("");
        expect(current.draft.displayNameSourceKey).toBe("");
        expect(host.textContent).not.toContain("ARD fixture");
        await render(false);
        expect(signal.aborted).toBe(true);
    });
    it("compares newest episodes independently and saves only captured draft cuts", async () => {
        const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
        mocks.preview.mockImplementation(async (config) => ({
            sourceKey: "rss:" + url,
            title: "Recent show",
            warnings: [],
            episodes:
                config.episodeCount === 5
                    ? [
                          {
                              identity: "recent-a",
                              title: "Recent A",
                              url: url + "/a.mp3",
                              publishedAt: 10,
                              durationSeconds: 999,
                          },
                          {
                              identity: "recent-b",
                              title: "Recent B",
                              url: url + "/b.mp3",
                              publishedAt: 9,
                          },
                      ]
                    : [
                          {
                              identity: "selected",
                              title: "Selected only",
                              url: url + "/selected.mp3",
                              publishedAt: 8,
                          },
                      ],
        }));
        await render();
        await act(async () =>
            current.setDraft({ ...current.draft, episodeCount: 1, order: "oldest_first" }),
        );
        await click(button("podcasts.preview"));
        expect(host.textContent).toContain("Selected only");
        expect(host.querySelector("audio")).toBeNull();
        await click(button("podcasts.listenLoad"));
        expect(mocks.preview.mock.calls[1][0]).toMatchObject({
            episodeCount: 5,
            order: "newest_first",
            trimStartSeconds: 0,
            trimEndSeconds: 0,
            episodeTrims: [],
        });
        expect(current.draft.episodeCount).toBe(1);
        expect(current.draft.order).toBe("oldest_first");
        expect(host.textContent).toContain("Selected only");
        expect(host.textContent).toContain("Recent A");
        expect(host.querySelector("audio")).toBeNull();
        await click(button("podcasts.listenEpisode"));
        const audio = host.querySelector("audio")!;
        expect(audio.getAttribute("src")).toBe(url + "/a.mp3");
        Object.defineProperty(audio, "duration", { configurable: true, value: 100 });
        await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
        await act(async () => {
            audio.currentTime = 10.4;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click(button("podcasts.listenSetIntro"));
        expect(current.draft.trimStartSeconds).toBe(10);
        expect(current.draft.trimEndSeconds).toBe(0);
        expect(mocks.save).not.toHaveBeenCalled();
        const episodeTarget = host.querySelector<HTMLInputElement>('input[value="episode"]')!;
        await click(episodeTarget);
        await act(async () => {
            audio.currentTime = 99.6;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click(button("podcasts.listenSetOutro"));
        expect(current.draft.episodeTrims).toEqual([
            { identity: "recent-a", trimStartSeconds: 10, trimEndSeconds: 0 },
        ]);
        expect(current.draft.episodeTrimSourceKey).toBe("rss:" + url);
        await click(button("podcasts.listenUseDefaults"));
        expect(current.draft.episodeTrims).toEqual([]);
        await click(button("Save"));
        expect(mocks.save.mock.calls[0][2]).toMatchObject({
            episodeCount: 1,
            order: "oldest_first",
            trimStartSeconds: 10,
            trimEndSeconds: 0,
            episodeTrims: [],
        });
        await render(false);
        expect(pause).toHaveBeenCalledWith();
        expect(audio.hasAttribute("src")).toBe(false);
    });
    it("discards recent-player captures and unloads audio on Cancel and reopen", async () => {
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
        const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
        await render();
        await click(button("podcasts.listenLoad"));
        await click(button("podcasts.listenEpisode"));
        const audio = host.querySelector("audio")!;
        Object.defineProperty(audio, "duration", { configurable: true, value: 100 });
        await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
        await act(async () => {
            audio.currentTime = 7;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click(button("podcasts.listenSetIntro"));
        expect(current.draft.trimStartSeconds).toBe(7);
        await render(false);
        expect(audio.hasAttribute("src")).toBe(false);
        expect(load).toHaveBeenCalledWith();
        await render();
        expect(current.draft.trimStartSeconds).toBe(0);
        expect(host.querySelector("audio")).toBeNull();
        expect(mocks.save).not.toHaveBeenCalled();
    });
});
