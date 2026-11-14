import "server-only"
import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import { isIP, type LookupFunction } from "node:net"
import ipaddr from "ipaddr.js"

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BlockedUrlError"
  }
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet", ".corp"]
const ALLOWED_PORTS = new Set(["", "80", "443"])

/** Only globally routable unicast addresses; loopback, private, link-local, CGNAT, metadata, etc. are refused. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false
  return ipaddr.process(address).range() === "unicast"
}

/** Syntax-level checks. DNS answers are checked again at connect time by `guardedLookup`. */
export function assertFetchableUrl(raw: string | URL): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BlockedUrlError("That is not a valid web address.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https pages can be opened.")
  }
  if (url.username || url.password) throw new BlockedUrlError("Addresses with credentials are not allowed.")
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedUrlError("Only standard web ports (80 and 443) are allowed.")

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "")
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new BlockedUrlError("Local and internal hosts cannot be opened.")
  }
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedUrlError("Private and internal network addresses cannot be opened.")
  } else if (!host.includes(".")) {
    throw new BlockedUrlError("Local and internal hosts cannot be opened.")
  }
  return url
}

/**
 * DNS lookup for the HTTP agent. Runs on every connection, including after
 * redirects, so a public name that resolves (or rebinds) to a private address
 * is refused before a socket opens.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0)
    const allowed = addresses.filter((a) => isPublicAddress(a.address))
    if (allowed.length === 0) {
      const blocked = Object.assign(new BlockedUrlError("That host resolves to a private or internal address."), {
        code: "EBLOCKED",
      })
      return callback(blocked, "", 0)
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed)
    callback(null, allowed[0]!.address, allowed[0]!.family)
  })
}
