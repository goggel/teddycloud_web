import { useRef, useState } from "react";
import { Alert, Button, List, Radio, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { TeddyCloudApi } from "../../../../api";
import { PodcastEditorState } from "./PodcastSubscriptionEditor";
import { PodcastEpisodePlayer } from "./PodcastEpisodePlayer";
import { formatPreviewTime, PreviewCuts } from "./podcastPreviewTiming";
import { effectiveTrim, sourceToken, validPodcastConfig, validTrim } from "./podcastValidation";
import { usePodcastRecentEpisodes } from "./usePodcastRecentEpisodes";

export const PodcastRecentEpisodes = ({
    api,
    state,
    locked,
}: {
    api: Pick<TeddyCloudApi, "podcastPreview">;
    state: PodcastEditorState;
    locked: boolean;
}) => {
    const { t, i18n } = useTranslation();
    const [target, setTarget] = useState<"defaults" | "episode">("defaults");
    const recent = usePodcastRecentEpisodes(
        api,
        state.draft,
        state.capabilities,
        state.setResolvedSource,
    );
    const stateRef = useRef(state);
    stateRef.current = state;
    const lockedRef = useRef(locked);
    lockedRef.current = locked;
    const episode = recent.preview?.episodes.find(
        (item) => item.identity === recent.activeIdentity,
    );
    const overridden = Boolean(
        episode && state.draft.episodeTrims.some((item) => item.identity === episode.identity),
    );
    const cuts: PreviewCuts =
        episode && target === "episode"
            ? effectiveTrim(state.draft, episode)
            : {
                  trimStartSeconds: state.draft.trimStartSeconds,
                  trimEndSeconds: state.draft.trimEndSeconds,
              };
    const sourceKey = recent.preview?.sourceKey || "";
    const canEdit =
        state.capabilities.trimSupported && !locked && !state.sourceMismatch && Boolean(sourceKey);
    const canCaptureEpisode = canEdit && (overridden || state.draft.episodeTrims.length < 50);
    const capture = (side: "start" | "end", value: number, duration: number) => {
        const current = stateRef.current;
        const snapshot = recent.token;
        if (
            !episode ||
            !recent.preview ||
            !recent.preview.episodes.some((item) => item.identity === episode.identity) ||
            lockedRef.current ||
            current.busy ||
            current.loading ||
            current.sourceMismatch ||
            !current.capabilities.trimSupported ||
            !sourceKey ||
            sourceToken(current.draft) !== snapshot ||
            (current.sourceKey && current.sourceKey !== sourceKey) ||
            !validTrim(value)
        )
            return;
        current.setDraft((draft) => {
            if (
                sourceToken(draft) !== snapshot ||
                (draft.episodeTrims.length && draft.episodeTrimSourceKey !== sourceKey)
            )
                return draft;
            const prior =
                target === "defaults"
                    ? {
                          trimStartSeconds: draft.trimStartSeconds,
                          trimEndSeconds: draft.trimEndSeconds,
                      }
                    : effectiveTrim(draft, episode);
            const next = {
                trimStartSeconds: side === "start" ? value : prior.trimStartSeconds,
                trimEndSeconds: side === "end" ? value : prior.trimEndSeconds,
            };
            if (
                !validTrim(next.trimStartSeconds) ||
                !validTrim(next.trimEndSeconds) ||
                !Number.isFinite(duration) ||
                next.trimStartSeconds + next.trimEndSeconds >= duration
            )
                return draft;
            if (target === "defaults")
                return {
                    ...draft,
                    [side === "start" ? "trimStartSeconds" : "trimEndSeconds"]: value,
                };
            const exists = draft.episodeTrims.some((item) => item.identity === episode.identity);
            if (!exists && draft.episodeTrims.length >= 50) return draft;
            return {
                ...draft,
                episodeTrimSourceKey: sourceKey,
                episodeTrims: [
                    ...draft.episodeTrims.filter((item) => item.identity !== episode.identity),
                    { identity: episode.identity, ...next },
                ],
            };
        });
    };
    const removeOverride = () => {
        if (!episode || !canEdit || sourceToken(state.draft) !== recent.token) return;
        state.setDraft((draft) =>
            sourceToken(draft) === recent.token
                ? {
                      ...draft,
                      episodeTrims: draft.episodeTrims.filter(
                          (item) => item.identity !== episode.identity,
                      ),
                  }
                : draft,
        );
    };
    const providerSupported =
        state.draft.sourceType === "rss"
            ? !state.capabilities.sourceTypes || state.capabilities.sourceTypes.includes("rss")
            : Boolean(state.capabilities.sourceTypes?.includes("ard_audiothek"));
    const sourceValid =
        state.supported &&
        state.capabilities.supported &&
        providerSupported &&
        validPodcastConfig({
            ...state.draft,
            episodeCount: 1,
            order: "newest_first",
            intervalHours: 6,
            trimStartSeconds: 0,
            trimEndSeconds: 0,
            episodeTrims: [],
            episodeTrimSourceKey: "",
        });
    return (
        <Space orientation="vertical" style={{ width: "100%" }}>
            <Typography.Text strong>{t("podcasts.listenRecentTitle")}</Typography.Text>
            <Typography.Text type="secondary">{t("podcasts.listenRecentHelp")}</Typography.Text>
            <Space wrap>
                <Button
                    disabled={locked || !sourceValid}
                    loading={recent.loading}
                    onClick={() => void recent.load()}
                >
                    {t(
                        recent.preview || recent.error
                            ? "podcasts.listenReload"
                            : "podcasts.listenLoad",
                    )}
                </Button>
            </Space>
            {recent.error && (
                <Alert
                    type="warning"
                    title={t("podcasts.listenLoadFailed")}
                    description={recent.error}
                />
            )}
            {recent.preview && (
                <>
                    {recent.preview.warnings.map((warning) => (
                        <Alert key={warning} type="warning" title={warning} />
                    ))}
                    <List
                        size="small"
                        locale={{ emptyText: t("podcasts.listenEmpty") }}
                        dataSource={recent.preview.episodes}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    <Button
                                        key="listen"
                                        onClick={() => recent.setActiveIdentity(item.identity)}
                                    >
                                        {t("podcasts.listenEpisode")}
                                    </Button>,
                                ]}
                            >
                                <Space orientation="vertical">
                                    <span>{item.title}</span>
                                    <Typography.Text type="secondary">
                                        {Number.isFinite(item.publishedAt) && item.publishedAt > 0
                                            ? new Date(item.publishedAt * 1000).toLocaleDateString(
                                                  i18n?.language || undefined,
                                              )
                                            : t("podcasts.listenDateUnknown")}
                                        {item.durationSeconds !== undefined &&
                                            ` · ${t("podcasts.listenEstimatedDuration")} ${formatPreviewTime(item.durationSeconds)}`}
                                    </Typography.Text>
                                </Space>
                            </List.Item>
                        )}
                    />
                </>
            )}
            {episode && (
                <>
                    {state.capabilities.trimSupported && (
                        <>
                            <Radio.Group
                                value={target}
                                onChange={(event) => setTarget(event.target.value)}
                                options={[
                                    { label: t("podcasts.listenDefaults"), value: "defaults" },
                                    { label: t("podcasts.listenEpisodeTarget"), value: "episode" },
                                ]}
                                optionType="button"
                            />
                            <Typography.Text>
                                {t(
                                    target === "defaults"
                                        ? "podcasts.listenUsingDefaults"
                                        : "podcasts.listenUsingEpisode",
                                    {
                                        start: cuts.trimStartSeconds,
                                        end: cuts.trimEndSeconds,
                                    },
                                )}
                                {overridden &&
                                    target === "defaults" &&
                                    ` · ${t("podcasts.listenOverrideIgnored")}`}
                            </Typography.Text>
                            {target === "episode" && overridden && (
                                <Button disabled={!canEdit} onClick={removeOverride}>
                                    {t("podcasts.listenUseDefaults")}
                                </Button>
                            )}
                            {target === "episode" &&
                                !overridden &&
                                state.draft.episodeTrims.length >= 50 && (
                                    <Alert type="info" title={t("podcasts.overrideCapacity")} />
                                )}
                        </>
                    )}
                    <PodcastEpisodePlayer
                        key={episode.identity + episode.url}
                        episode={episode}
                        cuts={cuts}
                        editable={Boolean(target === "defaults" ? canEdit : canCaptureEpisode)}
                        showCuts={Boolean(state.capabilities.trimSupported)}
                        auditionTarget={target}
                        onCapture={capture}
                    />
                </>
            )}
        </Space>
    );
};
