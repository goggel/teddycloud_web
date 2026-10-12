// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodcastCapabilities, PodcastDraft, PodcastPreview } from "../../../../types/podcastTypes";
import { PodcastEditorState } from "./PodcastSubscriptionEditor";
import { PodcastRecentEpisodes } from "./PodcastRecentEpisodes";
import { defaultPodcastConfig, rssSourceKey, sourceToken } from "./podcastValidation";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
const rssUrl = "https://example.org/feed";
const ardUrl = "https://www.ardsounds.de/sendung/example/123";
const episodes = [
    {
        identity: "a",
        title: "Recent A",
        url: "https://example.org/a.mp3",
        publishedAt: 10,
        durationSeconds: 999,
    },
    { identity: "b", title: "Recent B", url: "https://example.org/b.mp3", publishedAt: 9 },
];
const preview = (sourceKey = rssSourceKey(rssUrl)): PodcastPreview => ({
    sourceKey,
    title: "Show",
    warnings: [],
    episodes,
});
describe("recent episode editor", () => {
    let root: Root;
    let host: HTMLDivElement;
    let draft: PodcastDraft;
    let latest: PodcastEditorState;
    let capabilities: PodcastCapabilities;
    let locked = false;
    const podcastPreview = vi.fn();
    const api = { podcastPreview } as any;
    const Harness = () => {
        const [value, setValue] = useState(draft);
        const [resolved, setResolved] = useState({ token: "", key: "" });
        const key =
            value.sourceType === "rss"
                ? rssSourceKey(value.feedUrl)
                : resolved.token === sourceToken(value)
                  ? resolved.key
                  : "";
        latest = {
            draft: value,
            setDraft: setValue,
            capabilities,
            supported: true,
            sourceKey: key,
            sourceMismatch:
                value.episodeTrims.length > 0 && (!key || key !== value.episodeTrimSourceKey),
            setResolvedSource: setResolved,
            busy: false,
            loading: false,
        } as PodcastEditorState;
        return <PodcastRecentEpisodes api={api} state={latest} locked={locked} />;
    };
    const render = async () => {
        await act(async () => root.render(<Harness />));
    };
    const click = async (label: string, index = 0) => {
        const matches = Array.from(host.querySelectorAll("button")).filter(
            (button) => button.textContent === label,
        );
        expect(matches.length).toBeGreaterThan(index);
        await act(async () => matches[index].click());
    };
    const media = async () => {
        const audio = host.querySelector("audio")!;
        Object.defineProperty(audio, "duration", { configurable: true, value: 100 });
        Object.defineProperty(audio, "seekable", {
            configurable: true,
            value: { length: 1, start: () => 0, end: () => 100 },
        });
        await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
        return audio;
    };
    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        vi.resetAllMocks();
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
        draft = { ...defaultPodcastConfig(), feedUrl: rssUrl, sourceKey: rssSourceKey(rssUrl) };
        capabilities = {
            supported: true,
            trimSupported: true,
            sourceTypes: ["rss", "ard_audiothek"],
        };
        locked = false;
        podcastPreview.mockResolvedValue(preview());
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    });
    afterEach(async () => {
        await act(async () => root.unmount());
        host.remove();
        vi.restoreAllMocks();
    });
    it("auditions defaults despite an override and keeps edits across episode switches", async () => {
        draft.episodeTrims = [{ identity: "a", trimStartSeconds: 4, trimEndSeconds: 7 }];
        draft.episodeTrimSourceKey = rssSourceKey(rssUrl);
        await render();
        await click("podcasts.listenLoad");
        await click("podcasts.listenEpisode");
        expect(host.textContent).toContain("podcasts.listenOverrideIgnored");
        const audio = await media();
        await act(async () => {
            audio.currentTime = 30;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click("podcasts.listenRetained");
        expect(audio.currentTime).toBe(0);
        await act(async () => {
            audio.currentTime = 12;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click("podcasts.listenSetIntro");
        expect(latest.draft.trimStartSeconds).toBe(12);
        expect(host.querySelector("audio")).toBe(audio);
        expect(latest.draft.episodeTrims).toEqual(draft.episodeTrims);
        await click("podcasts.listenEpisode", 1);
        expect(latest.draft.trimStartSeconds).toBe(12);
        expect(podcastPreview).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("Recent B");
    });
    it("allows editing an existing override at capacity but blocks a new one and mismatch", async () => {
        draft.episodeTrims = [
            { identity: "a", trimStartSeconds: 1, trimEndSeconds: 0 },
            ...Array.from({ length: 49 }, (_, i) => ({
                identity: `old-${i}`,
                trimStartSeconds: 0,
                trimEndSeconds: 0,
            })),
        ];
        draft.episodeTrimSourceKey = rssSourceKey(rssUrl);
        await render();
        await click("podcasts.listenLoad");
        await click("podcasts.listenEpisode");
        const episodeTarget = host.querySelector<HTMLInputElement>('input[value="episode"]')!;
        await act(async () => episodeTarget.click());
        const audio = await media();
        await act(async () => {
            audio.currentTime = 5;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click("podcasts.listenSetIntro");
        expect(
            latest.draft.episodeTrims.find((item) => item.identity === "a")?.trimStartSeconds,
        ).toBe(5);
        await click("podcasts.listenEpisode", 1);
        await media();
        expect(
            Array.from(host.querySelectorAll("button")).find(
                (item) => item.textContent === "podcasts.listenSetIntro",
            )?.disabled,
        ).toBe(true);
        const atCapacity = latest.draft.episodeTrims;
        await click("podcasts.listenSetIntro");
        expect(latest.draft.episodeTrims).toBe(atCapacity);
        await click("podcasts.listenEpisode", 0);
        await media();
        locked = true;
        await render();
        const lockedTrims = latest.draft.episodeTrims;
        await click("podcasts.listenSetIntro");
        await click("podcasts.listenUseDefaults");
        expect(latest.draft.episodeTrims).toBe(lockedTrims);
        locked = false;
        await render();
        await act(async () => latest.setDraft({ ...latest.draft, episodeTrimSourceKey: "other" }));
        expect(
            Array.from(host.querySelectorAll("button")).find(
                (item) => item.textContent === "podcasts.listenUseDefaults",
            )?.disabled,
        ).toBe(true);
        expect(
            Array.from(host.querySelectorAll("button")).find(
                (item) => item.textContent === "podcasts.listenSetIntro",
            )?.disabled,
        ).toBe(true);
    });
    it("lets legacy servers listen while hiding cut actions", async () => {
        capabilities = { supported: true, sourceTypes: ["rss", "ard_audiothek"] };
        await render();
        await click("podcasts.listenLoad");
        await click("podcasts.listenEpisode");
        expect(host.querySelector("audio")).toBeTruthy();
        expect(host.textContent).not.toContain("podcasts.listenSetIntro");
        expect(host.textContent).not.toContain("podcasts.listenDefaults");
    });
    it("resolves an ARD canonical key for capture without changing the show draft", async () => {
        draft = {
            ...draft,
            sourceType: "ard_audiothek",
            ardShowUrl: ardUrl,
            sourceKey: "",
            displayName: "ARD name",
        };
        podcastPreview.mockResolvedValue(preview("ard:123"));
        await render();
        await click("podcasts.listenLoad");
        expect(latest.sourceKey).toBe("ard:123");
        expect(latest.draft.ardShowUrl).toBe(ardUrl);
        expect(latest.draft.displayName).toBe("ARD name");
        expect(latest.draft.sourceKey).toBe("");
        await click("podcasts.listenEpisode");
        await act(async () =>
            host.querySelector<HTMLInputElement>('input[value="episode"]')!.click(),
        );
        const audio = await media();
        await act(async () => {
            audio.currentTime = 6;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click("podcasts.listenSetIntro");
        expect(latest.draft.episodeTrimSourceKey).toBe("ard:123");
        expect(latest.draft.episodeTrims[0].trimStartSeconds).toBe(6);
    });
    it("loads recent metadata even while unrelated playlist numbers need correction", async () => {
        draft = { ...draft, episodeCount: 0, intervalHours: -1, trimStartSeconds: 30000 };
        await render();
        await click("podcasts.listenLoad");
        expect(podcastPreview.mock.calls[0][0]).toMatchObject({
            episodeCount: 5,
            intervalHours: 6,
            trimStartSeconds: 0,
            trimEndSeconds: 0,
        });
        expect(latest.draft.episodeCount).toBe(0);
        expect(latest.draft.intervalHours).toBe(-1);
        expect(latest.draft.trimStartSeconds).toBe(30000);
    });
    it("does not offer ARD loading when the server only supports legacy RSS", async () => {
        draft = { ...draft, sourceType: "ard_audiothek", ardShowUrl: ardUrl };
        capabilities = { supported: true };
        await render();
        expect(
            Array.from(host.querySelectorAll("button")).find(
                (item) => item.textContent === "podcasts.listenLoad",
            )?.disabled,
        ).toBe(true);
        expect(podcastPreview).not.toHaveBeenCalled();
    });
});
