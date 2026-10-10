// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTonieCardSaveFlow } from "../hooks/useTonieCardSaveFlow";
import { defaultPodcastConfig } from "../podcasts/podcastValidation";
import { TonieCardProps } from "../../../../types/tonieTypes";
import { PodcastSubscription } from "../../../../types/podcastTypes";

const mocks = vi.hoisted(() => ({
    saveProfile: vi.fn(),
    profiles: vi.fn(),
    post: vi.fn(),
    getTag: vi.fn(),
    modelSearch: vi.fn(),
    podcastSave: vi.fn(),
}));
vi.mock("../../../../api", () => ({
    TeddyCloudApi: class {
        saveSourceProfile = mocks.saveProfile;
        sourceProfiles = mocks.profiles;
        apiPostTeddyCloudContentJson = mocks.post;
        apiGetTagInfo = mocks.getTag;
        apiGetTeddyCloudApiRaw = mocks.modelSearch;
        podcastSave = mocks.podcastSave;
    },
}));
vi.mock("../../../../config/defaultApiConfig", () => ({ defaultAPIConfig: () => ({}) }));
vi.mock("../modals/AudioModelMismatchConfirmModal", () => ({
    showAudioModelMismatchConfirm: vi.fn().mockResolvedValue(true),
}));

let root: Root, host: HTMLDivElement;
let current: ReturnType<typeof useTonieCardSaveFlow>;
const card = (source = "lib://old.taf") =>
    ({
        ruid: "0123456789abcdef",
        source,
        tonieInfo: { model: "old" },
        sourceInfo: {},
    }) as TonieCardProps;
const profile = (kind: "audio" | "radio" = "audio") => ({
    selectedKind: kind,
    originalKind: "audio",
    drafts: {
        audio: { source: "lib://next.taf" },
        radio: { source: "https://example.org/live", displayName: "Station" },
        podcast: { ...defaultPodcastConfig(), sourceType: "rss" },
        ard: { ...defaultPodcastConfig(), sourceType: "ard_audiothek" },
    },
    dirtyKinds: [kind],
    missingKinds: [],
    revision: 0,
    loading: false,
    recordSaved: vi.fn(),
    recordActivation: vi.fn(),
    reconcile: vi.fn(),
});
const params = (kind: "audio" | "radio" = "audio", supported = true) => {
    const sourceEditor = profile(kind);
    const podcast = {
        initialized: true,
        subscription: undefined,
        editingSubscription: undefined as PodcastSubscription | undefined,
        capabilities: { supported: false },
        reloadSubscription: vi.fn().mockResolvedValue(undefined),
        recordSubscription: vi.fn(),
    };
    const close = vi.fn();
    return {
        sourceEditor,
        profilesSupported: supported,
        podcast,
        tonieCard: card(),
        overlay: "box-1",
        selectedModel: "new",
        resolvedAudioModel: "",
        modelAudioPath: null,
        fetchUpdatedTonieCard: vi.fn().mockImplementation(async () => mocks.getTag()),
        setIsEditModalOpen: close,
        setInputValidationModel: vi.fn(),
        setInputValidationSource: vi.fn(),
        t: (key: string, options?: Record<string, unknown>) =>
            `${key}${options ? JSON.stringify(options) : ""}`,
        addNotification: vi.fn(),
    };
};
function Probe({ value }: { value: ReturnType<typeof params> }) {
    current = useTonieCardSaveFlow(value as unknown as Parameters<typeof useTonieCardSaveFlow>[0]);
    return null;
}
const render = async (value: ReturnType<typeof params>) => {
    await act(async () => root.render(<Probe value={value} />));
};
beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.modelSearch.mockResolvedValue({ json: async () => [{ model: "new" }] });
    mocks.saveProfile.mockResolvedValue({
        revision: 1,
        profiles: { audio: { source: "lib://next.taf" } },
    });
    mocks.profiles.mockResolvedValue({
        revision: 1,
        profiles: { audio: { source: "lib://next.taf" } },
    });
    mocks.getTag.mockResolvedValue(card("lib://next.taf"));
    mocks.post.mockImplementation(async (_ruid: string, body: string) => {
        if (body.startsWith("tonie_model=")) throw new Error("model write failed");
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("Tonie save recovery", () => {
    it("reports confirmed profile and actual source when model assignment fails", async () => {
        const value = params();
        await render(value);
        await act(async () => current.handleSaveChanges());
        expect(value.setIsEditModalOpen).not.toHaveBeenCalledWith(false);
        expect(value.sourceEditor.recordSaved).toHaveBeenCalledWith(
            "audio",
            expect.objectContaining({ revision: 1 }),
        );
        expect(value.sourceEditor.reconcile).toHaveBeenCalledWith(
            expect.objectContaining({ revision: 1 }),
            expect.objectContaining({ source: "lib://next.taf" }),
        );
        expect(current.error).toContain("sources.savedProfiles");
        expect(current.error).toContain("sources.actualSource");
        expect(current.error).toContain("lib://next.taf");
    });
    it("deduplicates Save before model validation finishes", async () => {
        let release!: (response: { json: () => Promise<{ model: string }[]> }) => void;
        mocks.modelSearch.mockImplementation(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        const value = params();
        await render(value);
        let first!: Promise<void>, second!: Promise<void>;
        await act(async () => {
            first = current.handleSaveChanges();
            second = current.handleSaveChanges();
        });
        expect(mocks.modelSearch).toHaveBeenCalledTimes(1);
        expect(mocks.saveProfile).not.toHaveBeenCalled();
        await act(async () => {
            release({ json: async () => [{ model: "new" }] });
            await Promise.all([first, second]);
        });
        expect(mocks.saveProfile).toHaveBeenCalledTimes(1);
    });
    it("reports legacy actual radio without a source-profile readback", async () => {
        const value = params("radio", false);
        mocks.getTag.mockResolvedValue(card("https://example.org/live"));
        await render(value);
        await act(async () => current.handleSaveChanges());
        expect(mocks.profiles).not.toHaveBeenCalled();
        expect(value.sourceEditor.recordActivation).toHaveBeenCalledWith("radio");
        expect(current.error).toContain("sources.actualSource");
        expect(current.error).not.toContain("sources.readbackFailed");
    });
    it("uses the editor's revision through polling and retries only after explicit readback", async () => {
        const value = params();
        Object.assign(value.sourceEditor, { selectedKind: "podcast", originalKind: "podcast", dirtyKinds: ["podcast"] });
        value.sourceEditor.drafts.podcast.feedUrl = "https://example.org/feed";
        value.selectedModel = "old";
        const old = {
            ...value.sourceEditor.drafts.podcast, id: "a".repeat(32), revision: 4,
            ruid: card().ruid, overlay: "box-1", state: "ready", episodes: [], ownsAssignment: true,
        } as PodcastSubscription;
        value.podcast.editingSubscription = old;
        Object.assign(value.podcast, { subscription: { ...old, revision: 5 } });
        value.podcast.capabilities = { supported: true };
        value.podcast.reloadSubscription.mockImplementation(async () => {
            value.podcast.editingSubscription = { ...old, revision: 5 };
            return value.podcast.editingSubscription;
        });
        mocks.podcastSave.mockRejectedValueOnce(new Error("409 conflict"));
        mocks.podcastSave.mockResolvedValueOnce({ subscription: { ...old, revision: 6 } });
        await render(value);
        await act(async () => current.handleSaveChanges());
        expect(mocks.podcastSave.mock.calls[0][3].revision).toBe(4);
        expect(value.podcast.reloadSubscription).toHaveBeenCalledOnce();
        expect(value.setIsEditModalOpen).not.toHaveBeenCalledWith(false);
        await render(value);
        await act(async () => current.handleSaveChanges());
        expect(mocks.podcastSave.mock.calls[1][3].revision).toBe(5);
        expect(value.setIsEditModalOpen).toHaveBeenCalledWith(false);
    });
});
