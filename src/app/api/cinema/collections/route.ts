import {
  json,
  jsonError,
  libraryFailure,
  readJson,
  requireLibraryUser,
  str,
} from "@/lib/research/route-helpers";
import { createCinemaCollection, listCinemaCollections } from "@/lib/cinema/store";

export async function GET() {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  try {
    return json({ collections: await listCinemaCollections(user.userId) });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function POST(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const body = await readJson(request);
  const name = str(body?.["name"], 80);
  if (!name) return jsonError(400, "Give the Cinema folder a name.", "bad_request");
  try {
    return json(
      {
        collection: await createCinemaCollection(
          user.userId,
          name,
          str(body?.["description"], 500),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return libraryFailure(error);
  }
}
