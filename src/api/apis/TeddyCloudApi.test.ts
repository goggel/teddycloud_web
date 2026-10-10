// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TeddyCloudApi } from "./TeddyCloudApi";
import { Configuration } from "../runtime";

describe("TeddyCloudApi.apiPostTeddyCloudFormDataRaw", () => {
    it("uses the configured request path and keeps FormData as body", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const formData = new FormData();
        formData.append("file", new Blob(["test"]), "test.txt");

        await api.apiPostTeddyCloudFormDataRaw("/api/fileUpload", formData);

        expect(fetchApi).toHaveBeenCalledTimes(1);
        const [url, init] = fetchApi.mock.calls[0];

        expect(url).toBe("/api/fileUpload");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(formData);
        expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    });

    it("appends overlay with ? when the path has no query string", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));

        await api.apiPostTeddyCloudFormDataRaw("/api/fileUpload", new FormData(), "box-1");

        expect(fetchApi.mock.calls[0][0]).toBe("/api/fileUpload?overlay=box-1");
    });

    it("appends overlay with & when the path already has query parameters", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));

        await api.apiPostTeddyCloudFormDataRaw(
            "/api/fileUpload?special=library",
            new FormData(),
            "box-1",
        );

        expect(fetchApi.mock.calls[0][0]).toBe("/api/fileUpload?special=library&overlay=box-1");
    });

    it("does not append overlay when it is empty", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));

        await api.apiPostTeddyCloudFormDataRaw(
            "/api/fileUpload?special=library",
            new FormData(),
            "",
        );

        expect(fetchApi.mock.calls[0][0]).toBe("/api/fileUpload?special=library");
    });

    it("forwards custom headers without adding a multipart Content-Type", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const formData = new FormData();

        await api.apiPostTeddyCloudFormDataRaw("/api/fileUpload", formData, undefined, undefined, {
            "X-Test": "yes",
        });

        const [, init] = fetchApi.mock.calls[0];
        const headers = new Headers(init.headers);

        expect(headers.get("X-Test")).toBe("yes");
        expect(headers.has("Content-Type")).toBe(false);
    });

    it("forwards initOverrides to the normal request path", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const formData = new FormData();
        const signal = new AbortController().signal;

        await api.apiPostTeddyCloudFormDataRaw("/api/fileUpload", formData, undefined, {
            signal,
        });

        const [, init] = fetchApi.mock.calls[0];
        expect(init.signal).toBe(signal);
    });

    it("returns the original error response on a non-successful HTTP response", async () => {
        const response = new Response(null, {
            status: 500,
            statusText: "Internal Server Error",
        });
        const fetchApi = vi.fn().mockResolvedValue(response);
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));

        const result = await api.apiPostTeddyCloudFormDataRaw("/api/fileUpload", new FormData());

        expect(result).toBe(response);
        expect(result.status).toBe(500);
        expect(result.ok).toBe(false);
    });
});

describe("podcast API", () => {
    it("inspects feed metadata independently of search and forwards cancellation", async () => {
        const fetchApi = vi
            .fn()
            .mockResolvedValue(new Response('{"videoOnly":true}', { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const signal = new AbortController().signal;
        expect(await api.podcastFeedInfo("https://example.org/video.rss", signal)).toEqual({
            videoOnly: true,
        });
        const [url, init] = fetchApi.mock.calls[0];
        expect(url).toBe("/api/podcasts/feed-info");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body)).toEqual({ feedUrl: "https://example.org/video.rss" });
        expect(init.signal).toBe(signal);
    });
    it("encodes query and overlay independently and carries abort signals", async () => {
        const fetchApi = vi
            .fn()
            .mockResolvedValue(new Response('{"subscriptions":[]}', { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const signal = new AbortController().signal;
        await api.podcastSubscriptions("0123456789abcdef", "box & one", signal);
        expect(fetchApi.mock.calls[0][0]).toBe(
            "/api/podcasts/subscriptions?ruid=0123456789abcdef&overlay=box%20%26%20one",
        );
        expect(fetchApi.mock.calls[0][1].signal).toBe(signal);
    });
    it("posts a JSON subscription with revision and overlay", async () => {
        const fetchApi = vi
            .fn()
            .mockResolvedValue(new Response('{"subscription":{}}', { status: 200 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const config = {
            feedUrl: "https://example.org/feed",
            episodeCount: 5,
            order: "newest_first" as const,
            intervalHours: 6,
            enabled: true,
            refreshOnPlacement: false,
        };
        await api.podcastSave("0123456789abcdef", "box-1", config);
        const [url, init] = fetchApi.mock.calls[0];
        expect(url).toBe("/api/podcasts/subscriptions/save?overlay=box-1");
        expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({ ...config, ruid: "0123456789abcdef" });
    });
    it("treats an older backend as unsupported", async () => {
        const fetchApi = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        expect(await api.podcastCapabilities()).toEqual({ supported: false });
    });
});

describe("source profile API", () => {
    it("reads capabilities, fetches an overlay scope and sends one CAS profile", async () => {
        const fetchApi = vi
            .fn()
            .mockResolvedValueOnce(
                new Response('{"supported":true,"version":1,"maxRequestBytes":65536}'),
            )
            .mockResolvedValueOnce(new Response('{"revision":0,"profiles":{}}'))
            .mockResolvedValueOnce(
                new Response(
                    '{"revision":1,"profiles":{"radio":{"source":"https://example.org/live"}}}',
                ),
            );
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        const signal = new AbortController().signal;
        expect((await api.sourceProfilesCapabilities(signal)).supported).toBe(true);
        await api.sourceProfiles("0123456789abcdef", "box & one", signal);
        expect(fetchApi.mock.calls[1][0]).toBe(
            "/api/source-profiles?ruid=0123456789abcdef&overlay=box%20%26%20one",
        );
        expect(fetchApi.mock.calls[1][1].signal).toBe(signal);
        const profile = { source: "https://example.org/live" };
        await api.saveSourceProfile("0123456789abcdef", "box & one", "radio", 0, profile);
        const [url, init] = fetchApi.mock.calls[2];
        expect(url).toBe("/api/source-profiles/save?overlay=box%20%26%20one");
        expect(JSON.parse(init.body)).toEqual({
            ruid: "0123456789abcdef",
            kind: "radio",
            expectedRevision: 0,
            profile,
        });
    });

    it("retains a conflict error and treats a missing capability route as an older backend", async () => {
        const fetchApi = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 404 }))
            .mockResolvedValueOnce(
                new Response('{"error":{"message":"Source profiles changed"}}', { status: 409 }),
            );
        const api = new TeddyCloudApi(new Configuration({ basePath: "", fetchApi }));
        expect(await api.sourceProfilesCapabilities()).toEqual({ supported: false });
        await expect(
            api.saveSourceProfile("0123456789abcdef", "", "audio", 0, { source: "x" }),
        ).rejects.toThrow("Source profiles changed");
    });
});
