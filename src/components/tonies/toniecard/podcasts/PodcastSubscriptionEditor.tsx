import { useEffect, useState } from "react";
import {
    Alert,
    AutoComplete,
    Button,
    Form,
    Input,
    InputNumber,
    List,
    Select,
    Space,
    Switch,
    Typography,
    Popconfirm,
} from "antd";
import { useTranslation } from "react-i18next";
import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { PodcastPreview, PodcastSearchResult } from "../../../../types/podcastTypes";
import { usePodcastSubscription } from "./usePodcastSubscription";
import { usePodcastFeedFilter } from "./usePodcastFeedFilter";
import {
    configForCapabilities,
    rssSourceKey,
    effectiveTrim,
    sourceToken,
    validPodcastConfig,
} from "./podcastValidation";
const api = new TeddyCloudApi(defaultAPIConfig());
export type PodcastEditorState = ReturnType<typeof usePodcastSubscription>;
export const PodcastSubscriptionEditor = ({
    state,
    disabled,
    onDetached,
    kind,
}: {
    state: PodcastEditorState;
    disabled: boolean;
    onDetached: () => Promise<void>;
    kind?: "podcast" | "ard";
}) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PodcastSearchResult[]>([]);
    const [searchError, setSearchError] = useState("");
    const [videoRemoved, setVideoRemoved] = useState(false);
    const [preview, setPreview] = useState<PodcastPreview>();
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState("");
    const { draft, setDraft, subscription } = state;
    const provider =
        kind === "ard" || (!kind && draft.sourceType === "ard_audiothek")
            ? "ard_audiothek"
            : "apple";
    const locked = disabled || state.busy || state.loading;
    const filtered = usePodcastFeedFilter(
        api,
        results,
        provider === "apple" && !locked ? draft.feedUrl : "",
        Boolean(state.capabilities.feedInspectionSupported),
    );
    useEffect(() => {
        if (!filtered.selectedVideo || locked) return;
        const url = draft.feedUrl;
        setDraft((current) =>
            current.sourceType === "rss" && current.feedUrl === url
                ? { ...current, feedUrl: "", displayName: "", displayNameSourceKey: "" }
                : current,
        );
        setQuery("");
        setPreviewing(false);
        setVideoRemoved(true);
    }, [filtered.selectedVideo, draft.feedUrl, locked, setDraft]);
    const selectionToken = sourceToken(draft) + ":" + draft.episodeCount + ":" + draft.order;
    const [previewToken, setPreviewToken] = useState("");
    const overrides = draft.episodeTrims;
    const removeOverride = (identity: string) =>
        setDraft({
            ...draft,
            episodeTrims: overrides.filter((item) => item.identity !== identity),
        });
    const setOverride = (identity: string, start: number, end: number) =>
        setDraft({
            ...draft,
            episodeTrimSourceKey: overrides.length
                ? draft.episodeTrimSourceKey
                : state.sourceKey || preview?.sourceKey || "",
            episodeTrims: [
                ...overrides.filter((item) => item.identity !== identity),
                { identity, trimStartSeconds: start, trimEndSeconds: end },
            ],
        });
    useEffect(() => {
        setResults([]);
        setSearchError("");
        if (query.trim().length < 2) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void api
                .podcastSearch(query.trim(), controller.signal, provider)
                .then((response) => {
                    if (!controller.signal.aborted) setResults(response.results);
                })
                .catch(() => {
                    if (!controller.signal.aborted) setSearchError(t("podcasts.searchFailed"));
                });
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, provider, t]);
    useEffect(() => {
        setPreview(undefined);
        setPreviewError("");
    }, [selectionToken]);
    useEffect(() => {
        if (!previewing) return;
        const token = selectionToken;
        const controller = new AbortController();
        void api
            .podcastPreview(
                configForCapabilities(
                    { ...draft, episodeTrims: [], episodeTrimSourceKey: "" },
                    state.capabilities,
                ),
                controller.signal,
            )
            .then((result) => {
                if (!controller.signal.aborted) {
                    setPreview(result);
                    setPreviewToken(token);
                    state.setResolvedSource({
                        token: sourceToken(draft),
                        key: result.sourceKey || "",
                    });
                    if (result.sourceKey) {
                        setDraft((current) =>
                            sourceToken(current) === sourceToken(draft)
                                ? { ...current, sourceKey: result.sourceKey }
                                : current,
                        );
                    }
                    if (result.title) {
                        setDraft((current) =>
                            sourceToken(current) === sourceToken(draft)
                                ? {
                                      ...current,
                                      displayName: result.title,
                                      displayNameSourceKey:
                                          result.sourceKey ||
                                          (provider === "apple"
                                              ? rssSourceKey(current.feedUrl)
                                              : current.ardShowUrl),
                                  }
                                : current,
                        );
                    }
                }
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setPreviewError(String(cause));
            })
            .finally(() => {
                if (!controller.signal.aborted) setPreviewing(false);
            });
        return () => controller.abort();
    }, [previewing, selectionToken]);
    return (
        <Space orientation="vertical" style={{ width: "100%" }}>
            <Alert type="info" title={t("podcasts.explanation")} />
            <Typography.Text strong>
                {draft.displayName ||
                    (provider === "ard_audiothek" ? draft.ardShowUrl : draft.feedUrl)}
            </Typography.Text>
            <Form.Item label={t("podcasts.search")}>
                <AutoComplete
                    aria-label={t("podcasts.search")}
                    value={query}
                    disabled={locked}
                    onSearch={setQuery}
                    onChange={setQuery}
                    style={{ width: "100%" }}
                    options={filtered.results.map((item) => ({
                        value: item.sourceType === "ard_audiothek" ? item.ardShowUrl : item.feedUrl,
                        label: `${item.title} — ${item.author}`,
                    }))}
                    onSelect={(url) => {
                        setVideoRemoved(false);
                        const item = results.find((result) =>
                            result.sourceType === "ard_audiothek"
                                ? result.ardShowUrl === url
                                : result.feedUrl === url,
                        );
                        const next =
                            provider === "ard_audiothek"
                                ? {
                                      ...draft,
                                      ardShowUrl: url,
                                      sourceKey:
                                          item?.sourceType === "ard_audiothek"
                                              ? item.sourceKey || ""
                                              : "",
                                      displayName: item?.title || "",
                                      displayNameSourceKey:
                                          item?.sourceType === "ard_audiothek"
                                              ? item.sourceKey || url
                                              : "",
                                  }
                                : {
                                      ...draft,
                                      feedUrl: url,
                                      sourceKey: rssSourceKey(url),
                                      displayName: item?.title || "",
                                      displayNameSourceKey: rssSourceKey(url),
                                  };
                        setDraft(next);
                        if (item?.sourceType === "ard_audiothek" && item.sourceKey)
                            state.setResolvedSource({
                                token: sourceToken(next),
                                key: item.sourceKey,
                            });
                        setQuery("");
                        setResults([]);
                    }}
                    placeholder={t("podcasts.searchPlaceholder")}
                />
            </Form.Item>
            {searchError && <Alert type="warning" title={searchError} />}
            {videoRemoved && <Alert type="warning" title={t("podcasts.videoRemoved")} />}
            <Form.Item
                label={t(provider === "ard_audiothek" ? "podcasts.ardShowUrl" : "podcasts.feedUrl")}
            >
                <Input
                    aria-label={t(
                        provider === "ard_audiothek" ? "podcasts.ardShowUrl" : "podcasts.feedUrl",
                    )}
                    value={provider === "ard_audiothek" ? draft.ardShowUrl : draft.feedUrl}
                    disabled={locked}
                    maxLength={2048}
                    onChange={(e) => {
                        setVideoRemoved(false);
                        const nextUrl = e.target.value;
                        setDraft((current) => {
                            const priorUrl =
                                provider === "ard_audiothek" ? current.ardShowUrl : current.feedUrl;
                            if (nextUrl === priorUrl) return current;
                            return provider === "ard_audiothek"
                                ? {
                                      ...current,
                                      ardShowUrl: nextUrl,
                                      sourceKey: "",
                                      displayName: "",
                                      displayNameSourceKey: "",
                                  }
                                : {
                                      ...current,
                                      feedUrl: nextUrl,
                                      sourceKey: "",
                                      displayName: "",
                                      displayNameSourceKey: "",
                                  };
                        });
                    }}
                    placeholder={
                        provider === "ard_audiothek"
                            ? "https://www.ardsounds.de/sendung/…"
                            : "https://example.org/podcast.rss"
                    }
                />
            </Form.Item>
            {state.capabilities.trimSupported && (
                <>
                    <Typography.Text>{t("podcasts.trimHelp")}</Typography.Text>
                    <Space wrap>
                        <Form.Item label={t("podcasts.trimStart")}>
                            <InputNumber
                                aria-label={t("podcasts.trimStart")}
                                min={0}
                                max={21600}
                                precision={0}
                                value={draft.trimStartSeconds}
                                disabled={locked}
                                onChange={(value) =>
                                    setDraft({ ...draft, trimStartSeconds: value ?? -1 })
                                }
                            />
                        </Form.Item>
                        <Form.Item label={t("podcasts.trimEnd")}>
                            <InputNumber
                                aria-label={t("podcasts.trimEnd")}
                                min={0}
                                max={21600}
                                precision={0}
                                value={draft.trimEndSeconds}
                                disabled={locked}
                                onChange={(value) =>
                                    setDraft({ ...draft, trimEndSeconds: value ?? -1 })
                                }
                            />
                        </Form.Item>
                    </Space>
                    {state.sourceMismatch && (
                        <Alert
                            type="warning"
                            title={t("podcasts.sourceMismatch")}
                            action={
                                <Button
                                    disabled={locked}
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            episodeTrims: [],
                                            episodeTrimSourceKey: "",
                                        })
                                    }
                                >
                                    {t("podcasts.clearOverrides")}
                                </Button>
                            }
                        />
                    )}
                    {overrides.length >= 50 && (
                        <Alert type="info" title={t("podcasts.overrideCapacity")} />
                    )}
                    {overrides.length > 0 && (
                        <List
                            header={t("podcasts.storedOverrides")}
                            dataSource={overrides}
                            renderItem={(item) => (
                                <List.Item
                                    actions={[
                                        <Button
                                            key="remove"
                                            disabled={locked}
                                            onClick={() => removeOverride(item.identity)}
                                        >
                                            {t("podcasts.removeOverride")}
                                        </Button>,
                                    ]}
                                >
                                    {item.identity}: {item.trimStartSeconds} / {item.trimEndSeconds}{" "}
                                    s
                                </List.Item>
                            )}
                        />
                    )}
                </>
            )}
            <Space wrap>
                <Form.Item label={t("podcasts.episodeCount")}>
                    <InputNumber
                        min={1}
                        max={50}
                        precision={0}
                        value={draft.episodeCount}
                        disabled={locked}
                        onChange={(value) => setDraft({ ...draft, episodeCount: value ?? 0 })}
                    />
                </Form.Item>
                <Form.Item label={t("podcasts.order")}>
                    <Select
                        value={draft.order}
                        disabled={locked}
                        style={{ minWidth: 160 }}
                        onChange={(order) => setDraft({ ...draft, order })}
                        options={[
                            { value: "newest_first", label: t("podcasts.newestFirst") },
                            { value: "oldest_first", label: t("podcasts.oldestFirst") },
                        ]}
                    />
                </Form.Item>
                <Form.Item label={t("podcasts.interval")}>
                    <InputNumber
                        min={0}
                        max={168}
                        precision={0}
                        value={draft.intervalHours}
                        disabled={locked}
                        onChange={(value) => setDraft({ ...draft, intervalHours: value ?? -1 })}
                    />
                </Form.Item>
            </Space>
            <Typography.Text type="secondary">{t("podcasts.intervalHelp")}</Typography.Text>
            <Space>
                <Switch
                    checked={draft.enabled}
                    disabled={locked}
                    onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                <span>{t("podcasts.enabled")}</span>
            </Space>
            <Alert
                type="info"
                title={
                    state.capabilities.placementRefreshAlways
                        ? t("podcasts.placementHelp")
                        : t("podcasts.placementLegacyHelp")
                }
            />
            <Space wrap>
                <Button
                    disabled={
                        locked ||
                        !validPodcastConfig({
                            ...draft,
                            episodeTrims: [],
                            episodeTrimSourceKey: "",
                        })
                    }
                    loading={previewing}
                    onClick={() => setPreviewing(true)}
                >
                    {t("podcasts.preview")}
                </Button>
                {subscription && (
                    <Button
                        disabled={locked || !subscription.enabled || state.dirty}
                        onClick={() => void state.refresh().catch(() => undefined)}
                    >
                        {t("podcasts.refresh")}
                    </Button>
                )}
                {subscription && (
                    <Popconfirm
                        title={t("podcasts.detachConfirm")}
                        onConfirm={async () => {
                            try {
                                await state.detach();
                                await onDetached();
                            } catch {
                                /* displayed in state */
                            }
                        }}
                    >
                        <Button disabled={locked} danger>
                            {t("podcasts.detach")}
                        </Button>
                    </Popconfirm>
                )}
            </Space>
            {(state.error || previewError) && (
                <Alert type="error" title={state.error || previewError} />
            )}
            {preview && (
                <>
                    <Typography.Text strong>
                        {t("podcasts.selectedEpisodes")}: {preview.title}
                    </Typography.Text>
                    {preview.warnings.map((warning) => (
                        <Alert key={warning} type="warning" title={warning} />
                    ))}
                    <List
                        size="small"
                        dataSource={preview.episodes}
                        renderItem={(episode, i) => {
                            const cuts = effectiveTrim(draft, episode),
                                overridden = overrides.some(
                                    (item) => item.identity === episode.identity,
                                );
                            const estimate =
                                episode.durationSeconds === undefined
                                    ? undefined
                                    : episode.durationSeconds -
                                      cuts.trimStartSeconds -
                                      cuts.trimEndSeconds;
                            return (
                                <List.Item>
                                    <Space orientation="vertical" style={{ width: "100%" }}>
                                        <span>
                                            {i + 1}. {episode.title}
                                        </span>
                                        {state.capabilities.trimSupported && (
                                            <>
                                                <span>
                                                    {t("podcasts.effectiveCuts", {
                                                        start: cuts.trimStartSeconds,
                                                        end: cuts.trimEndSeconds,
                                                    })}
                                                    {estimate !== undefined &&
                                                        ` · ${t("podcasts.estimatedDuration", { seconds: Math.max(0, estimate) })}`}
                                                </span>
                                                {estimate !== undefined && estimate <= 0 && (
                                                    <Alert
                                                        type="warning"
                                                        title={t("podcasts.shortEpisode")}
                                                    />
                                                )}
                                                <Space>
                                                    <Switch
                                                        aria-label={t("podcasts.overrideEpisode", {
                                                            title: episode.title,
                                                        })}
                                                        checked={overridden}
                                                        disabled={
                                                            locked ||
                                                            (!overridden &&
                                                                (overrides.length >= 50 ||
                                                                    state.sourceMismatch ||
                                                                    previewToken !==
                                                                        selectionToken))
                                                        }
                                                        onChange={(checked) =>
                                                            checked
                                                                ? setOverride(
                                                                      episode.identity,
                                                                      cuts.trimStartSeconds,
                                                                      cuts.trimEndSeconds,
                                                                  )
                                                                : removeOverride(episode.identity)
                                                        }
                                                    />
                                                    <span>{t("podcasts.override")}</span>
                                                </Space>
                                                {overridden && (
                                                    <Space>
                                                        <InputNumber
                                                            aria-label={t(
                                                                "podcasts.episodeTrimStart",
                                                                { title: episode.title },
                                                            )}
                                                            min={0}
                                                            max={21600}
                                                            precision={0}
                                                            value={cuts.trimStartSeconds}
                                                            disabled={
                                                                locked || state.sourceMismatch
                                                            }
                                                            onChange={(value) =>
                                                                setOverride(
                                                                    episode.identity,
                                                                    value ?? -1,
                                                                    cuts.trimEndSeconds,
                                                                )
                                                            }
                                                        />
                                                        <InputNumber
                                                            aria-label={t(
                                                                "podcasts.episodeTrimEnd",
                                                                { title: episode.title },
                                                            )}
                                                            min={0}
                                                            max={21600}
                                                            precision={0}
                                                            value={cuts.trimEndSeconds}
                                                            disabled={
                                                                locked || state.sourceMismatch
                                                            }
                                                            onChange={(value) =>
                                                                setOverride(
                                                                    episode.identity,
                                                                    cuts.trimStartSeconds,
                                                                    value ?? -1,
                                                                )
                                                            }
                                                        />
                                                    </Space>
                                                )}
                                            </>
                                        )}
                                    </Space>
                                </List.Item>
                            );
                        }}
                    />
                </>
            )}
            {subscription && (
                <>
                    {subscription.title && subscription.title !== draft.displayName && (
                        <Typography.Text type="secondary">
                            {t("sources.preparedTitle")}: {subscription.title}
                        </Typography.Text>
                    )}
                    <Typography.Text>
                        {t("podcasts.status")}:{" "}
                        {t(`podcasts.states.${subscription.state}`, {
                            defaultValue: subscription.state,
                        })}
                    </Typography.Text>
                    {subscription.lastSuccessAt ? (
                        <Typography.Text>
                            {t("podcasts.lastSuccess")}:{" "}
                            {new Date(subscription.lastSuccessAt * 1000).toLocaleString()}
                        </Typography.Text>
                    ) : null}
                    {subscription.lastError && (
                        <Alert
                            type="warning"
                            title={subscription.lastError}
                            description={t("podcasts.previousAvailable")}
                        />
                    )}
                    <Typography.Text strong>{t("podcasts.preparedEpisodes")}</Typography.Text>
                    <List
                        size="small"
                        dataSource={subscription.episodes}
                        locale={{ emptyText: t("podcasts.notPrepared") }}
                        renderItem={(episode, i) => (
                            <List.Item>
                                {i + 1}. {episode.title}
                                {state.capabilities.trimSupported && (
                                    <span>
                                        {" "}
                                        ·{" "}
                                        {t("podcasts.appliedCuts", {
                                            start: episode.trimStartSeconds ?? 0,
                                            end: episode.trimEndSeconds ?? 0,
                                        })}
                                        {episode.trimmedDurationSeconds !== undefined &&
                                            ` · ${Math.round(episode.trimmedDurationSeconds)} s`}
                                    </span>
                                )}
                            </List.Item>
                        )}
                    />
                </>
            )}
        </Space>
    );
};
