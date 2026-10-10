import { usePodcastSubscription } from "./podcasts/usePodcastSubscription";
import { PodcastSubscriptionEditor } from "./podcasts/PodcastSubscriptionEditor";
import { useAudioSourceEditor } from "./sources/useAudioSourceEditor";
import { RadioSourceEditor } from "./sources/RadioSourceEditor";
import { validDirectSource } from "./sources/saveAudioSource";
import { rssSourceKey, sourceToken, validPodcastConfig } from "./podcasts/podcastValidation";
import { AudioSourceKind } from "../../../types/audioSourceTypes";
import { PodcastDraft } from "../../../types/podcastTypes";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Checkbox, Tooltip, Typography, theme } from "antd";
import {
    CloudSyncOutlined,
    DownloadOutlined,
    EditOutlined,
    InfoCircleOutlined,
    PlayCircleOutlined,
    RetweetOutlined,
    StopOutlined,
} from "@ant-design/icons";

import { TonieCardProps } from "../../../types/tonieTypes";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import { TeddyCloudApi } from "../../../api";

import TonieInformationModal from "../common/modals/TonieInformationModal";
import { toLanguageCode, LanguageFlagIcon } from "../../common/icons/LanguageFlagIcon";
import { useTeddyCloud } from "../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../types/teddyCloudNotificationTypes";
import { EditTonieModal } from "./modals/EditTonieModal";
import { SelectAudioModal } from "../common/modals/SelectAudioModal";
import { useAudioContext } from "../../../provider/AudioProvider";
import { CustomModelEditor } from "../custommodel/CustomModelEditor";
import { toModelKey, useCustomModelKeys } from "../hooks/useCustomModelKeys";
import { toImageSrc } from "../common/utils/imagePathUtils";
import { useTonieCardActions } from "./hooks/useTonieCardActions";
import { useResolvedModelAudio } from "./hooks/useResolvedModelAudio";
import { useTooltipInfoByModel } from "./hooks/useTooltipInfoByModel";
import { getInfoForTooltip } from "./utils/tooltipInfo";
import { useTonieCardSaveFlow } from "./hooks/useTonieCardSaveFlow";
import { TooltipInfo, ValidateStatus } from "./TonieCardTypes";
import { backendUrl } from "../../../utils/basePath";

const api = new TeddyCloudApi(defaultAPIConfig());

const { Meta } = Card;
const { Text } = Typography;
const { useToken } = theme;

export const TonieCard: React.FC<{
    tonieCard: TonieCardProps;
    lastRUIDs: Array<[string, string, string]>;
    overlay: string;
    readOnly: boolean;
    defaultLanguage?: string;
    showSourceInfo?: boolean;
    onHide: (ruid: string) => void;
    onUpdate: (updatedTonieCard: TonieCardProps) => void;
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect: (ruid: string) => void;
}> = ({
    tonieCard,
    lastRUIDs,
    overlay,
    readOnly,
    defaultLanguage = "",
    showSourceInfo = true,
    onHide,
    onUpdate,
    selectionMode = false,
    selected = false,
    onToggleSelect,
}) => {
    const { t } = useTranslation();
    const { token } = useToken();
    const {
        addNotification,
        addLoadingNotification,
        closeLoadingNotification,
        toniesCloudAvailable,
    } = useTeddyCloud();
    const { playAudio } = useAudioContext();

    const [isCreateModelModalOpen, setIsCreateModelModalOpen] = useState(false);
    const [isEditModelModalOpen, setIsEditModelModalOpen] = useState(false);

    // ------------------------
    // UI / Modal State
    // ------------------------

    const [keyRadioStreamSearch, setKeyRadioStreamSearch] = useState(0);
    const [keyTonieArticleSearch, setKeyTonieArticleSearch] = useState(0);
    const [keySelectFileFileBrowser, setKeySelectFileFileBrowser] = useState(0);

    const [isInformationModalOpen, setInformationModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const podcast = usePodcastSubscription(isEditModalOpen, tonieCard.ruid, overlay);
    const [profilesSupported, setProfilesSupported] = useState(false);
    const sourceEditor = useAudioSourceEditor(
        isEditModalOpen && podcast.initialized,
        tonieCard.ruid,
        overlay,
        { source: tonieCard.source || "", subscription: podcast.subscription },
        async (signal) => {
            const capabilities = await api.sourceProfilesCapabilities(signal);
            setProfilesSupported(capabilities.supported);
            return capabilities.supported
                ? api.sourceProfiles(tonieCard.ruid, overlay, signal)
                : { revision: 0, profiles: {} };
        },
    );
    const [isSelectFileModalOpen, setSelectFileModalOpen] = useState(false);
    const [selectedModelDisplayText, setSelectedModelDisplayText] = useState<string>("");

    // ------------------------
    // Form / Input State
    // ------------------------

    const [selectedModel, setSelectedModel] = useState<string>(tonieCard.tonieInfo.model || "");
    const [selectedSource, setSelectedSource] = useState<string>(tonieCard.source || "");
    const [tempSelectedSource, setTempSelectedSource] = useState<string>(tonieCard.source || "");

    const customModelKeys = useCustomModelKeys(isEditModalOpen);
    const isSelectedModelCustom = customModelKeys.has(toModelKey(selectedModel));

    useEffect(() => {
        if (isEditModalOpen) return;
        const model = tonieCard.tonieInfo.model || "";
        setSelectedModel(model);
        if (model && tonieCard.tonieInfo.series) {
            const episode = tonieCard.tonieInfo.episode || "";
            setSelectedModelDisplayText(
                `[${model}] ${tonieCard.tonieInfo.series}${episode ? ` - ${episode}` : ""}`,
            );
        } else {
            setSelectedModelDisplayText("");
        }
    }, [
        tonieCard.tonieInfo.model,
        tonieCard.tonieInfo.series,
        tonieCard.tonieInfo.episode,
        isEditModalOpen,
    ]);

    useEffect(() => {
        if (isEditModalOpen) return;
        setSelectedSource(tonieCard.source || "");
        setTempSelectedSource(tonieCard.source || "");
    }, [tonieCard.source, isEditModalOpen]);

    useEffect(() => {
        if (!isEditModalOpen) return;
        const source =
            sourceEditor.selectedKind === "audio"
                ? sourceEditor.drafts.audio.source
                : sourceEditor.selectedKind === "radio"
                  ? sourceEditor.drafts.radio.source
                  : tonieCard.source || "";
        setSelectedSource(source);
        setTempSelectedSource(source);
    }, [
        isEditModalOpen,
        sourceEditor.selectedKind,
        sourceEditor.drafts.audio.source,
        sourceEditor.drafts.radio.source,
        tonieCard.source,
    ]);

    const [inputValidationModel, setInputValidationModel] = useState<{
        validateStatus: ValidateStatus;
        help: string;
    }>({
        validateStatus: "",
        help: "",
    });

    const [inputValidationSource, setInputValidationSource] = useState<{
        validateStatus: ValidateStatus;
        help: string;
    }>({
        validateStatus: "",
        help: "",
    });

    // ------------------------
    // Derived data
    // ------------------------

    const modelTitle =
        `${tonieCard.tonieInfo.series}` +
        (tonieCard.tonieInfo.episode ? ` - ${tonieCard.tonieInfo.episode}` : "");

    const sourceTitle =
        "sourceInfo" in tonieCard
            ? `${tonieCard.sourceInfo.series}` +
              (tonieCard.sourceInfo.episode ? ` - ${tonieCard.sourceInfo.episode}` : "")
            : "";

    const showSourceInfoPicture =
        showSourceInfo &&
        "sourceInfo" in tonieCard &&
        ((tonieCard.sourceInfo.picture !== tonieCard.tonieInfo.picture &&
            modelTitle !== sourceTitle) ||
            (tonieCard.sourceInfo.picture === tonieCard.tonieInfo.picture &&
                modelTitle !== sourceTitle));

    const toniePlayedOn = lastRUIDs
        .filter(([ruid]) => ruid === tonieCard.ruid)
        .map(([, ruidTime, boxName]) => ({ ruidTime, boxName }));

    const picture =
        tonieCard.tonieInfo.picture && tonieCard.tonieInfo.picture.trim() !== ""
            ? tonieCard.tonieInfo.picture
            : "/img_unknown.png";
    const pictureLooksUnknown = picture.endsWith("img_unknown.png");

    const selectedKind = sourceEditor.selectedKind;
    const selectedPodcastDraft =
        selectedKind === "ard" ? sourceEditor.drafts.ard : sourceEditor.drafts.podcast;
    const selectedPodcastSourceKey =
        selectedKind === "ard"
            ? selectedPodcastDraft.sourceKey ||
              (podcast.resolvedSource.token === sourceToken(selectedPodcastDraft)
                  ? podcast.resolvedSource.key
                  : "")
            : rssSourceKey(selectedPodcastDraft.feedUrl);
    const selectedPodcastSourceMismatch =
        selectedPodcastDraft.episodeTrims.length > 0 &&
        (!selectedPodcastSourceKey ||
            selectedPodcastDraft.episodeTrimSourceKey !== selectedPodcastSourceKey);
    const podcastValid = validPodcastConfig(selectedPodcastDraft) && !selectedPodcastSourceMismatch;
    const selectedSourceValid =
        (selectedKind === "audio" &&
            validDirectSource("audio", sourceEditor.drafts.audio.source)) ||
        (selectedKind === "radio" &&
            validDirectSource("radio", sourceEditor.drafts.radio.source)) ||
        ((selectedKind === "podcast" || selectedKind === "ard") &&
            podcast.supported &&
            podcastValid &&
            (selectedKind === "podcast" ||
                podcast.capabilities.sourceTypes?.includes("ard_audiothek")));
    const hasPendingChanges =
        sourceEditor.dirtyKinds.length > 0 ||
        sourceEditor.selectionChanged ||
        selectedModel !== (tonieCard.tonieInfo.model || "");

    const setSelectedPodcastDraft: React.Dispatch<React.SetStateAction<PodcastDraft>> = (
        update,
    ) => {
        const kind = sourceEditor.selectedKind;
        if (kind !== "podcast" && kind !== "ard") return;
        if (kind === "podcast")
            sourceEditor.updateProfile("podcast", (current) => ({
                ...(typeof update === "function" ? update(current) : update),
                sourceType: "rss",
            }));
        else
            sourceEditor.updateProfile("ard", (current) => ({
                ...(typeof update === "function" ? update(current) : update),
                sourceType: "ard_audiothek",
            }));
    };
    const podcastEditorState = {
        ...podcast,
        draft: selectedPodcastDraft,
        setDraft: setSelectedPodcastDraft,
        sourceKey: selectedPodcastSourceKey,
        sourceMismatch: selectedPodcastSourceMismatch,
        valid: podcastValid,
        dirty: sourceEditor.dirtyKinds.includes(selectedKind),
        subscription:
            podcast.subscription?.ownsAssignment &&
            (selectedKind === "ard") === (podcast.subscription.sourceType === "ard_audiothek")
                ? podcast.subscription
                : undefined,
    };

    // ------------------------
    // API helper
    // ------------------------

    const fetchUpdatedTonieCard = async () => {
        try {
            const updatedTonieCard = await api.apiGetTagInfo(tonieCard.ruid, overlay);
            onUpdate(updatedTonieCard);
            return updatedTonieCard;
        } catch (error) {
            addNotification(
                NotificationTypeEnum.Error,
                t("tonies.messages.errorFetchingUpdatedCard"),
                t("tonies.messages.errorFetchingUpdatedCardDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', "") + error,
                t("tonies.title"),
            );
        }
    };

    const { modelAudioPath, modelAudioHasMapping, resolvedAudioModel } = useResolvedModelAudio({
        isEditModalOpen,
        selectedModel,
        selectedSource,
        overlay,
    });

    const { tooltipInfoByModel } = useTooltipInfoByModel({
        isEditModalOpen,
        selectedModel,
        resolvedAudioModel,
        overlay,
    });

    const { handleLiveClick, handleNoCloudClick, handleBackgroundDownload } = useTonieCardActions({
        tonieCard,
        overlay,
        modelTitle,
        t,
        addNotification,
        addLoadingNotification,
        closeLoadingNotification,
        fetchUpdatedTonieCard: async () => {
            await fetchUpdatedTonieCard();
        },
    });

    // ------------------------
    // Handlers – playback
    // ------------------------

    const handlePlayPauseClick = (url: string) => {
        playAudio(
            url,
            showSourceInfoPicture ? tonieCard.sourceInfo : tonieCard.tonieInfo,
            tonieCard,
        );
    };

    const {
        handleSaveChanges,
        busy: saveBusy,
        error: saveError,
    } = useTonieCardSaveFlow({
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
    });

    // ------------------------
    // Handlers – File selection
    // ------------------------

    const handleCancelSelectFile = () => {
        setTempSelectedSource(selectedSource);
        setSelectFileModalOpen(false);
    };

    const handleFileSelected = (result: { path: string }) => {
        sourceEditor.updateProfile("audio", { source: result.path });
        setSelectedSource(result.path);
        setTempSelectedSource(result.path);
        setSelectFileModalOpen(false);
    };

    const showFileSelectModal = () => {
        setKeySelectFileFileBrowser((prev) => prev + 1);
        setSelectFileModalOpen(true);
    };

    // ------------------------
    // Handlers – Search
    // ------------------------

    const searchModelResultChanged = (_newValue: string) => {
        // Model search is now decoupled from the model value input.
    };

    // ------------------------
    // Handlers – Modals
    // ------------------------

    const showModelModal = () => {
        const model = tonieCard.tonieInfo.model || "";
        setSelectedModel(model);
        setSelectedSource(tonieCard.source || "");
        setTempSelectedSource(tonieCard.source || "");
        if (model && tonieCard.tonieInfo.series) {
            const episode = tonieCard.tonieInfo.episode || "";
            setSelectedModelDisplayText(
                `[${model}] ${tonieCard.tonieInfo.series}${episode ? ` - ${episode}` : ""}`,
            );
        } else {
            setSelectedModelDisplayText("");
        }
        setKeyRadioStreamSearch((prev) => prev + 1);
        setKeyTonieArticleSearch((prev) => prev + 1);
        setIsEditModalOpen(true);
    };

    const modelInfoFromTonie = selectedModel as unknown as TooltipInfo;
    const audioInfoFromSource = selectedSource as unknown as TooltipInfo;
    const renderInfoTooltip = (
        kind: "model" | "audio",
        modelName: string,
        includeAudioPath: boolean,
        overrideAudioPath?: string,
    ) => {
        const info = getInfoForTooltip({
            kind,
            modelName,
            tooltipInfoByModel,
            modelInfoFromTonie,
            audioInfoFromSource,
        });
        const headingKey =
            kind === "audio"
                ? "tonies.editModal.audioInfoHeading"
                : "tonies.editModal.modelInfoHeading";
        const headingDefault = kind === "audio" ? "Audio Info" : "Model Info";
        const audioPath = (overrideAudioPath || selectedSource || tonieCard.source || "").trim();
        const rows = [
            {
                label: t("tonies.editModal.modelInfoSeries", { defaultValue: "Series" }),
                value: info?.series,
            },
            {
                label: t("tonies.editModal.modelInfoEpisode", { defaultValue: "Episode" }),
                value: info?.episode,
            },
            { label: t("tonies.editModal.modelInfoNo", { defaultValue: "No" }), value: info?.no },
            {
                label: t("tonies.editModal.modelInfoTitle", { defaultValue: "Title" }),
                value: info?.title,
            },
            {
                label: t("tonies.editModal.modelInfoRelease", { defaultValue: "Release" }),
                value: info?.release,
            },
            {
                label: t("tonies.editModal.modelInfoLanguage", { defaultValue: "Language" }),
                value: info?.language,
            },
            {
                label: t("tonies.editModal.modelInfoCategory", { defaultValue: "Category" }),
                value: info?.category,
            },
            ...(includeAudioPath
                ? [
                      {
                          label: t("tonies.editModal.modelInfoAudioPath", {
                              defaultValue: "Audio Path",
                          }),
                          value: audioPath,
                      },
                  ]
                : []),
        ].filter((r) => Boolean(String(r.value || "").trim()));
        return (
            <div style={{ maxWidth: 420 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {t(headingKey, { defaultValue: headingDefault })}
                </div>
                <div style={{ marginBottom: 4 }}>
                    <strong>
                        {t("tonies.editModal.modelInfoModel", { defaultValue: "Model" })}:
                    </strong>{" "}
                    {modelName || t("tonies.unsetTonie")}
                </div>
                {rows.length === 0 ? (
                    <span>{t("tonies.informationModal.unknownModel")}</span>
                ) : (
                    rows.map((r) => (
                        <div key={r.label}>
                            <strong>{r.label}:</strong> {r.value}
                        </div>
                    ))
                )}
            </div>
        );
    };

    const currentAudioModelForSet = (selectedSource || "").trim() ? resolvedAudioModel : "";
    const currentModelForTooltip = (selectedModel || "").trim();

    const editModalTitle = (
        <>
            <h3>
                {t("tonies.editModal.title")}
                {tonieCard.tonieInfo.model ? " (" + tonieCard.tonieInfo.model + ")" : ""}
            </h3>
            {tonieCard.tonieInfo.series ? <Text type="secondary">{modelTitle}</Text> : " "}
        </>
    );

    // ------------------------
    // Card actions
    // ------------------------

    const infoAction = (
        <InfoCircleOutlined
            key="info"
            onClick={() => {
                setInformationModalOpen(true);
            }}
        />
    );

    const playAction =
        tonieCard.valid || (tonieCard.source || "").startsWith("http") ? (
            <PlayCircleOutlined
                key="playpause"
                onClick={() =>
                    handlePlayPauseClick(
                        tonieCard.valid ? backendUrl(tonieCard.audioUrl) : tonieCard.source,
                    )
                }
            />
        ) : tonieCard.downloadTriggerUrl && tonieCard.downloadTriggerUrl.length > 0 && !readOnly ? (
            !toniesCloudAvailable ? (
                <Tooltip title={t("tonies.connectionToBoxineNotAvailable")}>
                    <div style={{ position: "relative", display: "inline-block" }}>
                        <StopOutlined
                            style={{
                                position: "absolute",
                                top: 4,
                                left: 0,
                                color: token.colorError,
                            }}
                        />
                        <DownloadOutlined />
                    </div>
                </Tooltip>
            ) : (
                <DownloadOutlined key="download" onClick={handleBackgroundDownload} />
            )
        ) : (
            <Tooltip placement="top" title={t("tonies.noPlayableContentHint")}>
                <PlayCircleOutlined
                    key="playpause"
                    style={{ cursor: "default", color: token.colorTextDisabled }}
                />
            </Tooltip>
        );

    const cloudAction = (
        <CloudSyncOutlined
            key="nocloud"
            className={tonieCard.nocloud ? "no-cloud" : "cloud"}
            style={
                readOnly
                    ? {
                          cursor: "default",
                          color: tonieCard.nocloud ? token.colorError : token.colorTextDisabled,
                      }
                    : {
                          color: tonieCard.nocloud ? token.colorError : token.colorTextDescription,
                      }
            }
            onClick={readOnly ? undefined : handleNoCloudClick}
        />
    );

    const liveAction = (
        <RetweetOutlined
            key="live"
            className={tonieCard.live ? "live" : "not-live"}
            style={
                readOnly
                    ? {
                          cursor: "default",
                          color: tonieCard.live ? token.colorError : token.colorTextDisabled,
                      }
                    : { color: tonieCard.live ? token.colorError : token.colorTextDescription }
            }
            onClick={readOnly ? undefined : handleLiveClick}
        />
    );

    const languageCode = toLanguageCode(tonieCard.tonieInfo.language);
    const defaultLanguageCode = toLanguageCode(defaultLanguage);
    const languageTooltipKey = languageCode;
    const actions = readOnly
        ? [infoAction, playAction, cloudAction, liveAction]
        : [
              infoAction,
              <EditOutlined key="edit" onClick={showModelModal} />,
              playAction,
              cloudAction,
              liveAction,
          ];

    // ------------------------
    // Render
    // ------------------------

    return (
        <>
            <Card
                hoverable={false}
                key={tonieCard.ruid}
                size="small"
                style={{
                    background: selected ? token.colorBgTextHover : token.colorBgContainerDisabled,
                    borderTop:
                        toniePlayedOn && toniePlayedOn.length > 0 ? "3px #1677ff inset" : "reset",
                    paddingTop: toniePlayedOn && toniePlayedOn.length > 0 ? "unset" : 2,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                }}
                title={
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {tonieCard.tonieInfo.series
                                ? tonieCard.tonieInfo.series
                                : tonieCard.tonieInfo.model
                                  ? tonieCard.tonieInfo.model
                                  : t("tonies.unsetTonie")}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            {languageCode && languageCode !== defaultLanguageCode ? (
                                <Tooltip
                                    placement="top"
                                    zIndex={2}
                                    title={t("languageUtil." + languageTooltipKey)}
                                >
                                    <Text style={{ height: 20, width: "auto" }}>
                                        <LanguageFlagIcon
                                            name={languageCode.split("-")[1].toUpperCase()}
                                            height={20}
                                        />
                                    </Text>
                                </Tooltip>
                            ) : null}
                            {readOnly ? null : selectionMode ? (
                                <Checkbox
                                    checked={selected}
                                    onChange={() =>
                                        onToggleSelect && onToggleSelect(tonieCard.ruid)
                                    }
                                />
                            ) : null}
                        </div>
                    </div>
                }
                cover={
                    <div style={{ position: "relative" }}>
                        <img
                            alt={`${tonieCard.tonieInfo.series} - ${tonieCard.tonieInfo.episode}`}
                            src={toImageSrc(picture)}
                            style={
                                pictureLooksUnknown
                                    ? { padding: 8, paddingTop: 10, width: "100%" }
                                    : { padding: 8, width: "100%" }
                            }
                        />
                        {showSourceInfoPicture ? (
                            <Tooltip
                                title={
                                    `${sourceTitle}`
                                        ? t("tonies.alternativeSource", {
                                              originalTonie: '"' + modelTitle + '"',
                                              assignedContent: '"' + sourceTitle + '"',
                                          }).replace(' "" ', " ")
                                        : t("tonies.alternativeSourceUnknown", {
                                              originalTonie: '"' + modelTitle + '"',
                                          }).replace(' "" ', " ")
                                }
                                placement="bottom"
                            >
                                <img
                                    src={toImageSrc(tonieCard.sourceInfo.picture)}
                                    alt=""
                                    style={{
                                        bottom: 0,
                                        padding: 8,
                                        position: "absolute",
                                        right: 20,
                                        height: "50%",
                                        width: "auto",
                                    }}
                                />
                            </Tooltip>
                        ) : null}
                    </div>
                }
                actions={actions}
            >
                <Meta
                    title={tonieCard.tonieInfo.episode || tonieCard.uid}
                    description={tonieCard.tonieInfo.episode ? tonieCard.uid : undefined}
                />
            </Card>

            {isInformationModalOpen && (
                <TonieInformationModal
                    open={isInformationModalOpen}
                    onClose={() => setInformationModalOpen(false)}
                    tonieCardOrTAFRecord={tonieCard}
                    showSourceInfo={showSourceInfo}
                    readOnly={readOnly}
                    lastRUIDs={lastRUIDs}
                    onHide={onHide}
                    overlay={overlay}
                />
            )}

            {isSelectFileModalOpen && (
                <SelectAudioModal
                    open={isSelectFileModalOpen}
                    onClose={handleCancelSelectFile}
                    onSelect={handleFileSelected}
                    keySelectFileFileBrowser={keySelectFileFileBrowser}
                    initialPath={tempSelectedSource || selectedSource}
                />
            )}

            {isEditModalOpen && (
                <EditTonieModal
                    sourceEditor={{
                        kind: selectedKind,
                        setKind: (kind: AudioSourceKind) => sourceEditor.setSelectedKind(kind),
                        podcastSupported: podcast.supported,
                        ardSupported:
                            podcast.supported &&
                            Boolean(podcast.capabilities.sourceTypes?.includes("ard_audiothek")),
                        valid: Boolean(selectedSourceValid) && !sourceEditor.error,
                        loading: !podcast.initialized || sourceEditor.loading,
                        busy: podcast.busy || saveBusy,
                        error:
                            saveError ||
                            sourceEditor.error ||
                            (selectedKind === "podcast" || selectedKind === "ard"
                                ? podcast.error
                                : ""),
                        editor:
                            selectedKind === "radio" ? (
                                <RadioSourceEditor
                                    profile={sourceEditor.drafts.radio}
                                    onChange={(profile) =>
                                        sourceEditor.updateProfile("radio", profile)
                                    }
                                    searchKey={keyRadioStreamSearch}
                                />
                            ) : selectedKind === "podcast" || selectedKind === "ard" ? (
                                <PodcastSubscriptionEditor
                                    state={podcastEditorState}
                                    kind={selectedKind}
                                    disabled={readOnly}
                                    onDetached={async () => {
                                        await fetchUpdatedTonieCard();
                                    }}
                                />
                            ) : null,
                    }}
                    open={isEditModalOpen}
                    title={editModalTitle}
                    onCancel={() => {
                        if (saveBusy) return;
                        sourceEditor.cancel();
                        setIsEditModalOpen(false);
                    }}
                    onSave={handleSaveChanges}
                    selectedSource={sourceEditor.drafts.audio.source}
                    onSelectedSourceChange={(value) => {
                        sourceEditor.updateProfile("audio", { source: value });
                        setSelectedSource(value);
                        setTempSelectedSource(value);
                    }}
                    originalSource={sourceEditor.originalProfiles.audio.source}
                    inputValidationSource={inputValidationSource}
                    setInputValidationSource={setInputValidationSource}
                    selectedModel={selectedModel}
                    onSelectedModelChange={(value) => {
                        setSelectedModel(value);
                        setInputValidationModel({ validateStatus: "", help: "" });
                        if (!value) {
                            setSelectedModelDisplayText("");
                        } else if (value === tonieCard.tonieInfo.model) {
                            const m = tonieCard.tonieInfo.model || "";
                            const s = tonieCard.tonieInfo.series || "";
                            const e = tonieCard.tonieInfo.episode || "";
                            setSelectedModelDisplayText(
                                m && s ? `[${m}] ${s}${e ? ` - ${e}` : ""}` : "",
                            );
                        }
                    }}
                    originalModel={tonieCard.tonieInfo.model || ""}
                    inputValidationModel={inputValidationModel}
                    setInputValidationModel={setInputValidationModel}
                    keyTonieArticleSearch={keyTonieArticleSearch}
                    onSearchModelChange={searchModelResultChanged}
                    hasPendingChanges={hasPendingChanges}
                    onOpenFileSelectModal={showFileSelectModal}
                    modelAudioPath={modelAudioPath}
                    modelAudioHasMapping={modelAudioHasMapping}
                    modelDisplayText={selectedModelDisplayText}
                    onCreateNewModel={() => setIsCreateModelModalOpen(true)}
                    onEditModel={() => setIsEditModelModalOpen(true)}
                    isSelectedModelCustom={isSelectedModelCustom}
                    modelReadOnly={false}
                    onModelSelectResult={(result) => {
                        setSelectedModel(result.value);
                        setSelectedModelDisplayText(result.selectionText);
                    }}
                    modelInfoTooltip={
                        currentModelForTooltip
                            ? renderInfoTooltip(
                                  "model",
                                  currentModelForTooltip,
                                  Boolean(modelAudioPath),
                                  modelAudioPath || undefined,
                              )
                            : undefined
                    }
                    audioInfoTooltip={
                        currentAudioModelForSet
                            ? renderInfoTooltip("audio", currentAudioModelForSet, true)
                            : undefined
                    }
                    audioModelForSet={currentAudioModelForSet}
                    onSetModelFromAudio={() => {
                        const m = currentAudioModelForSet.trim();
                        if (!m) return;
                        setSelectedModel(m);
                        const series = (audioInfoFromSource?.series || "").trim();
                        const episode = (audioInfoFromSource?.episode || "").trim();
                        setSelectedModelDisplayText(
                            series ? `[${m}] ${series}${episode ? ` - ${episode}` : ""}` : `[${m}]`,
                        );
                    }}
                />
            )}

            {isEditModelModalOpen && (
                <CustomModelEditor
                    open={isEditModelModalOpen}
                    onClose={() => setIsEditModelModalOpen(false)}
                    mode="edit-single"
                    initialModel={selectedModel}
                    onUpdated={(model, selectionText) => {
                        setSelectedModel(model);
                        setSelectedModelDisplayText(selectionText || `[${model}]`);
                        setIsEditModelModalOpen(false);
                        setIsEditModalOpen(true);
                    }}
                />
            )}

            {isCreateModelModalOpen && (
                <CustomModelEditor
                    open={isCreateModelModalOpen}
                    onClose={() => setIsCreateModelModalOpen(false)}
                    mode="create-single"
                    onCreated={(model, selectionText) => {
                        setSelectedModel(model);
                        setSelectedModelDisplayText(selectionText || `[${model}]`);
                        setIsCreateModelModalOpen(false);
                        setIsEditModalOpen(true);
                    }}
                />
            )}
        </>
    );
};
