import { json, jsonError, requireUser } from "@/lib/research/route-helpers";
import type { StockMediaItem } from "@/lib/cinema/types";

type UnsplashPhoto = {
  id: string;
  width?: number;
  height?: number;
  alt_description?: string | null;
  description?: string | null;
  links?: { html?: string };
  user?: {
    name?: string;
    username?: string;
    links?: { html?: string };
  };
  urls?: {
    raw?: string;
    full?: string;
    regular?: string;
    small?: string;
    thumb?: string;
  };
};

type UnsplashSearchResponse = {
  total?: number;
  total_pages?: number;
  results?: UnsplashPhoto[];
};

function proxyUrl(rawUrl: string): string {
  return `/api/cinema/media-proxy?url=${encodeURIComponent(rawUrl)}`;
}

function resolveUnsplashKey(): string {
  return (
    process.env["UNSPLASH_ACCESS_KEY"]?.trim() ||
    process.env["UNSPLASH_API_KEY"]?.trim() ||
    process.env["NEXT_PUBLIC_UNSPLASH_ACCESS_KEY"]?.trim() ||
    ""
  );
}

function mapUnsplashPhoto(p: UnsplashPhoto): StockMediaItem | null {
  const best = p.urls?.regular || p.urls?.full || p.urls?.small;
  const thumb = p.urls?.small || p.urls?.thumb || best;
  if (!best || !thumb) return null;
  const authorName = p.user?.name || p.user?.username || "Unsplash creator";
  const rawTitle = p.alt_description?.trim() || p.description?.trim() || `Photo by ${authorName}`;
  return {
    id: `unsplash-${p.id}`,
    kind: "image",
    title: rawTitle.slice(0, 120),
    width: p.width || 1920,
    height: p.height || 1080,
    durationMs: 5000,
    thumbnailUrl: proxyUrl(thumb),
    previewUrl: proxyUrl(thumb),
    mediaUrl: proxyUrl(best),
    mimeType: "image/jpeg",
    author: authorName,
    authorUrl: p.user?.links?.html || p.links?.html || "https://unsplash.com",
  };
}

export async function GET(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;

  const rawKey = resolveUnsplashKey();
  if (!rawKey) {
    return json({ configured: false, items: [] as StockMediaItem[], hasMore: false });
  }

  const authHeader = rawKey.startsWith("Client-ID ") ? rawKey : `Client-ID ${rawKey}`;
  const sp = new URL(request.url).searchParams;
  const query = sp.get("query")?.trim().slice(0, 100) || "";
  const page = Math.max(1, Math.min(20, Math.round(Number(sp.get("page") || 1)) || 1));

  try {
    const endpoint = query
      ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=18&page=${page}`
      : `https://api.unsplash.com/photos?per_page=18&page=${page}&order_by=popular`;

    const res = await fetch(endpoint, {
      headers: {
        Authorization: authHeader,
        "Accept-Version": "v1",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return jsonError(
        res.status === 401 ? 502 : res.status,
        "Unsplash stock search failed.",
        "stock_error",
      );
    }

    if (query) {
      const data = (await res.json()) as UnsplashSearchResponse;
      const items = (data.results ?? [])
        .map(mapUnsplashPhoto)
        .filter((x): x is StockMediaItem => x !== null);
      const hasMore = (data.total_pages ?? 1) > page;
      return json({ configured: true, items, hasMore });
    }

    const list = (await res.json()) as UnsplashPhoto[];
    const items = (Array.isArray(list) ? list : [])
      .map(mapUnsplashPhoto)
      .filter((x): x is StockMediaItem => x !== null);
    return json({ configured: true, items, hasMore: items.length >= 18 });
  } catch (error) {
    console.error("[cinema-stock] Unsplash fetch failed", error instanceof Error ? error.message : error);
    return jsonError(502, "Could not reach Unsplash right now.", "stock_error");
  }
}
