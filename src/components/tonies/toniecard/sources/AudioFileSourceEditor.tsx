import { Button, Divider, Form, Input, theme, Tooltip } from "antd";
import {
    CloseOutlined,
    FolderOpenOutlined,
    InfoCircleOutlined,
    RollbackOutlined,
    StepBackwardOutlined,
    StepForwardOutlined,
    SwapOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAssignSiblingEpisode } from "../hooks/useAssignSiblingEpisode";
import { ValidationState } from "../TonieCardTypes";

export interface AudioFileSourceEditorProps {
    source: string;
    originalSource: string;
    onChange: (source: string) => void;
    validation: ValidationState;
    setValidation: (validation: ValidationState) => void;
    onOpenFileSelectModal: () => void;
    modelAudioPath?: string | null;
    modelAudioHasMapping?: boolean;
    selectedModel: string;
    audioInfoTooltip?: React.ReactNode;
    disabled?: boolean;
}

export const AudioFileSourceEditor = ({
    source,
    originalSource,
    onChange,
    validation,
    setValidation,
    onOpenFileSelectModal,
    modelAudioPath,
    modelAudioHasMapping,
    selectedModel,
    audioInfoTooltip,
    disabled = false,
}: AudioFileSourceEditorProps) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const {
        nextEpisodeAvailable,
        prevEpisodeAvailable,
        nextEpisodeFile,
        prevEpisodeFile,
        handleAssignNextEpisode,
        handleAssignPrevEpisode,
    } = useAssignSiblingEpisode({
        source,
        onSelectedSourceChange: onChange,
        setInputValidationSource: setValidation,
    });
    const sameAudio =
        Boolean(modelAudioPath) &&
        source.trim().toLowerCase() === modelAudioPath?.trim().toLowerCase();
    const showSetAudioFromModel =
        !sameAudio && Boolean(selectedModel.trim()) && modelAudioHasMapping;
    const changed = source !== originalSource;
    const clearValidation = () => setValidation({ validateStatus: "", help: "" });
    const siblingAction = (
        direction: "previous" | "next",
        available: boolean,
        file: typeof nextEpisodeFile,
        action: () => void,
    ) => (
        <Tooltip
            key={direction}
            title={
                available
                    ? t(`tonies.assign${direction === "next" ? "Next" : "Prev"}Episode.action`, {
                          file: file?.tonieInfo?.episode || file?.name,
                      })
                    : t(`tonies.assign${direction === "next" ? "Next" : "Prev"}Episode.noneLeft`)
            }
        >
            {direction === "next" ? (
                <StepForwardOutlined
                    style={available ? undefined : { color: token.colorTextDisabled }}
                    onClick={!disabled && available ? action : undefined}
                />
            ) : (
                <StepBackwardOutlined
                    style={available ? undefined : { color: token.colorTextDisabled }}
                    onClick={!disabled && available ? action : undefined}
                />
            )}
        </Tooltip>
    );
    return (
        <Form.Item validateStatus={validation.validateStatus} help={validation.help}>
            <Input
                aria-label={t("sources.audio")}
                value={source}
                disabled={disabled}
                onChange={(event) => {
                    if (!disabled) onChange(event.target.value);
                }}
                prefix={
                    <>
                        <CloseOutlined
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                if (disabled) return;
                                onChange("");
                                clearValidation();
                            }}
                        />
                        <Divider orientation="vertical" />
                        <RollbackOutlined
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={
                                !disabled && changed
                                    ? () => {
                                          onChange(originalSource);
                                          clearValidation();
                                      }
                                    : undefined
                            }
                            style={{ color: changed ? token.colorText : token.colorTextDisabled }}
                        />
                        <Divider orientation="vertical" />
                    </>
                }
                suffix={
                    <>
                        {audioInfoTooltip && (
                            <>
                                <Tooltip trigger={["hover", "click"]} title={audioInfoTooltip}>
                                    <InfoCircleOutlined
                                        onMouseDown={(event) => event.preventDefault()}
                                    />
                                </Tooltip>
                                <Divider orientation="vertical" />
                            </>
                        )}
                        {(prevEpisodeAvailable || nextEpisodeAvailable) && (
                            <>
                                {siblingAction(
                                    "previous",
                                    prevEpisodeAvailable,
                                    prevEpisodeFile,
                                    handleAssignPrevEpisode,
                                )}
                                {siblingAction(
                                    "next",
                                    nextEpisodeAvailable,
                                    nextEpisodeFile,
                                    handleAssignNextEpisode,
                                )}
                                <Divider orientation="vertical" />
                            </>
                        )}
                        <FolderOpenOutlined
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={disabled ? undefined : onOpenFileSelectModal}
                        />
                    </>
                }
            />
            {showSetAudioFromModel && (
                <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
                    <Button
                        icon={<SwapOutlined />}
                        disabled={disabled || !modelAudioPath}
                        onClick={() => {
                            if (modelAudioPath) {
                                onChange(modelAudioPath);
                                clearValidation();
                            }
                        }}
                    >
                        {t("tonies.editModal.setAudioFromModel")}
                    </Button>
                </Form.Item>
            )}
        </Form.Item>
    );
};
