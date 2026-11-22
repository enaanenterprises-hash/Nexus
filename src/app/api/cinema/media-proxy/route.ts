import { NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import { BlockedUrlError, assertFetchableUrl, guardedLookup } from "@/lib/research/net-guard";
import { jsonError, requireUser } from "@/lib/research/route-helpers";

const ALLOWED_ORIGIN_HOSTS = new Set([
  "images.unsplash.com",
  "plus.unsplash.com",
  "images.pexels.com",
  "videos.pexels.com",
]);
const ALLOWED_REDIRECT_SUFFIXES = [
  ".unsplash.com",
  ".pexels.com",
  ".vimeocdn.com",
  ".akamaized.net",
];
const MAX_REDIRECTS = 3;

const proxyAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8_000 },
  headersTimeout: 15_000,
  bodyTimeout: 30_000,
});

function isAllowedHost(hostname: string, allowCdnSuffixes: boolean): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
  if (!allowCdnSuffixes) return false;
  return ALLOWED_REDIRECT_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function validateProxyUrl(raw: string, allowCdnSuffixes: boolean): URL {
  const parsed = assertFetchableUrl(raw);
  if (parsed.protocol !== "https:") {
    throw new BlockedUrlError("Only HTTPS stock media is allowed.");
  }
  if (!isAllowedHost(parsed.hostname, allowCdnSuffixes)) {
    throw new BlockedUrlError("Only approved Unsplash stock media hosts are allowed.");
  }
  return parsed;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;

  const rawUrl = new URL(request.url).searchParams.get("url")?.trim();
  if (!rawUrl) {
    return jsonError(400, "Missing stock media URL.", "bad_request");
  }

  let current: URL;
  try {
    current = validateProxyUrl(rawUrl, false);
  } catch (err) {
    return jsonError(403, err instanceof Error ? err.message : "Disallowed media host.", "blocked");
  }

  const rangeHeader = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    accept: "video/*,image/*;q=0.9,*/*;q=0.1",
  };
  if (rangeHeader) {
    upstreamHeaders["range"] = rangeHeader;
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const upstream = await undiciFetch(current, {
        dispatcher: proxyAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(25_000),
        headers: upstreamHeaders,
      });

      const location = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && location) {
        await upstream.body?.cancel();
        current = validateProxyUrl(new URL(location, current).href, true);
        continue;
      }

      if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel();
        return jsonError(upstream.status, "Stock media host rejected request.", "upstream_error");
      }

      const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
        await upstream.body?.cancel();
        return jsonError(415, "Unsupported stock media content type.", "unsupported_media");
      }

      const outHeaders = new Headers();
      outHeaders.set("content-type", contentType);
      outHeaders.set("cache-control", "private, max-age=3600");
      for (const h of ["content-length", "content-range", "accept-ranges", "etag"]) {
        const val = upstream.headers.get(h);
        if (val) outHeaders.set(h, val);
      }

      return new NextResponse(upstream.body as ReadableStream<Uint8Array> | null, {
        status: upstream.status,
        headers: outHeaders,
      });
    }

    return jsonError(502, "Too many media proxy redirects.", "upstream_error");
  } catch (err) {
    if (err instanceof BlockedUrlError) {
      return jsonError(403, err.message, "blocked");
    }
    console.error("[cinema-media-proxy] error", err instanceof Error ? err.message : err);
    return jsonError(502, "Could not stream stock media.", "upstream_error");
  }
}
