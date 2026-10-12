// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodcastEpisode } from "../../../../types/podcastTypes";
import { episodeUrlProblem, PodcastEpisodePlayer } from "./PodcastEpisodePlayer";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const episode: PodcastEpisode = {
    identity: "one",
    title: "Episode one",
    url: "https://example.org/one.mp3?signature=abc",
    publishedAt: 1,
    durationSeconds: 999,
};
describe("episode player", () => {
    let host: HTMLDivElement;
    let root: Root;
    const capture = vi.fn();
    const play = vi.fn();
    const pause = vi.fn();
    const load = vi.fn();
    const click = async (key: string) => {
        const button = Array.from(host.querySelectorAll("button")).find(
            (item) => item.textContent === key,
        )!;
        expect(button).toBeTruthy();
        await act(async () => button.click());
    };
    const render = async (item = episode, cuts = { trimStartSeconds: 10, trimEndSeconds: 20 }) => {
        await act(async () =>
            root.render(
                <PodcastEpisodePlayer
                    episode={item}
                    cuts={cuts}
                    editable
                    showCuts
                    auditionTarget="defaults"
                    onCapture={capture}
                />,
            ),
        );
    };
    const metadata = async (duration = 100) => {
        const audio = host.querySelector("audio")!;
        Object.defineProperty(audio, "duration", { configurable: true, value: duration });
        Object.defineProperty(audio, "seekable", {
            configurable: true,
            value: { length: 1, start: () => 0, end: () => duration },
        });
        await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
        return audio;
    };
    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        vi.clearAllMocks();
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
        vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
            this: HTMLMediaElement,
        ) {
            play(this);
            this.dispatchEvent(new Event("play"));
            return Promise.resolve();
        });
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
            this: HTMLMediaElement,
        ) {
            pause(this);
            this.dispatchEvent(new Event("pause"));
        });
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (
            this: HTMLMediaElement,
        ) {
            load(this);
        });
    });
    afterEach(async () => {
        await act(async () => root.unmount());
        host.remove();
        vi.restoreAllMocks();
    });
    it("uses native duration, preserves signed URL and captures end offset", async () => {
        await render();
        expect(host.querySelectorAll("audio")).toHaveLength(1);
        expect(host.querySelector("audio")?.getAttribute("src")).toBe(episode.url);
        expect(play).not.toHaveBeenCalled();
        const audio = await metadata();
        expect(host.textContent).toContain("0:00 / 1:40");
        await act(async () => {
            audio.currentTime = 75.6;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        await click("podcasts.listenSetOutro");
        expect(capture).toHaveBeenCalledWith("end", 24, 100);
    });
    it("auditions retained audio and pauses at the end; another player pauses it", async () => {
        await render();
        const audio = await metadata();
        const other = document.createElement("audio");
        document.body.append(other);
        await click("podcasts.listenRetained");
        expect(audio.currentTime).toBe(10);
        expect(play).toHaveBeenCalledWith(audio);
        expect(pause).toHaveBeenCalledWith(other);
        pause.mockClear();
        await act(async () => other.dispatchEvent(new Event("play")));
        expect(pause).toHaveBeenCalledWith(audio);
        pause.mockClear();
        await act(async () => {
            audio.currentTime = 80;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        expect(pause).toHaveBeenCalledWith(audio);
        other.remove();
    });
    it("reports unsupported seeking, play rejection and cleans up a switched URL", async () => {
        await render();
        const old = await metadata();
        Object.defineProperty(old, "seekable", { configurable: true, value: { length: 0 } });
        await click("podcasts.listenEnd");
        expect(host.textContent).toContain("podcasts.listenSeekUnavailable");
        vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("blocked"));
        await click("podcasts.listenPlay");
        expect(host.textContent).toContain("podcasts.listenPlaybackFailed");
        await render({ ...episode, identity: "two", url: "https://example.org/two.mp3" });
        expect(old.hasAttribute("src")).toBe(false);
        expect(host.querySelector("audio")?.getAttribute("src")).toBe(
            "https://example.org/two.mp3",
        );
        expect(load).toHaveBeenCalledWith(old);
    });
    it("rejects mixed content and keeps numeric fallback visible", async () => {
        expect(episodeUrlProblem("http://example.org/audio.mp3", "https:")).toBe("mixed");
        await render({ ...episode, url: "javascript:alert(1)" });
        expect(host.querySelector("audio")).toBeNull();
        expect(host.textContent).toContain("podcasts.listenUrlUnavailable");
    });
    it("disables capture without native duration and clears audition after manual seeking", async () => {
        await render();
        const intro = Array.from(host.querySelectorAll("button")).find(
            (item) => item.textContent === "podcasts.listenSetIntro",
        )!;
        expect((intro as HTMLButtonElement).disabled).toBe(true);
        const audio = await metadata();
        await click("podcasts.listenRetained");
        await act(async () => {
            audio.currentTime = 30;
            audio.dispatchEvent(new Event("seeking"));
            audio.dispatchEvent(new Event("seeked"));
        });
        expect(host.textContent).not.toContain("podcasts.listenSeeking");
        pause.mockClear();
        await act(async () => {
            audio.currentTime = 81;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        expect(pause).not.toHaveBeenCalledWith(audio);
    });
    it("stops an audition when cuts change and reports native errors and thrown seeks", async () => {
        await render();
        const audio = await metadata();
        await click("podcasts.listenRetained");
        pause.mockClear();
        await render(episode, { trimStartSeconds: 11, trimEndSeconds: 20 });
        expect(pause).toHaveBeenCalledWith(audio);
        Object.defineProperty(audio, "currentTime", {
            configurable: true,
            get: () => 0,
            set: () => {
                throw new Error("seek failed");
            },
        });
        await click("podcasts.listenEnd");
        expect(host.textContent).toContain("podcasts.listenSeekUnavailable");
        await act(async () => audio.dispatchEvent(new Event("error")));
        expect(host.textContent).toContain("podcasts.listenPlaybackFailed");
    });
    it("clears the audition stop after ordinary native pause and play", async () => {
        await render();
        const audio = await metadata();
        await click("podcasts.listenRetained");
        await act(async () => {
            audio.dispatchEvent(new Event("pause"));
            audio.dispatchEvent(new Event("play"));
        });
        pause.mockClear();
        await act(async () => {
            audio.currentTime = 90;
            audio.dispatchEvent(new Event("timeupdate"));
        });
        expect(pause).not.toHaveBeenCalledWith(audio);
    });
    it("ignores late old-URL play failure and unloads on close", async () => {
        await render();
        await metadata();
        let rejectOld!: (error: Error) => void;
        vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    rejectOld = reject;
                }),
        );
        await click("podcasts.listenPlay");
        const old = host.querySelector("audio")!;
        await render({ ...episode, identity: "new", url: "https://example.org/new.mp3" });
        await act(async () => rejectOld(new Error("late")));
        expect(host.textContent).not.toContain("podcasts.listenPlaybackFailed");
        expect(old.hasAttribute("src")).toBe(false);
        const current = host.querySelector("audio")!;
        const other = document.createElement("audio");
        document.body.append(other);
        pause.mockClear();
        await act(async () => other.dispatchEvent(new Event("play")));
        expect(pause).toHaveBeenCalledWith(current);
        other.remove();
        await act(async () => root.render(null));
        expect(current.hasAttribute("src")).toBe(false);
        expect(load).toHaveBeenCalledWith(current);
    });
});
