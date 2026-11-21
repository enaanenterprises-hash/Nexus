import { databaseUrl } from "@/lib/db/client";
import { json, requireUser } from "@/lib/research/route-helpers";

export async function GET() {
  const user = await requireUser();
  if ("response" in user) return user.response;
  return json({
    database: { configured: Boolean(databaseUrl()) },
    pexels: { configured: Boolean(process.env["PEXELS_API_KEY"]?.trim()) },
  });
}
