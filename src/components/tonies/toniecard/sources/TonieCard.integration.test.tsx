// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TonieCard } from "../TonieCard";
import { TonieCardProps } from "../../../../types/tonieTypes";
import { PodcastSubscription } from "../../../../types/podcastTypes";
import { SourceProfilesResponse } from "../../../../types/audioSourceTypes";
import { defaultPodcastConfig } from "../podcasts/podcastValidation";

vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: false,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
});

const mocks = vi.hoisted(() => ({
    capabilities: vi.fn(),
    subscriptions: vi.fn(),
    profiles: vi.fn(),
    saveProfile: vi.fn(),
    detach: vi.fn(),
    savePodcast: vi.fn(),
    post: vi.fn(),
    getTag: vi.fn(),
    notify: vi.fn(),
    file: vi.fn(),
}));
vi.mock("../../../../api", () => ({
    TeddyCloudApi: class {
        podcastCapabilities = mocks.capabilities;
        podcastSubscriptions = mocks.subscriptions;
        sourceProfilesCapabilities = async () => ({ supported: true });
        sourceProfiles = mocks.profiles;
        saveSourceProfile = mocks.saveProfile;
        podcastDetach = mocks.detach;
        podcastSave = mocks.savePodcast;
        apiPostTeddyCloudContentJson = mocks.post;
        apiGetTagInfo = mocks.getTag;
    },
}));
vi.mock("../../../../config/defaultApiConfig", () => ({ defaultAPIConfig: () => ({}) }));
vi.mock("react-i18next", () => {
    const t = (key: string) => key;
    return { useTranslation: () => ({ t }) };
});
vi.mock("../../../../provider/TeddyCloudProvider", () => ({
    useTeddyCloud: () => ({
        addNotification: mocks.notify,
        addLoadingNotification: vi.fn(),
        closeLoadingNotification: vi.fn(),
    }),
}));
vi.mock("../../../../provider/AudioProvider", () => ({
    useAudioContext: () => ({ playAudio: vi.fn() }),
}));
vi.mock("../../hooks/useCustomModelKeys", () => ({
    useCustomModelKeys: () => new Set(),
    toModelKey: (value: string) => value,
}));
vi.mock("../hooks/useResolvedModelAudio", () => ({
    useResolvedModelAudio: () => ({
        modelAudioPath: "lib://model.taf",
        modelAudioHasMapping: true,
        resolvedAudioModel: "",
    }),
}));
vi.mock("../hooks/useTooltipInfoByModel", () => ({
    useTooltipInfoByModel: () => ({ tooltipInfoByModel: {} }),
}));
vi.mock("../hooks/useAssignSiblingEpisode", () => ({
    useAssignSiblingEpisode: ({
        onSelectedSourceChange,
    }: {
        onSelectedSourceChange: (value: string) => void;
    }) => ({
        nextEpisodeAvailable: true,
        prevEpisodeAvailable: true,
        handleAssignNextEpisode: () => onSelectedSourceChange("lib://next.taf"),
        handleAssignPrevEpisode: () => onSelectedSourceChange("lib://prev.taf"),
    }),
}));
vi.mock("../../common/searches/ToniesJsonSearch", () => ({ ToniesJsonSearch: () => null }));
vi.mock("../../common/modals/SelectAudioModal", () => ({
    SelectAudioModal: () => {
        mocks.file();
        return <div>File chooser</div>;
    },
}));

let host: HTMLDivElement, root: Root;
let serverCard: TonieCardProps;
let serverSubscription: PodcastSubscription | undefined;
let stored: SourceProfilesResponse;
const url = "https://example.org/shared.mp3";
const originalCard = (): TonieCardProps => ({
    ruid: "0123456789abcdef",
    uid: "tag",
    source: url,
    tonieInfo: { model: "test", series: "", episode: "", picture: "", language: "", tracks: [] },
    sourceInfo: { model: "", series: "", episode: "", picture: "", language: "", tracks: [] },
    valid: false,
    exists: false,
    live: true,
    nocloud: true,
    hasCloudAuth: false,
    hide: false,
    claimed: false,
    type: "tag",
    audioUrl: "",
    downloadTriggerUrl: "",
    trackSeconds: [],
});
function Harness() {
    const [card, setCard] = useState(serverCard);
    return (
        <TonieCard
            tonieCard={card}
            lastRUIDs={[]}
            overlay=""
            readOnly={false}
            onHide={() => {}}
            onUpdate={setCard}
            onToggleSelect={() => {}}
        />
    );
}
const click = async (element: Element | null) => {
    expect(element).toBeTruthy();
    await act(async () => (element as HTMLElement).click());
};
const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (item) => item.textContent?.trim() === label,
    ) ?? null;
const audio = () => document.querySelector<HTMLInputElement>('[aria-label="sources.audio"]');
const change = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            input,
            value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
};
const open = () => click(document.querySelector('.ant-card-actions [aria-label="edit"]'));
const choose = async (label: string) => {
    await act(async () =>
        document
            .querySelector('[aria-label="sources.source"]')!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
    );
    await click(
        Array.from(document.querySelectorAll(".ant-select-item-option")).find(
            (item) => item.textContent === label,
        ) ?? null,
    );
};
const detach = async () => {
    await click(button("podcasts.detach"));
    await click(document.querySelector(".ant-popconfirm-buttons .ant-btn-primary"));
};
beforeEach(async () => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.clearAllMocks();
    serverCard = originalCard();
    serverSubscription = undefined;
    stored = {
        revision: 0,
        profiles: { audio: { source: url }, radio: { source: url, displayName: "Station" } },
    };
    mocks.capabilities.mockResolvedValue({
        supported: true,
        sourceTypes: ["rss", "ard_audiothek"],
        placementRefreshAlways: true,
    });
    mocks.subscriptions.mockImplementation(async () => ({
        subscriptions: serverSubscription ? [serverSubscription] : [],
    }));
    mocks.profiles.mockImplementation(async () => structuredClone(stored));
    mocks.saveProfile.mockImplementation(async (_ruid, _overlay, kind, revision, profile) => {
        expect(revision).toBe(stored.revision);
        stored = { revision: revision + 1, profiles: { ...stored.profiles, [kind]: profile } };
        return structuredClone(stored);
    });
    mocks.detach.mockImplementation(async () => {
        serverSubscription = undefined;
        serverCard = { ...serverCard, source: url, sourceKind: "audio" };
    });
    mocks.getTag.mockImplementation(async () => ({ ...serverCard }));
    mocks.post.mockImplementation(async (_ruid, body: string) => {
        const params = new URLSearchParams(body);
        if (params.has("source"))
            serverCard = {
                ...serverCard,
                source: params.get("source")!,
                sourceKind: params.get("sourceKind") as "audio" | "radio",
            };
    });
    mocks.savePodcast.mockImplementation(async (_ruid, _overlay, config, subscription) => {
        expect(subscription).toBeUndefined();
        serverSubscription = {
            ...config,
            id: "b".repeat(32),
            revision: 1,
            ruid: serverCard.ruid,
            overlay: "",
            state: "paused",
            episodes: [],
        };
        return { subscription: serverSubscription };
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    // AntD delay-state callbacks must drain before jsdom is torn down.
    await act(async () => vi.runAllTimersAsync());
    vi.useRealTimers();
    host.remove();
});
const render = async () => {
    await act(async () => root.render(<Harness />));
};
const withPodcast = () => {
    serverCard.source = "lib://podcasts/current/00000001.taf";
    serverSubscription = {
        ...defaultPodcastConfig(),
        feedUrl: "https://example.org/feed",
        id: "a".repeat(32),
        revision: 4,
        ruid: serverCard.ruid,
        overlay: "",
        state: "ready",
        episodes: [],
        ownsAssignment: true,
    };
};

describe("TonieCard source editor integration", () => {
    it("locks input and all audio actions until bootstrap, leaves Cancel available, then edits normally", async () => {
        let ready!: (value: { supported: boolean }) => void;
        mocks.capabilities.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    ready = resolve;
                }),
        );
        await render();
        await open();
        expect(audio()!.disabled).toBe(true);
        await change(audio()!, "lib://lost.taf");
        for (const name of ["close", "rollback", "folder-open", "step-forward", "step-backward"]) {
            await click(document.querySelector(`.ant-modal-body [aria-label="${name}"]`));
        }
        await click(button("tonies.editModal.setAudioFromModel"));
        expect(mocks.file).not.toHaveBeenCalled();
        expect(audio()!.value).toBe(url);
        await click(document.querySelector(".ant-modal-close"));
        expect(document.querySelector(".ant-modal")).toBeNull();
        await act(async () => ready({ supported: true }));
        await open();
        expect(audio()!.disabled).toBe(false);
        await change(audio()!, "lib://kept.taf");
        expect(audio()!.value).toBe("lib://kept.taf");
        await click(document.querySelector(".ant-modal-close"));
        await open();
        expect(audio()!.value).toBe(url);
    });
    it.each(["audio", "radio"] as const)(
        "inline detach then %s saves on the first attempt without a second detach",
        async (kind) => {
            withPodcast();
            await render();
            await open();
            await detach();
            await choose(`sources.${kind}`);
            if (kind === "audio") await change(audio()!, "lib://next.taf");
            await click(button("tonies.editModal.save"));
            expect(mocks.detach).toHaveBeenCalledTimes(1);
            expect(mocks.post).toHaveBeenCalledTimes(1);
            expect(mocks.post.mock.calls[0][1]).toContain(`sourceKind=${kind}`);
            expect(mocks.savePodcast).not.toHaveBeenCalled();
            expect(document.querySelector(".ant-modal")).toBeNull();
        },
    );
    it("inline detach then Podcast creates a fresh subscription without the deleted ID", async () => {
        withPodcast();
        await render();
        await open();
        await detach();
        await click(button("tonies.editModal.save"));
        expect(mocks.detach).toHaveBeenCalledTimes(1);
        expect(mocks.savePodcast).toHaveBeenCalledTimes(1);
        expect(mocks.savePodcast.mock.calls[0][3]).toBeUndefined();
        expect(document.querySelector(".ant-modal")).toBeNull();
    });
    it("keeps Save and close locked through delayed detach readback", async () => {
        withPodcast();
        await render();
        await open();
        let ready!: (value: TonieCardProps) => void;
        mocks.getTag.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    ready = resolve;
                }),
        );
        await detach();
        expect(button("tonies.editModal.save")?.disabled).toBe(true);
        expect(document.querySelector(".ant-modal-close")).toBeNull();
        expect(document.querySelector(".ant-select-disabled")).toBeTruthy();
        await act(async () => ready({ ...serverCard }));
        expect(document.querySelector(".ant-modal-close")).toBeTruthy();
        expect(button("tonies.editModal.save")?.disabled).toBe(false);
    });

    it("reports failed detach readback and blocks saving an unknown assignment", async () => {
        withPodcast();
        await render();
        await open();
        mocks.getTag.mockRejectedValueOnce(new Error("read failed"));
        await detach();
        expect(document.body.textContent).toContain("sources.readbackFailed");
        expect(button("tonies.editModal.save")?.disabled).toBe(true);
        expect(mocks.detach).toHaveBeenCalledTimes(1);
    });
    it("reopens explicit Radio and then Audio when both profiles have the same URL", async () => {
        await render();
        await open();
        await choose("sources.radio");
        await click(button("tonies.editModal.save"));
        await open();
        expect(document.querySelector('[aria-label="sources.stationName"]')).toBeTruthy();
        await choose("sources.audio");
        await click(button("tonies.editModal.save"));
        await open();
        expect(audio()).toBeTruthy();
        expect(
            mocks.post.mock.calls.map((call) => new URLSearchParams(call[1]).get("sourceKind")),
        ).toEqual(["radio", "audio"]);
    });
});
