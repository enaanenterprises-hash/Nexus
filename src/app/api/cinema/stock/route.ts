import { json, jsonError, requireUser } from "@/lib/research/route-helpers";
import type { StockMediaItem } from "@/lib/cinema/types";

type PexelsVideoResponse = {
  videos?: Array<{
    id: number;
    width: number;
    height: number;
    duration: number;
    image: string;
    url: string;
    user?: { name?: string; url?: string };
    video_files?: Array<{
      id: number;
      quality?: string;
      file_type?: string;
      width?: number;
      height?: number;
      link?: string;
    }>;
  }>;
  next_page?: string;
};

type PexelsPhotoResponse = {
  photos?: Array<{
    id: number;
    width: number;
    height: number;
    alt?: string;
    url: string;
    photographer?: string;
    photographer_url?: string;
    src?: {
      large2x?: string;
      large?: string;
      medium?: string;
    };
  }>;
  next_page?: string;
};

function proxyUrl(rawUrl: string): string {
  return `/api/cinema/media-proxy?url=${encodeURIComponent(rawUrl)}`;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;

  const apiKey = process.env["PEXELS_API_KEY"]?.trim();
  if (!apiKey) {
    return json({ configured: false, items: [] as StockMediaItem[], hasMore: false });
  }

  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") === "photos" ? "photos" : "videos";
  const query = sp.get("query")?.trim().slice(0, 100) || "";
  const page = Math.max(1, Math.min(20, Math.round(Number(sp.get("page") || 1)) || 1));

  try {
    if (type === "photos") {
      const endpoint = query
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=18&page=${page}`
        : `https://api.pexels.com/v1/curated?per_page=18&page=${page}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: apiKey },
        cache: "no-store",
      });
      if (!res.ok) {
        return jsonError(res.status === 401 ? 502 : res.status, "Pexels stock search failed.", "stock_error");
      }
      const data = (await res.json()) as PexelsPhotoResponse;
      const items: StockMediaItem[] = (data.photos ?? []).flatMap((p) => {
        const best = p.src?.large2x || p.src?.large || p.src?.medium;
        const thumb = p.src?.medium || p.src?.large || best;
        if (!best || !thumb) return [];
        return [
          {
            id: `pexels-photo-${p.id}`,
            kind: "image",
            title: p.alt?.trim() || `Photo by ${p.photographer || "Pexels"}`,
            width: p.width || 1920,
            height: p.height || 1080,
            durationMs: 5000,
            thumbnailUrl: proxyUrl(thumb),
            previewUrl: proxyUrl(thumb),
            mediaUrl: proxyUrl(best),
            mimeType: "image/jpeg",
            author: p.photographer || "Pexels creator",
            authorUrl: p.photographer_url || p.url || "https://www.pexels.com",
          },
        ];
      });
      return json({ configured: true, items, hasMore: Boolean(data.next_page) });
    }

    const endpoint = query
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}`
      : `https://api.pexels.com/videos/popular?per_page=15&page=${page}`;
    const res = await fetch(endpoint, {
      headers: { Authorization: apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      return jsonError(res.status === 401 ? 502 : res.status, "Pexels video search failed.", "stock_error");
    }
    const data = (await res.json()) as PexelsVideoResponse;
    const items: StockMediaItem[] = (data.videos ?? []).flatMap((v) => {
      const mp4s = (v.video_files ?? []).filter(
        (f) => f.link && (!f.file_type || f.file_type.includes("mp4")),
      );
      const sorted = [...mp4s].sort((a, b) => {
        const aw = a.width ?? 0;
        const bw = b.width ?? 0;
        const aScore = aw >= 1280 && aw <= 1920 ? 10_000 + aw : aw;
        const bScore = bw >= 1280 && bw <= 1920 ? 10_000 + bw : bw;
        return bScore - aScore;
      });
      const chosen = sorted[0];
      if (!chosen?.link || !v.image) return [];
      return [
        {
          id: `pexels-video-${v.id}`,
          kind: "video",
          title: v.user?.name ? `Clip by ${v.user.name}` : "Pexels footage",
          width: chosen.width || v.width || 1920,
          height: chosen.height || v.height || 1080,
          durationMs: Math.max(1000, Math.round((v.duration || 5) * 1000)),
          thumbnailUrl: proxyUrl(v.image),
          previewUrl: proxyUrl(sorted.at(-1)?.link || chosen.link),
          mediaUrl: proxyUrl(chosen.link),
          mimeType: chosen.file_type || "video/mp4",
          author: v.user?.name || "Pexels creator",
          authorUrl: v.user?.url || v.url || "https://www.pexels.com",
        },
      ];
    });
    return json({ configured: true, items, hasMore: Boolean(data.next_page) });
  } catch (error) {
    console.error("[cinema-stock] fetch failed", error instanceof Error ? error.message : error);
    return jsonError(502, "Could not reach Pexels right now.", "stock_error");
  }
}
