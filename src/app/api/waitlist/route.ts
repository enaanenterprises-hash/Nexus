import { NextResponse } from "next/server";
import { databaseUrl, ensureWaitlistSchema, getSql } from "@/lib/db/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";

    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return NextResponse.json(
        { ok: false, error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const email = rawEmail.toLowerCase();

    if (!databaseUrl()) {
      console.error("Waitlist error: DATABASE_URL is not set, signup not stored.");
      return NextResponse.json(
        { ok: false, error: "The waitlist is temporarily unavailable. Please try again soon." },
        { status: 503 }
      );
    }

    await ensureWaitlistSchema();
    const sql = getSql();
    const id = crypto.randomUUID();

    await sql`
      INSERT INTO "waitlist" ("id", "email")
      VALUES (${id}, ${email})
      ON CONFLICT ("email") DO NOTHING
    `;

    return NextResponse.json({
      ok: true,
      message: "You're on the waitlist! We'll invite you as new beta batches roll out.",
    });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
