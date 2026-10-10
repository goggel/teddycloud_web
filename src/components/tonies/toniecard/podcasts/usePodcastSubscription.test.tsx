// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePodcastSubscription } from "./usePodcastSubscription";
import { defaultPodcastConfig } from "./podcastValidation";
const mocks = vi.hoisted(() => ({
    capabilities: vi.fn(),
    subscriptions: vi.fn(),
    save: vi.fn(),
    detach: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("../../../../api", () => ({
    TeddyCloudApi: class {
        podcastCapabilities = mocks.capabilities;
        podcastSubscriptions = mocks.subscriptions;
        podcastSave = mocks.save;
        podcastDetach = mocks.detach;
        podcastRefresh = mocks.refresh;
    },
}));
vi.mock("../../../../config/defaultApiConfig", () => ({ defaultAPIConfig: () => ({}) }));
let root: Root, host: HTMLDivElement;
let current: ReturnType<typeof usePodcastSubscription>;
const base = {
    ...defaultPodcastConfig(),
    feedUrl: "https://example.org/feed",
    id: "a".repeat(32),
    revision: 1,
    ruid: "0123456789abcdef",
    overlay: "box-1",
    state: "ready",
    episodes: [],
};
function Probe({ open }: { open: boolean }) {
    current = usePodcastSubscription(open, base.ruid, base.overlay);
    return null;
}
const render = async (open: boolean) => {
    await act(async () => {
        root.render(<Probe open={open} />);
    });
};
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.capabilities.mockResolvedValue({ supported: true });
    mocks.subscriptions.mockResolvedValue({ subscriptions: [base] });
    mocks.save.mockResolvedValue({ subscription: { ...base, revision: 2 } });
    mocks.detach.mockResolvedValue({ detached: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
});
describe("podcast draft and polling", () => {
    it("keeps edits local, discards them on cancel, and stops polling", async () => {
        await render(true);
        expect(current.mode).toBe("podcast");
        expect(current.dirty).toBe(false);
        await act(async () => current.setDraft({ ...current.draft, episodeCount: 2 }));
        expect(current.dirty).toBe(true);
        expect(mocks.save).not.toHaveBeenCalled();
        await render(false);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(mocks.subscriptions).toHaveBeenCalledTimes(1);
        await render(true);
        expect(current.draft.episodeCount).toBe(5);
        expect(current.dirty).toBe(false);
    });
    it("preserves the original revision while polling remote status", async () => {
        await render(true);
        mocks.subscriptions.mockResolvedValue({
            subscriptions: [{ ...base, revision: 9, episodeCount: 7 }],
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(current.subscription?.revision).toBe(9);
        expect(current.editingSubscription?.revision).toBe(1);
        await act(async () => current.setDraft({ ...current.draft, episodeCount: 2 }));
        await act(async () => current.save());
        expect(mocks.save.mock.calls[0][0]).toBe(base.ruid);
        expect(mocks.save.mock.calls[0][1]).toBe("box-1");
        expect(mocks.save.mock.calls[0][3].revision).toBe(1);
        await act(async () => {
            await current.reloadSubscription();
        });
        expect(current.editingSubscription?.revision).toBe(9);
    });
    it("keeps normal editing available with an older backend", async () => {
        mocks.capabilities.mockResolvedValue({ supported: false });
        await render(true);
        expect(current.supported).toBe(false);
        expect(current.mode).toBe("audio");
        expect(mocks.subscriptions).not.toHaveBeenCalled();
        expect(current.dirty).toBe(false);
    });
    it("leaves the draft available and reports save failures", async () => {
        await render(true);
        mocks.save.mockRejectedValue(new Error("conflict"));
        await act(async () => current.setDraft({ ...current.draft, episodeCount: 2 }));
        await act(async () => {
            await expect(current.save()).rejects.toThrow("conflict");
        });
        expect(current.error).toContain("conflict");
        expect(current.dirty).toBe(true);
    });
});
