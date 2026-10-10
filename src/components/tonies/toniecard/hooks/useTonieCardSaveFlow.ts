import { useRef, useState } from "react";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { TeddyCloudApi } from "../../../../api";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { TonieCardProps } from "../../../../types/tonieTypes";
import { toModelKey } from "../../hooks/useCustomModelKeys";
import { showAudioModelMismatchConfirm } from "../modals/AudioModelMismatchConfirmModal";
import { ValidationState } from "../TonieCardTypes";
import { useAudioSourceEditor } from "../sources/useAudioSourceEditor";
import { usePodcastSubscription } from "../podcasts/usePodcastSubscription";
import { profilesToPersist, saveAudioSource, SourceSaveError } from "../sources/saveAudioSource";
import { activeSourceKind } from "../sources/sourceProfiles";
import { AudioSourceKind } from "../../../../types/audioSourceTypes";

const api = new TeddyCloudApi(defaultAPIConfig());

type Params = {
    sourceEditor: ReturnType<typeof useAudioSourceEditor>;
    profilesSupported: boolean;
    podcast: ReturnType<typeof usePodcastSubscription>;
    tonieCard: TonieCardProps;
    overlay: string;
    selectedModel: string;
    resolvedAudioModel: string;
    modelAudioPath: string | null;
    fetchUpdatedTonieCard: () => Promise<TonieCardProps | undefined>;
    setIsEditModalOpen: (open: boolean) => void;
    setInputValidationModel: (value: ValidationState) => void;
    setInputValidationSource: (value: ValidationState) => void;
    t: (key: string, options?: Record<string, unknown>) => string;
    addNotification: (
        type: NotificationTypeEnum,
        title: string,
        description: string,
        context?: string,
    ) => void;
};

const validateSelectedModelExists = async (modelValue: string, overlay: string) => {
    const trimmed = modelValue.trim();
    if (!trimmed) return true;
    try {
        const response = await api.apiGetTeddyCloudApiRaw(
            `/api/toniesJsonSearch?searchModel=${encodeURIComponent(trimmed)}&searchSeries=&searchEpisode=`,
            overlay,
        );
        const entries = await response.json();
        return (
            Array.isArray(entries) &&
            entries.some(
                (entry: { model?: string }) => toModelKey(entry?.model) === toModelKey(trimmed),
            )
        );
    } catch {
        return false;
    }
};

export const useTonieCardSaveFlow = ({
    sourceEditor,
    profilesSupported,
    podcast,
    tonieCard,
    overlay,
    selectedModel,
    resolvedAudioModel,
    modelAudioPath,
    fetchUpdatedTonieCard,
    setIsEditModalOpen,
    setInputValidationModel,
    setInputValidationSource,
    t,
    addNotification,
}: Params) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const saving = useRef(false);

    const handleModelSave = async () => {
        try {
            await api.apiPostTeddyCloudContentJson(
                tonieCard.ruid,
                "tonie_model=" + encodeURIComponent(selectedModel),
                overlay,
            );
            setInputValidationModel({ validateStatus: "", help: "" });
        } catch (cause) {
            setInputValidationModel({ validateStatus: "error", help: String(cause) });
            throw cause;
        }
    };

    const handleSaveChanges = async () => {
        if (saving.current || sourceEditor.loading || !podcast.initialized) return;
        saving.current = true;
        setBusy(true);
        setError("");
        const targetKind = sourceEditor.selectedKind;
        let completedProfiles: AudioSourceKind[] = [];
        let sourceCommitted = false;
        try {
            const needsModelSave = (tonieCard.tonieInfo.model || "") !== selectedModel;
            const targetSource =
                targetKind === "radio"
                    ? sourceEditor.drafts.radio.source
                    : targetKind === "audio"
                      ? sourceEditor.drafts.audio.source
                      : tonieCard.source || "";
            if (needsModelSave && !(await validateSelectedModelExists(selectedModel, overlay))) {
                setInputValidationModel({
                    validateStatus: "error",
                    help: t("tonies.editModal.invalidModelError", { model: selectedModel.trim() }),
                });
                return;
            }
            if (
                needsModelSave &&
                !selectedModel.trim() &&
                targetSource.trim() &&
                (resolvedAudioModel || tonieCard.sourceInfo?.model || "").trim()
            ) {
                const confirmed = await showAudioModelMismatchConfirm(
                    t,
                    (resolvedAudioModel || tonieCard.sourceInfo?.model || "").trim(),
                );
                if (!confirmed) return;
            }

            const dirtyKinds = profilesToPersist(
                sourceEditor.dirtyKinds,
                sourceEditor.missingKinds,
                sourceEditor.originalKind,
                targetKind,
            );

            completedProfiles = await saveAudioSource(
                {
                    ruid: tonieCard.ruid,
                    overlay,
                    currentKind: sourceEditor.originalKind,
                    selectedKind: targetKind,
                    currentSource: tonieCard.source || "",
                    drafts: sourceEditor.drafts,
                    dirtyKinds,
                    profileRevision: sourceEditor.revision,
                    profilesSupported,
                    subscription: podcast.editingSubscription,
                    podcastCapabilities: podcast.capabilities,
                },
                {
                    saveProfile: (kind, revision, profile) =>
                        api.saveSourceProfile(tonieCard.ruid, overlay, kind, revision, profile),
                    savePodcast: async (config, subscription) =>
                        (await api.podcastSave(tonieCard.ruid, overlay, config, subscription))
                            .subscription,
                    detachPodcast: async (subscription) => {
                        await api.podcastDetach(subscription, overlay);
                    },
                    assignDirectSource: async (source, live) => {
                        await api.apiPostTeddyCloudContentJson(
                            tonieCard.ruid,
                            `source=${encodeURIComponent(source)}&nocloud=true&live=${live}`,
                            overlay,
                        );
                        setInputValidationSource({ validateStatus: "", help: "" });
                    },
                    recordProfile: sourceEditor.recordSaved,
                    recordSubscription: podcast.recordSubscription,
                    recordActivation: sourceEditor.recordActivation,
                },
            );
            sourceCommitted = true;
            // A model-audio selection also needs an explicit model assignment.
            if (selectedModel && modelAudioPath && targetSource === modelAudioPath) {
                await handleModelSave();
            } else if (needsModelSave) {
                await handleModelSave();
            }
            setIsEditModalOpen(false);
            await fetchUpdatedTonieCard();
        } catch (cause) {
            // Each operation has already committed independently. Read back the
            // server truth but retain all local drafts and the selected target.
            const [subscriptionResult, cardResult, profilesResult] = await Promise.allSettled([
                podcast.reloadSubscription(),
                fetchUpdatedTonieCard(),
                profilesSupported
                    ? api.sourceProfiles(tonieCard.ruid, overlay)
                    : Promise.resolve(undefined),
            ]);
            const confirmed =
                cause instanceof SourceSaveError ? cause.savedProfiles : completedProfiles;
            const names = confirmed
                .map((kind: AudioSourceKind) =>
                    t(kind === "podcast" ? "podcasts.title" : `sources.${kind}`),
                )
                .join(", ");
            const reason =
                cause instanceof SourceSaveError && cause.reason
                    ? t(`sources.${cause.reason}`)
                    : cause instanceof SourceSaveError
                      ? cause.message
                      : String(cause);
            let detail = `${t("sources.saveFailed")} ${cause instanceof SourceSaveError ? t(`sources.stage${cause.stage[0].toUpperCase()}${cause.stage.slice(1)}`) : t("sources.stageModel")}: ${reason}. ${t("sources.savedProfiles", { names: names || "—" })}`;
            if (
                cardResult.status === "fulfilled" &&
                cardResult.value &&
                subscriptionResult.status === "fulfilled" &&
                (!profilesSupported ||
                    (profilesResult.status === "fulfilled" && profilesResult.value))
            ) {
                const assignment = {
                    source: cardResult.value.source || "",
                    subscription: subscriptionResult.value,
                };
                if (
                    profilesSupported &&
                    profilesResult.status === "fulfilled" &&
                    profilesResult.value
                )
                    sourceEditor.reconcile(profilesResult.value, assignment);
                const profiles =
                    profilesResult.status === "fulfilled"
                        ? profilesResult.value?.profiles
                        : undefined;
                let active = activeSourceKind(assignment, profiles);
                if (
                    !profilesSupported &&
                    sourceCommitted &&
                    (targetKind === "audio" || targetKind === "radio") &&
                    assignment.source === sourceEditor.drafts[targetKind].source
                )
                    active = targetKind;
                if (!profilesSupported) sourceEditor.recordActivation(active);
                const label = t(active === "podcast" ? "podcasts.title" : `sources.${active}`);
                const value =
                    active === "podcast" || active === "ard"
                        ? subscriptionResult.value?.displayName ||
                          subscriptionResult.value?.ardShowUrl ||
                          subscriptionResult.value?.feedUrl ||
                          assignment.source
                        : assignment.source;
                detail += ` ${t("sources.actualSource", { kind: label, value: value || "—" })}`;
            } else {
                detail += ` ${t("sources.readbackFailed")}`;
            }
            setError(detail);
            addNotification(
                NotificationTypeEnum.Error,
                t("tonies.messages.setTonieToSourceFailed"),
                detail,
                t("tonies.title"),
            );
        } finally {
            saving.current = false;
            setBusy(false);
        }
    };
    return { handleSaveChanges, busy, error };
};
