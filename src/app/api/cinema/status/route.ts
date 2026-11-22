import { databaseUrl } from "@/lib/db/client";
import { json, requireUser } from "@/lib/research/route-helpers";

function unsplashAccessKey(): string {
  return (
    process.env["UNSPLASH_ACCESS_KEY"]?.trim() ||
    process.env["UNSPLASH_API_KEY"]?.trim() ||
    process.env["NEXT_PUBLIC_UNSPLASH_ACCESS_KEY"]?.trim() ||
    ""
  );
}

export async function GET() {
  const user = await requireUser();
  if ("response" in user) return user.response;
  const configured = Boolean(unsplashAccessKey());
  return json({
    database: { configured: Boolean(databaseUrl()) },
    unsplash: { configured },
  });
}
