import { useEffect, useRef, useState } from "react";
import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import {
    PodcastCapabilities,
    PodcastConfig,
    PodcastDraft,
    PodcastSubscription,
} from "../../../../types/podcastTypes";
import {
    configForCapabilities,
    defaultPodcastConfig,
    podcastConfig,
    rssSourceKey,
    sourceToken,
    validPodcastConfig,
} from "./podcastValidation";
const api = new TeddyCloudApi(defaultAPIConfig());

export const usePodcastSubscription = (open: boolean, ruid: string, overlay: string) => {
    const [capabilities, setCapabilities] = useState<PodcastCapabilities>({ supported: false });
    const [supported, setSupported] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<"audio" | "podcast">("audio");
    const [draft, setDraft] = useState<PodcastDraft>(defaultPodcastConfig);
    const [subscription, setSubscription] = useState<PodcastSubscription>();
    const [resolvedSource, setResolvedSource] = useState<{ token: string; key: string }>({
        token: "",
        key: "",
    });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const active = useRef(false);
    const epoch = useRef(0);
    const editingBase = useRef<PodcastSubscription>(undefined);
    const baseline = useRef<PodcastDraft>(defaultPodcastConfig());
    useEffect(() => {
        if (!open) return;
        active.current = true;
        epoch.current++;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        setLoading(true);
        setBusy(false);
        setMode("audio");
        setSubscription(undefined);
        setError("");
        setSupported(false);
        setCapabilities({ supported: false });
        const poll = async (initial: boolean) => {
            try {
                if (initial) {
                    const capabilities = await api.podcastCapabilities(controller.signal);
                    if (controller.signal.aborted) return;
                    setCapabilities(capabilities);
                    setSupported(capabilities.supported);
                    if (!capabilities.supported) {
                        setError(capabilities.message || "");
                        return;
                    }
                }
                const response = await api.podcastSubscriptions(ruid, overlay, controller.signal);
                if (controller.signal.aborted) return;
                const current = response.subscriptions[0];
                setSubscription(current);
                if (initial) {
                    editingBase.current = current;
                    baseline.current = current ? podcastConfig(current) : defaultPodcastConfig();
                    setDraft(baseline.current);
                    setResolvedSource({
                        token: sourceToken(baseline.current),
                        key: current?.sourceKey ?? "",
                    });
                    setMode(current ? "podcast" : "audio");
                }
                timer = setTimeout(() => void poll(false), 2000);
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(String(cause));
                    if (!initial) timer = setTimeout(() => void poll(false), 5000);
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void poll(true);
        return () => {
            active.current = false;
            epoch.current++;
            controller.abort();
            clearTimeout(timer);
        };
    }, [open, ruid, overlay]);
    const sourceKey =
        draft.sourceType === "rss"
            ? rssSourceKey(draft.feedUrl)
            : resolvedSource.token === sourceToken(draft)
              ? resolvedSource.key
              : "";
    const sourceMismatch =
        draft.episodeTrims.length > 0 && (!sourceKey || draft.episodeTrimSourceKey !== sourceKey);
    const valid = validPodcastConfig(draft) && !sourceMismatch;
    const dirty =
        supported &&
        !loading &&
        (mode === "podcast"
            ? !subscription ||
              JSON.stringify(podcastConfig(draft)) !== JSON.stringify(baseline.current)
            : Boolean(subscription));
    const run = async (task: () => Promise<void>) => {
        const session = epoch.current;
        setBusy(true);
        setError("");
        try {
            await task();
        } catch (cause) {
            if (active.current && epoch.current === session) setError(String(cause));
            throw cause;
        } finally {
            if (active.current && epoch.current === session) setBusy(false);
        }
    };
    const save = () =>
        run(async () => {
            const session = epoch.current;
            if (mode === "podcast") {
                if (!valid) throw new Error("Invalid podcast settings");
                const result = await api.podcastSave(
                    ruid,
                    overlay,
                    configForCapabilities(draft, capabilities),
                    editingBase.current,
                );
                if (!active.current || epoch.current !== session) return;
                editingBase.current = result.subscription;
                setSubscription(result.subscription);
                baseline.current = podcastConfig(result.subscription);
            } else if (subscription) {
                await api.podcastDetach(editingBase.current || subscription, overlay);
                if (active.current && epoch.current === session) setSubscription(undefined);
            }
        });
    const refresh = () =>
        run(async () => {
            if (subscription) await api.podcastRefresh(subscription.id, overlay);
        });
    const detach = () =>
        run(async () => {
            const session = epoch.current;
            if (subscription) await api.podcastDetach(editingBase.current || subscription, overlay);
            if (active.current && epoch.current === session) {
                setSubscription(undefined);
                setMode("audio");
                setDraft(defaultPodcastConfig());
                baseline.current = defaultPodcastConfig();
            }
        });
    return {
        capabilities,
        resolvedSource,
        setResolvedSource,
        sourceKey,
        sourceMismatch,
        valid,
        supported,
        loading,
        mode,
        setMode,
        draft,
        setDraft,
        subscription,
        error,
        busy,
        dirty,
        save,
        refresh,
        detach,
    };
};
