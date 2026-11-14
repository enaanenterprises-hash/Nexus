export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/

/** Relative in-app path to open after sign-in. Anything else becomes the dashboard. */
export function safeCallback(value: string | null | undefined): string {
  if (!value || value.length > 512 || value.includes("..") || !SAFE_PATH.test(value)) {
    return "/dashboard"
  }
  if (value.startsWith("/signup") || value.startsWith("/api/")) return "/dashboard"
  return value
}

export function signupErrorPath(code: string, callbackUrl: string) {
  const params = new URLSearchParams({ error: code, callbackUrl })
  return `/signup?${params.toString()}`
}
