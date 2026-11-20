const KNOWN_ENV = new Set([
  "AUTH_SECRET",
  "DATABASE_URL",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_RESEND_KEY",
  "EMAIL_FROM",
])

const MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in is not configured yet. Check AUTH_SECRET, DATABASE_URL, and the provider keys in the README.",
  AccessDenied: "Access was denied. Try a different account.",
  Verification: "That sign-in link is invalid or has expired. Request a new one.",
  OAuthSignin: "Google sign-in did not start. Check AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.",
  OAuthCallback: "Google did not finish signing you in. Try again.",
  OAuthCreateAccount: "Could not create an account from Google. Try again.",
  OAuthAccountNotLinked: "This email is already used with a different sign-in method.",
  EmailSignin: "Could not send the sign-in email. Check AUTH_RESEND_KEY and EMAIL_FROM, then try again.",
  EmailCreateAccount: "Could not create an account for that email. Try again.",
  Callback: "Sign-in did not complete. Try again.",
  MissingSecret: "Add AUTH_SECRET (see the README) and try again.",
  Database: "Could not reach the database. Check DATABASE_URL, then run npm run db:setup if the tables are missing.",
  EmailRequired: "Enter the email address that should receive the link.",
  EmailInvalid: "That does not look like an email address.",
  SignupsClosed: "New signups are closed for now. Join the waitlist on the home page and we will invite you.",
  Default: "Something went wrong signing in. Nothing was sent. Try again.",
}

function formatList(names: string[]) {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

export function signupErrorMessage(error?: string, need?: string) {
  if (!error) return null
  if (error === "MissingConfig") {
    const names = (need ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => KNOWN_ENV.has(name))
    if (names.length === 0) return MESSAGES.Configuration
    return `Sign-in needs ${formatList(names)}. Add them and try again. Nothing was sent.`
  }
  return MESSAGES[error] ?? MESSAGES.Default
}
