import { databaseUrl } from "@/lib/db/client";
import { json, requireUser } from "@/lib/research/route-helpers";
import { isSupabaseStorageConfigured } from "@/lib/supabase/storage";

export async function GET() {
  const user = await requireUser();
  if ("response" in user) return user.response;
  return json({
    database: { configured: Boolean(databaseUrl()) },
    storage: { configured: isSupabaseStorageConfigured() },
  });
}
