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
import { validPodcastConfig } from "./podcastValidation";
const api = new TeddyCloudApi(defaultAPIConfig());
export type PodcastEditorState = ReturnType<typeof usePodcastSubscription>;
export const PodcastSubscriptionEditor = ({
    state,
    disabled,
    onDetached,
}: {
    state: PodcastEditorState;
    disabled: boolean;
    onDetached: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PodcastSearchResult[]>([]);
    const [searchError, setSearchError] = useState("");
    const [preview, setPreview] = useState<PodcastPreview>();
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState("");
    const { draft, setDraft, subscription } = state;
    useEffect(() => {
        setResults([]);
        setSearchError("");
        if (query.trim().length < 2) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void api
                .podcastSearch(query.trim(), controller.signal)
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
    }, [query, t]);
    useEffect(() => {
        setPreview(undefined);
        setPreviewError("");
    }, [draft.feedUrl, draft.episodeCount, draft.order]);
    useEffect(() => {
        if (!previewing) return;
        const controller = new AbortController();
        void api
            .podcastPreview(draft, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) setPreview(result);
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setPreviewError(String(cause));
            })
            .finally(() => {
                if (!controller.signal.aborted) setPreviewing(false);
            });
        return () => controller.abort();
    }, [previewing, draft]);
    const locked = disabled || state.busy || state.loading;
    return (
        <Space orientation="vertical" style={{ width: "100%" }}>
            <Alert type="info" title={t("podcasts.explanation")} />
            <Form.Item label={t("podcasts.search")}>
                <AutoComplete
                    value={query}
                    disabled={locked}
                    onSearch={setQuery}
                    onChange={setQuery}
                    style={{ width: "100%" }}
                    options={results.map((item) => ({
                        value: item.feedUrl,
                        label: `${item.title} — ${item.author}`,
                    }))}
                    onSelect={(feedUrl) => {
                        setDraft({ ...draft, feedUrl });
                        setQuery("");
                        setResults([]);
                    }}
                    placeholder={t("podcasts.searchPlaceholder")}
                />
            </Form.Item>
            {searchError && <Alert type="warning" title={searchError} />}
            <Form.Item label={t("podcasts.feedUrl")}>
                <Input
                    value={draft.feedUrl}
                    disabled={locked}
                    maxLength={2048}
                    onChange={(e) => setDraft({ ...draft, feedUrl: e.target.value })}
                    placeholder="https://example.org/podcast.rss"
                />
            </Form.Item>
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
            <Space>
                <Switch
                    checked={draft.refreshOnPlacement}
                    disabled={locked}
                    onChange={(refreshOnPlacement) => setDraft({ ...draft, refreshOnPlacement })}
                />
                <span>{t("podcasts.placement")}</span>
            </Space>
            {draft.refreshOnPlacement && <Alert type="info" title={t("podcasts.placementHelp")} />}
            <Space wrap>
                <Button
                    disabled={locked || !validPodcastConfig(draft)}
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
                        renderItem={(episode, i) => (
                            <List.Item>
                                {i + 1}. {episode.title}
                            </List.Item>
                        )}
                    />
                </>
            )}
            {subscription && (
                <>
                    <Typography.Text strong>
                        {subscription.title || t("podcasts.title")}
                    </Typography.Text>
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
                            </List.Item>
                        )}
                    />
                </>
            )}
        </Space>
    );
};
