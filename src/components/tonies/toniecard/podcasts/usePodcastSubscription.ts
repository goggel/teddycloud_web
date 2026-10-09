import { useEffect, useRef, useState } from "react";
import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { PodcastConfig, PodcastSubscription } from "../../../../types/podcastTypes";
import { defaultPodcastConfig, podcastConfig, validPodcastConfig } from "./podcastValidation";
const api = new TeddyCloudApi(defaultAPIConfig());

export const usePodcastSubscription = (open: boolean, ruid: string, overlay: string) => {
    const [supported, setSupported] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<"audio" | "podcast">("audio");
    const [draft, setDraft] = useState<PodcastConfig>(defaultPodcastConfig);
    const [subscription, setSubscription] = useState<PodcastSubscription>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const active = useRef(false);
    const epoch = useRef(0);
    const editingBase = useRef<PodcastSubscription>(undefined);
    const baseline = useRef<PodcastConfig>(defaultPodcastConfig());
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
        const poll = async (initial: boolean) => {
            try {
                if (initial) {
                    const capabilities = await api.podcastCapabilities(controller.signal);
                    if (controller.signal.aborted) return;
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
                if (!validPodcastConfig(draft)) throw new Error("Invalid podcast settings");
                const result = await api.podcastSave(ruid, overlay, draft, editingBase.current);
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
