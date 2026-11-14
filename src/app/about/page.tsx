import type { Metadata } from "next";
import Link from "next/link";
import { SiteDocument } from "@/components/landing/SiteDocument";

export const metadata: Metadata = {
  title: "About — Nexus",
  description: "Nexus is a personal AI operating environment made by Muhtasim Mohammad in Toronto.",
};

export default function AboutPage() {
  return (
    <SiteDocument
      kicker="About"
      title="Made in Toronto."
      lede={
        <p>
          Nexus is a personal AI operating environment. Muhtasim Mohammad makes it in Toronto.
        </p>
      }
    >
      <p>
        The aim is one room for work that usually lives apart. A network at the center. A conversation with it.
        Extensions that keep running when the conversation is quiet. A reader for the web. A cockpit for the accounts
        and services already in a life, joined by rules you can see.
      </p>
      <p>
        The network is the home view: a golden field, and a chat beneath it. Ask for the shape of a day. Nexus answers,
        and the day moves. The exchange lasts for the visit.
      </p>
      <p>
        Extensions occupy sockets on that network. They keep working when you are not speaking to them, and they share
        typed content only along the capabilities they are granted. Two sockets are free. Pro opens the rest.
      </p>
      <p>
        Research is the reader. It searches with Brave, opens a page as clean writing, and keeps what you save in
        collections, with tags and highlights. Command is the cockpit turned outward. Weather, mail, a calendar, and the
        tools you connect land on one timeline. Automations between them run by rule. The credentials for those
        connections are encrypted.
      </p>
      <p>
        You sign in with Google, or with a magic link to your email. There is no password. Accounts, saved research, and
        Command are kept in Neon Postgres. The <Link href="/privacy">privacy policy</Link> and the{" "}
        <Link href="/terms">terms</Link> say what that means in practice.
      </p>
      <p>
        To reach Muhtasim Mohammad, <Link href="/signup">sign in on this site</Link>.
      </p>
    </SiteDocument>
  );
}
