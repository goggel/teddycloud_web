import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Divider,
    Form,
    Input,
    Modal,
    Select,
    Alert,
    theme,
    Tooltip,
    Typography,
    ConfigProvider,
} from "antd";
import {
    CloseOutlined,
    EditOutlined,
    InfoCircleOutlined,
    PlusOutlined,
    RollbackOutlined,
    SaveFilled,
    SwapOutlined,
} from "@ant-design/icons";

import { ToniesJsonSearch } from "../../common/searches/ToniesJsonSearch";
import { toModelKey } from "../../utils/modelKey";
import { AudioSourceKind } from "../../../../types/audioSourceTypes";
import { AudioFileSourceEditor } from "../sources/AudioFileSourceEditor";

const { useToken } = theme;
const { Text } = Typography;

type ValidateStatus = "" | "success" | "warning" | "error" | "validating" | undefined;

interface EditTonieModalProps {
    sourceEditor: {
        kind: AudioSourceKind;
        setKind: (kind: AudioSourceKind) => void;
        podcastSupported: boolean;
        ardSupported: boolean;
        valid: boolean;
        editor: React.ReactNode;
        loading: boolean;
        busy: boolean;
        error: string;
    };
    open: boolean;
    title: React.ReactNode;
    onCancel: () => void;
    onSave: () => void;

    // Source
    selectedSource: string;
    onSelectedSourceChange: (value: string) => void;
    originalSource: string;
    inputValidationSource: {
        validateStatus: ValidateStatus;
        help: string;
    };
    setInputValidationSource: (state: { validateStatus: ValidateStatus; help: string }) => void;

    // Model
    selectedModel: string;
    onSelectedModelChange: (value: string) => void;
    originalModel: string;
    inputValidationModel: {
        validateStatus: ValidateStatus;
        help: string;
    };
    setInputValidationModel: (state: { validateStatus: ValidateStatus; help: string }) => void;
    keyTonieArticleSearch: number;
    onSearchModelChange: (value: string) => void;

    hasPendingChanges: boolean;

    // File selection
    onOpenFileSelectModal: () => void;

    // Set audio from model (when source differs from model and model audio exists in library)
    modelAudioPath?: string | null;
    modelAudioHasMapping?: boolean;

    // Display text for selected model (e.g. "[01-0013] Sample Series - Episode Title")
    modelDisplayText?: string;

    // Create new model
    onCreateNewModel?: () => void;

    // Edit selected model (opens model edit modal on top). Only shown when isSelectedModelCustom is true.
    onEditModel?: () => void;
    isSelectedModelCustom?: boolean;

    /** When true, model is from tonies.json (original) – display only, no edit/remove. Only audio assignment allowed. */
    modelReadOnly?: boolean;

    // Called when user selects a model from search (to update display text)
    onModelSelectResult?: (result: { value: string; selectionText: string }) => void;
    modelInfoTooltip?: React.ReactNode;
    audioInfoTooltip?: React.ReactNode;
    audioModelForSet?: string;
    onSetModelFromAudio?: () => void;
}

export const EditTonieModal: React.FC<EditTonieModalProps> = ({
    open,
    sourceEditor,
    title,
    onCancel,
    onSave,
    selectedSource,
    onSelectedSourceChange,
    originalSource,
    inputValidationSource,
    setInputValidationSource,
    selectedModel,
    onSelectedModelChange,
    originalModel,
    inputValidationModel,
    setInputValidationModel,
    keyTonieArticleSearch,
    onSearchModelChange,
    hasPendingChanges,
    onOpenFileSelectModal,
    modelAudioPath,
    modelAudioHasMapping = false,
    modelDisplayText = "",
    onCreateNewModel,
    onEditModel,
    isSelectedModelCustom = false,
    modelReadOnly = false,
    onModelSelectResult,
    modelInfoTooltip,
    audioInfoTooltip,
    audioModelForSet,
    onSetModelFromAudio,
}) => {
    const { t } = useTranslation();
    const { token } = useToken();

    const handleClearModel = () => {
        onSelectedModelChange("");
        setInputValidationModel({ validateStatus: "", help: "" });
    };

    const handleRollbackModel = () => {
        onSelectedModelChange(originalModel);
        setInputValidationModel({ validateStatus: "", help: "" });
    };

    const isModelUnchanged = selectedModel === (originalModel || "");
    const editingLocked = sourceEditor.loading || sourceEditor.busy;
    const normalizedAudioModelForSet = (audioModelForSet || "").trim();
    const showSetModelFromAudioAction =
        Boolean(normalizedAudioModelForSet) &&
        Boolean(onSetModelFromAudio) &&
        toModelKey(selectedModel) !== toModelKey(normalizedAudioModelForSet);

    return (
        <Modal
            open={open}
            onCancel={() => {
                if (!sourceEditor.busy) onCancel();
            }}
            closable={!sourceEditor.busy}
            keyboard={!sourceEditor.busy}
            mask={{ closable: !sourceEditor.busy }}
            title={title}
            footer={
                <Button
                    type="primary"
                    onClick={onSave}
                    disabled={
                        !hasPendingChanges ||
                        sourceEditor.loading ||
                        sourceEditor.busy ||
                        !sourceEditor.valid
                    }
                >
                    <SaveFilled key="saveClick" /> {t("tonies.editModal.save")}
                </Button>
            }
            width={700}
        >
            <ConfigProvider componentDisabled={editingLocked}>
                <fieldset
                    disabled={editingLocked}
                    aria-disabled={editingLocked}
                    onClickCapture={(event) => {
                        if (editingLocked) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }}
                    onChangeCapture={(event) => {
                        if (editingLocked) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }}
                    style={{
                        border: 0,
                        margin: 0,
                        padding: 0,
                        width: "100%",
                        pointerEvents: editingLocked ? "none" : undefined,
                    }}
                >
                    <Divider orientation="horizontal" titlePlacement="left">
                        {t("tonies.editModal.source")}
                    </Divider>
                    <Select
                        aria-label={t("sources.source")}
                        value={sourceEditor.kind}
                        onChange={sourceEditor.setKind}
                        disabled={sourceEditor.loading || sourceEditor.busy}
                        style={{ width: "100%", marginBottom: 16 }}
                        options={[
                            { value: "audio", label: t("sources.audio") },
                            { value: "radio", label: t("sources.radio") },
                            {
                                value: "podcast",
                                label: t("podcasts.title"),
                                disabled: !sourceEditor.podcastSupported,
                            },
                            {
                                value: "ard",
                                label: t("sources.ard"),
                                disabled: !sourceEditor.ardSupported,
                            },
                        ]}
                    />
                    {sourceEditor.error && <Alert type="error" title={sourceEditor.error} />}
                    {sourceEditor.kind === "audio" ? (
                        <AudioFileSourceEditor
                            source={selectedSource}
                            originalSource={originalSource}
                            onChange={onSelectedSourceChange}
                            validation={inputValidationSource}
                            setValidation={setInputValidationSource}
                            onOpenFileSelectModal={onOpenFileSelectModal}
                            modelAudioPath={modelAudioPath}
                            modelAudioHasMapping={modelAudioHasMapping}
                            selectedModel={selectedModel}
                            audioInfoTooltip={audioInfoTooltip}
                            disabled={editingLocked}
                        />
                    ) : (
                        sourceEditor.editor
                    )}

                    <Divider orientation="horizontal" titlePlacement="left">
                        {t("tonies.editModal.model")}
                    </Divider>
                    <div>
                        {modelReadOnly ? (
                            <Form.Item>
                                <Input
                                    value={modelDisplayText || selectedModel || originalModel}
                                    readOnly
                                    disabled
                                    style={{ color: token.colorText, cursor: "default" }}
                                    suffix={
                                        modelInfoTooltip ? (
                                            <Tooltip
                                                trigger={["hover", "click"]}
                                                title={modelInfoTooltip}
                                            >
                                                <InfoCircleOutlined
                                                    onMouseDown={(e) => e.preventDefault()}
                                                />
                                            </Tooltip>
                                        ) : null
                                    }
                                />
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 12, display: "block", marginTop: 4 }}
                                >
                                    {t("tonies.editModal.modelReadOnlyHint")}
                                </Text>
                            </Form.Item>
                        ) : (
                            <Form.Item
                                validateStatus={inputValidationModel.validateStatus}
                                help={inputValidationModel.help}
                            >
                                <Input
                                    value={selectedModel}
                                    onChange={(e) => onSelectedModelChange(e.target.value)}
                                    prefix={
                                        <>
                                            <CloseOutlined
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={handleClearModel}
                                                style={{ cursor: "pointer" }}
                                            />
                                            <Divider
                                                orientation="vertical"
                                                style={{ marginLeft: 2 }}
                                            />
                                            <RollbackOutlined
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={handleRollbackModel}
                                                style={{
                                                    color: isModelUnchanged
                                                        ? token.colorTextDisabled
                                                        : token.colorText,
                                                    cursor: isModelUnchanged
                                                        ? "default"
                                                        : "pointer",
                                                }}
                                            />
                                            <Divider
                                                orientation="vertical"
                                                style={{ marginLeft: 2 }}
                                            />
                                        </>
                                    }
                                    suffix={
                                        <>
                                            {modelInfoTooltip ? (
                                                <>
                                                    <Tooltip
                                                        trigger={["hover", "click"]}
                                                        title={modelInfoTooltip}
                                                    >
                                                        <InfoCircleOutlined
                                                            onMouseDown={(e) => e.preventDefault()}
                                                        />
                                                    </Tooltip>
                                                    <Divider
                                                        orientation="vertical"
                                                        style={{ marginLeft: 2 }}
                                                    />
                                                </>
                                            ) : null}
                                            {selectedModel &&
                                            onEditModel &&
                                            isSelectedModelCustom ? (
                                                <>
                                                    <EditOutlined
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={onEditModel}
                                                        style={{ cursor: "pointer" }}
                                                    />
                                                    {onCreateNewModel ? (
                                                        <Divider
                                                            orientation="vertical"
                                                            style={{ marginLeft: 2 }}
                                                        />
                                                    ) : null}
                                                </>
                                            ) : null}
                                            {onCreateNewModel ? (
                                                <PlusOutlined
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={onCreateNewModel}
                                                    style={{ cursor: "pointer" }}
                                                />
                                            ) : null}
                                        </>
                                    }
                                />
                                <ToniesJsonSearch
                                    placeholder={t("tonies.editModal.placeholderSearchForAModel")}
                                    clearInputAfterSelection={true}
                                    onChange={onSearchModelChange}
                                    onSelectResult={(result) => {
                                        onModelSelectResult?.({
                                            value: result.value,
                                            selectionText: result.selectionText,
                                        });
                                    }}
                                    key={keyTonieArticleSearch}
                                    showAddCustomTonieButton={false}
                                />
                                {showSetModelFromAudioAction ? (
                                    <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
                                        <Button
                                            type="default"
                                            icon={<SwapOutlined />}
                                            onClick={() => {
                                                onSetModelFromAudio?.();
                                                setInputValidationModel({
                                                    validateStatus: "",
                                                    help: "",
                                                });
                                            }}
                                        >
                                            {t("tonies.editModal.setModelFromAudio")}
                                        </Button>
                                    </Form.Item>
                                ) : null}
                            </Form.Item>
                        )}
                    </div>
                </fieldset>
            </ConfigProvider>
        </Modal>
    );
};
