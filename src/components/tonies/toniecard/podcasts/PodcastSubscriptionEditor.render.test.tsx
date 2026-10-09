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
function Harness({ open, disabled }: { open: boolean; disabled: boolean }) {
    current = usePodcastSubscription(open, base.ruid, "");
    return open ? (
        <>
            <PodcastSubscriptionEditor
                state={current}
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
async function render(open = true, disabled = false) {
    await act(async () => root.render(<Harness open={open} disabled={disabled} />));
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
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
});
describe("rendered podcast editor", () => {
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
    it("switches provider, cancels stale searches, and selects an ARD show in the real dropdown", async () => {
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
        const source = host.querySelector('[aria-label="podcasts.sourceType"]')!;
        await act(async () => source.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
        const ardOption = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (e) => e.textContent === "podcasts.ard",
        )!;
        await click(ardOption);
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
        expect(current.sourceKey).toBe("ard:urn:ard:show:0e3f60ed4ba198df");
        await render(false);
        expect(signal.aborted).toBe(true);
    });
});
