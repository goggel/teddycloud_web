import { useEffect, useRef, useState } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { PodcastEpisode } from "../../../../types/podcastTypes";
import {
    capturePreviewCut,
    endPreviewPosition,
    formatPreviewTime,
    knownDuration,
    previewBounds,
    PreviewCuts,
    retainedBounds,
} from "./podcastPreviewTiming";

export const episodeUrlProblem = (value: string, pageProtocol = window.location.protocol) => {
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            return "invalid";
        if (pageProtocol === "https:" && url.protocol === "http:") return "mixed";
        return undefined;
    } catch {
        return "invalid";
    }
};

export const PodcastEpisodePlayer = ({
    episode,
    cuts,
    editable,
    showCuts,
    auditionTarget,
    onCapture,
}: {
    episode: PodcastEpisode;
    cuts: PreviewCuts;
    editable: boolean;
    showCuts: boolean;
    auditionTarget: "defaults" | "episode";
    onCapture: (side: "start" | "end", value: number, duration: number) => void;
}) => {
    const { t } = useTranslation();
    const audioRef = useRef<HTMLAudioElement>(null);
    const stopAt = useRef<number | undefined>(undefined);
    const programmedSeek = useRef<number | undefined>(undefined);
    const programmedPlay = useRef(false);
    const session = useRef(0);
    const [duration, setDuration] = useState<number>();
    const [position, setPosition] = useState(0);
    const [error, setError] = useState("");
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [seeking, setSeeking] = useState(false);
    const urlProblem = episodeUrlProblem(episode.url);
    const validUrl = !urlProblem;
    const mediaDuration = duration !== undefined && knownDuration(duration) ? duration : undefined;

    useEffect(() => {
        const audio = audioRef.current;
        session.current++;
        setDuration(undefined);
        setPosition(0);
        setError("");
        setPlaying(false);
        setLoading(true);
        setSeeking(false);
        return () => {
            session.current++;
            stopAt.current = undefined;
            programmedSeek.current = undefined;
            programmedPlay.current = false;
            if (audio) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            }
        };
    }, [episode.identity, episode.url]);
    useEffect(() => {
        stopAt.current = undefined;
        programmedPlay.current = false;
        audioRef.current?.pause();
    }, [cuts.trimStartSeconds, cuts.trimEndSeconds, auditionTarget]);
    useEffect(() => {
        const onAnyPlay = (event: Event) => {
            const audio = audioRef.current;
            if (
                !audio ||
                !(event.target instanceof HTMLAudioElement) ||
                !document.contains(event.target)
            )
                return;
            if (event.target === audio) {
                document.querySelectorAll("audio").forEach((other) => {
                    if (other !== audio) other.pause();
                });
            } else audio.pause();
        };
        document.addEventListener("play", onAnyPlay, true);
        return () => document.removeEventListener("play", onAnyPlay, true);
    }, []);

    const canSeek = (target: number) => {
        const audio = audioRef.current;
        if (!audio || mediaDuration === undefined || target < 0 || target > mediaDuration)
            return false;
        for (let i = 0; i < audio.seekable.length; i++)
            if (target >= audio.seekable.start(i) && target <= audio.seekable.end(i)) return true;
        return false;
    };
    const seek = (target: number, audition = false) => {
        const audio = audioRef.current;
        if (!audio || !canSeek(target)) {
            setError(t("podcasts.listenSeekUnavailable"));
            return false;
        }
        if (!audition) stopAt.current = undefined;
        try {
            programmedSeek.current = target;
            audio.currentTime = target;
            setPosition(target);
            setError("");
            return true;
        } catch {
            programmedSeek.current = undefined;
            setError(t("podcasts.listenSeekUnavailable"));
            return false;
        }
    };
    const play = async (audition = false) => {
        const audio = audioRef.current;
        if (!audio) return;
        const started = session.current;
        if (!audition) stopAt.current = undefined;
        programmedPlay.current = audition && audio.paused;
        try {
            await audio.play();
            if (session.current === started) setError("");
        } catch {
            if (session.current !== started) return;
            programmedPlay.current = false;
            stopAt.current = undefined;
            setError(t("podcasts.listenPlaybackFailed"));
        }
    };
    const audition = (bounds?: { start: number; end: number }) => {
        if (!bounds || bounds.start >= bounds.end) {
            setError(t("podcasts.listenCutUnavailable"));
            return;
        }
        if (!seek(bounds.start, true)) return;
        stopAt.current = bounds.end;
        void play(true);
    };
    const capture = (side: "start" | "end") => {
        const audio = audioRef.current;
        const next =
            audio && mediaDuration !== undefined
                ? capturePreviewCut(side, audio.currentTime, mediaDuration, cuts)
                : undefined;
        if (next && editable) {
            setError("");
            onCapture(
                side,
                side === "start" ? next.trimStartSeconds : next.trimEndSeconds,
                mediaDuration!,
            );
        } else setError(t("podcasts.listenCutUnavailable"));
    };
    const originalEnd =
        mediaDuration !== undefined ? mediaDuration - cuts.trimEndSeconds : undefined;
    return (
        <Space orientation="vertical" style={{ width: "100%" }}>
            <Typography.Text strong>{episode.title}</Typography.Text>
            {!validUrl ? (
                <Alert
                    type="warning"
                    title={t(
                        urlProblem === "mixed"
                            ? "podcasts.listenMixedContent"
                            : "podcasts.listenUrlUnavailable",
                    )}
                />
            ) : (
                <audio
                    key={episode.identity + episode.url}
                    ref={audioRef}
                    controls
                    preload="metadata"
                    src={episode.url}
                    aria-label={t("podcasts.listenPlayer", { title: episode.title })}
                    onLoadedMetadata={(event) => {
                        if (event.currentTarget !== audioRef.current) return;
                        const value = event.currentTarget.duration;
                        setDuration(knownDuration(value) ? value : undefined);
                        setLoading(false);
                    }}
                    onDurationChange={(event) => {
                        if (event.currentTarget !== audioRef.current) return;
                        const value = event.currentTarget.duration;
                        setDuration(knownDuration(value) ? value : undefined);
                    }}
                    onTimeUpdate={(event) => {
                        if (event.currentTarget !== audioRef.current) return;
                        const audio = event.currentTarget;
                        setPosition(audio.currentTime);
                        if (stopAt.current !== undefined && audio.currentTime >= stopAt.current) {
                            stopAt.current = undefined;
                            audio.pause();
                        }
                    }}
                    onWaiting={(event) => {
                        if (event.currentTarget === audioRef.current) setLoading(true);
                    }}
                    onCanPlay={(event) => {
                        if (event.currentTarget === audioRef.current) setLoading(false);
                    }}
                    onSeeking={(event) => {
                        if (event.currentTarget !== audioRef.current) return;
                        setSeeking(true);
                        setPosition(event.currentTarget.currentTime);
                        if (
                            programmedSeek.current !== undefined &&
                            Math.abs(event.currentTarget.currentTime - programmedSeek.current) < 0.1
                        ) {
                            programmedSeek.current = undefined;
                        } else {
                            programmedSeek.current = undefined;
                            stopAt.current = undefined;
                        }
                    }}
                    onSeeked={(event) => {
                        if (event.currentTarget === audioRef.current) setSeeking(false);
                    }}
                    onPlay={(event) => {
                        if (event.currentTarget !== audioRef.current) return;
                        if (programmedPlay.current) programmedPlay.current = false;
                        else stopAt.current = undefined;
                        setPlaying(true);
                    }}
                    onPause={(event) => {
                        if (event.currentTarget === audioRef.current) {
                            programmedPlay.current = false;
                            setPlaying(false);
                        }
                    }}
                    onError={(event) => {
                        if (event.currentTarget === audioRef.current) {
                            setLoading(false);
                            setError(t("podcasts.listenPlaybackFailed"));
                        }
                    }}
                />
            )}
            <Typography.Text>
                {formatPreviewTime(position)} / {formatPreviewTime(mediaDuration)}
            </Typography.Text>
            {loading && validUrl && (
                <Typography.Text type="secondary">{t("podcasts.listenLoading")}</Typography.Text>
            )}
            {seeking && (
                <Typography.Text type="secondary">{t("podcasts.listenSeeking")}</Typography.Text>
            )}
            {validUrl && (
                <Space wrap>
                    <Button
                        onClick={() => {
                            if (playing) audioRef.current?.pause();
                            else void play();
                        }}
                    >
                        {t(playing ? "podcasts.listenPause" : "podcasts.listenPlay")}
                    </Button>
                    <Button
                        onClick={() => seek(Math.max(0, position - 5))}
                        disabled={mediaDuration === undefined}
                    >
                        {t("podcasts.listenBack")}
                    </Button>
                    <Button
                        onClick={() => seek(Math.min(mediaDuration ?? 0, position + 5))}
                        disabled={mediaDuration === undefined}
                    >
                        {t("podcasts.listenForward")}
                    </Button>
                    <Button onClick={() => seek(0)} disabled={mediaDuration === undefined}>
                        {t("podcasts.listenBeginning")}
                    </Button>
                    <Button
                        onClick={() => {
                            const target = endPreviewPosition(mediaDuration ?? NaN);
                            if (target !== undefined) seek(target);
                        }}
                        disabled={mediaDuration === undefined}
                    >
                        {t("podcasts.listenEnd")}
                    </Button>
                    {showCuts && (
                        <>
                            <Button
                                onClick={() =>
                                    audition(
                                        previewBounds(mediaDuration ?? NaN, cuts.trimStartSeconds),
                                    )
                                }
                                disabled={mediaDuration === undefined}
                            >
                                {t("podcasts.listenIntroBoundary")}
                            </Button>
                            <Button
                                onClick={() =>
                                    audition(
                                        previewBounds(mediaDuration ?? NaN, originalEnd ?? NaN),
                                    )
                                }
                                disabled={mediaDuration === undefined}
                            >
                                {t("podcasts.listenOutroBoundary")}
                            </Button>
                            <Button
                                onClick={() => audition(retainedBounds(mediaDuration ?? NaN, cuts))}
                                disabled={mediaDuration === undefined}
                            >
                                {t("podcasts.listenRetained")}
                            </Button>
                            <Button
                                disabled={
                                    !editable ||
                                    !capturePreviewCut(
                                        "start",
                                        position,
                                        mediaDuration ?? NaN,
                                        cuts,
                                    )
                                }
                                onClick={() => capture("start")}
                            >
                                {t("podcasts.listenSetIntro")}
                            </Button>
                            <Button
                                disabled={
                                    !editable ||
                                    !capturePreviewCut("end", position, mediaDuration ?? NaN, cuts)
                                }
                                onClick={() => capture("end")}
                            >
                                {t("podcasts.listenSetOutro")}
                            </Button>
                        </>
                    )}
                </Space>
            )}
            {error && <Alert type="warning" title={error} />}
        </Space>
    );
};
