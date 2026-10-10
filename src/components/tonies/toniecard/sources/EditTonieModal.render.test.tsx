// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSourceKind, AudioSourceProfiles } from "../../../../types/audioSourceTypes";
import { PodcastDraft } from "../../../../types/podcastTypes";
import { EditTonieModal } from "../modals/EditTonieModal";
import { PodcastSubscriptionEditor } from "../podcasts/PodcastSubscriptionEditor";
import { defaultPodcastConfig } from "../podcasts/podcastValidation";
import { RadioSourceEditor } from "./RadioSourceEditor";

vi.mock("react-i18next", () => {
    const t = (key: string) => key;
    return { useTranslation: () => ({ t }) };
});
vi.mock("../hooks/useAssignSiblingEpisode", () => ({
    useAssignSiblingEpisode: () => ({
        nextEpisodeAvailable: false,
        prevEpisodeAvailable: false,
        nextEpisodeFile: null,
        prevEpisodeFile: null,
        handleAssignNextEpisode: vi.fn(),
        handleAssignPrevEpisode: vi.fn(),
    }),
}));
vi.mock("../search/RadioStreamSearch", () => ({
    RadioStreamSearch: ({
        onSelectResult,
    }: {
        onSelectResult: (value: { value: string; name: string }) => void;
    }) => (
        <button
            onClick={() =>
                onSelectResult({ value: "https://example.org/live", name: "Station One" })
            }
        >
            Choose station
        </button>
    ),
}));

let host: HTMLDivElement, root: Root;
let currentKind: AudioSourceKind;
let currentProfiles: AudioSourceProfiles;
const empty = () => ({ validateStatus: "" as const, help: "" });
function Harness({
    podcastSupported = true,
    busy = false,
    onCancel = () => {},
}: {
    podcastSupported?: boolean;
    busy?: boolean;
    onCancel?: () => void;
}) {
    const [kind, setKind] = useState<AudioSourceKind>("audio");
    const [profiles, setProfiles] = useState<AudioSourceProfiles>({
        audio: { source: "lib://episode.taf" },
        radio: { source: "", displayName: "" },
        podcast: { ...defaultPodcastConfig(), sourceType: "rss" },
        ard: { ...defaultPodcastConfig(), sourceType: "ard_audiothek" },
    });
    currentKind = kind;
    currentProfiles = profiles;
    const update = <K extends AudioSourceKind>(key: K, value: AudioSourceProfiles[K]) =>
        setProfiles((current) => ({ ...current, [key]: value }));
    const draft = kind === "ard" ? profiles.ard : profiles.podcast;
    const setDraft: React.Dispatch<React.SetStateAction<PodcastDraft>> = (next) => {
        const value = typeof next === "function" ? next(draft) : next;
        if (kind === "ard") update("ard", { ...value, sourceType: "ard_audiothek" });
        else update("podcast", { ...value, sourceType: "rss" });
    };
    const podcastState = {
        capabilities: {
            supported: podcastSupported,
            sourceTypes: ["rss", "ard_audiothek"],
            trimSupported: true,
            placementRefreshAlways: true,
        },
        draft,
        setDraft,
        subscription: undefined,
        sourceKey: "",
        sourceMismatch: false,
        busy: false,
        loading: false,
        dirty: false,
        error: "",
        refresh: async () => {},
        detach: async () => {},
        setResolvedSource: () => {},
    } as unknown as Parameters<typeof PodcastSubscriptionEditor>[0]["state"];
    return (
        <EditTonieModal
            open
            title="Edit"
            onCancel={onCancel}
            onSave={() => {}}
            sourceEditor={{
                kind,
                setKind,
                podcastSupported,
                ardSupported: podcastSupported,
                valid: true,
                loading: false,
                busy,
                error: "",
                editor:
                    kind === "radio" ? (
                        <RadioSourceEditor
                            profile={profiles.radio}
                            onChange={(value) => update("radio", value)}
                        />
                    ) : kind === "podcast" || kind === "ard" ? (
                        <PodcastSubscriptionEditor
                            kind={kind}
                            state={podcastState}
                            disabled={false}
                            onDetached={async () => {}}
                        />
                    ) : null,
            }}
            selectedSource={profiles.audio.source}
            onSelectedSourceChange={(source) => update("audio", { source })}
            originalSource="lib://episode.taf"
            inputValidationSource={empty()}
            setInputValidationSource={() => {}}
            selectedModel=""
            onSelectedModelChange={() => {}}
            originalModel=""
            inputValidationModel={empty()}
            setInputValidationModel={() => {}}
            keyTonieArticleSearch={0}
            onSearchModelChange={() => {}}
            hasPendingChanges
            onOpenFileSelectModal={() => {}}
            modelReadOnly
        />
    );
}
const rootNode = () => document.body;
const selected = (label: string) => rootNode().querySelector(`input[aria-label="${label}"]`);
const choose = async (label: string) => {
    await act(async () =>
        rootNode()
            .querySelector('[aria-label="sources.source"]')!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
    );
    const option = Array.from(document.querySelectorAll(".ant-select-item-option")).find(
        (item) => item.textContent === label,
    )!;
    expect(option).toBeTruthy();
    await act(async () => (option as HTMLElement).click());
};
beforeEach(() => {
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
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("four rendered source forms", () => {
    it("shows only each source's own controls and keeps drafts when switching", async () => {
        await act(async () => root.render(<Harness />));
        expect(selected("sources.audio")).toBeTruthy();
        expect(selected("sources.radioUrl")).toBeNull();
        await choose("sources.radio");
        expect(selected("sources.audio")).toBeNull();
        expect(selected("sources.radioUrl")).toBeTruthy();
        const chooseStation = Array.from(rootNode().querySelectorAll("button")).find(
            (button) => button.textContent === "Choose station",
        )!;
        await act(async () => chooseStation.click());
        expect(currentProfiles.radio.source).toBe("https://example.org/live");
        expect(currentProfiles.radio.displayName).toBe("Station One");
        await choose("podcasts.title");
        expect(currentKind).toBe("podcast");
        expect(selected("podcasts.feedUrl")).toBeTruthy();
        expect(selected("podcasts.ardShowUrl")).toBeNull();
        expect(rootNode().querySelector('[aria-label="podcasts.sourceType"]')).toBeNull();
        await choose("sources.ard");
        expect(currentKind).toBe("ard");
        expect(selected("podcasts.ardShowUrl")).toBeTruthy();
        expect(selected("podcasts.feedUrl")).toBeNull();
        expect(currentProfiles.radio.displayName).toBe("Station One");
        expect(rootNode().querySelectorAll(".ant-switch")).toHaveLength(1);
    });
    it("leaves audio and radio available without podcast capability", async () => {
        await act(async () => root.render(<Harness podcastSupported={false} />));
        expect(selected("sources.audio")).toBeTruthy();
        await choose("sources.radio");
        expect(selected("sources.radioUrl")).toBeTruthy();
        await act(async () =>
            rootNode()
                .querySelector('[aria-label="sources.source"]')!
                .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
        );
        const unavailable = Array.from(
            document.querySelectorAll(".ant-select-item-option-disabled"),
        ).map((item) => item.textContent);
        expect(unavailable).toContain("podcasts.title");
        expect(unavailable).toContain("sources.ard");
    });
    it("locks source inputs and close controls throughout an in-flight save", async () => {
        const cancel = vi.fn();
        await act(async () => root.render(<Harness busy onCancel={cancel} />));
        expect((selected("sources.audio") as HTMLInputElement).matches(":disabled")).toBe(true);
        expect(rootNode().querySelector(".ant-modal-close")).toBeNull();
        const fieldset = rootNode().querySelector(
            ".ant-modal-body fieldset",
        ) as HTMLFieldSetElement;
        expect(fieldset.disabled).toBe(true);
        expect(rootNode().querySelector(".ant-select-disabled")).toBeTruthy();
    });
});
