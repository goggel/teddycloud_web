// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useTonieCardSaveFlow } from "../hooks/useTonieCardSaveFlow";
import { TonieCardProps } from "../../../../types/tonieTypes";
const mocks = vi.hoisted(() => ({ source: vi.fn(), get: vi.fn() }));
vi.mock("../../../../api", () => ({
    TeddyCloudApi: class {
        apiPostTeddyCloudContentJson = mocks.source;
        apiGetTeddyCloudApiRaw = mocks.get;
    },
}));
vi.mock("../../../../config/defaultApiConfig", () => ({ defaultAPIConfig: () => ({}) }));
vi.mock("../modals/AudioModelMismatchConfirmModal", () => ({
    showAudioModelMismatchConfirm: vi.fn().mockResolvedValue(true),
}));
function flow(podcast?: { dirty: boolean; skipSourceSave: boolean; save: () => Promise<void> }) {
    const props = {
        tonieCard: {
            ruid: "0123456789abcdef",
            source: "old.taf",
            live: false,
            nocloud: true,
            tonieInfo: { model: "" },
            sourceInfo: {},
        } as TonieCardProps,
        overlay: "box-1",
        modelTitle: "",
        selectedModel: "",
        selectedSource: "new.taf",
        resolvedAudioModel: "",
        modelAudioPath: null,
        fetchUpdatedTonieCard: vi.fn().mockResolvedValue(undefined),
        setIsEditModalOpen: vi.fn(),
        setInputValidationModel: vi.fn(),
        setInputValidationSource: vi.fn(),
        t: (s: string) => s,
        addNotification: vi.fn(),
        handleNoCloudClick: vi.fn(),
        handleLiveClick: vi.fn(),
        podcast,
    };
    return { ...useTonieCardSaveFlow(props), props };
}
describe("podcast editor save integration", () => {
    it("saves the subscription without writing a stale audio source", async () => {
        mocks.source.mockClear();
        const save = vi.fn().mockResolvedValue(undefined);
        const current = flow({ dirty: true, skipSourceSave: true, save });
        await current.handleSaveChanges();
        expect(save).toHaveBeenCalledOnce();
        expect(mocks.source).not.toHaveBeenCalled();
        expect(current.props.setIsEditModalOpen).toHaveBeenCalledWith(false);
    });
    it("keeps the editor open when subscription save fails", async () => {
        const current = flow({
            dirty: true,
            skipSourceSave: true,
            save: vi.fn().mockRejectedValue(new Error("conflict")),
        });
        await current.handleSaveChanges();
        expect(current.props.setIsEditModalOpen).not.toHaveBeenCalled();
    });
    it("retains normal source editing", async () => {
        mocks.source.mockReset().mockResolvedValue(undefined);
        const current = flow();
        await current.handleSaveChanges();
        expect(mocks.source).toHaveBeenCalledWith("0123456789abcdef", "source=new.taf", "box-1");
    });
});
