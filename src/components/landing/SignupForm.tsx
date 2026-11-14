import { redirect } from "next/navigation"
import { signInWithEmail, signInWithGoogle } from "@/lib/auth/actions"
import { firstParam, safeCallback } from "@/lib/auth/callback"
import { signupErrorMessage } from "@/lib/auth/messages"
import { readViewer } from "@/lib/auth/viewer"
import { SubmitButton } from "./SubmitButton"

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

export async function SignupForm({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [params, viewer] = await Promise.all([searchParams, readViewer()])
  const callbackUrl = safeCallback(firstParam(params.callbackUrl))
  if (viewer) redirect(callbackUrl)

  const message = signupErrorMessage(firstParam(params.error), firstParam(params.need))

  return (
    <div className="landing-enter w-full max-w-sm text-center">
      <h1 className="landing-title">Create your Nexus</h1>
      <p className="mt-3 text-[15px] text-[color:var(--land-muted)]">
        Free to start. Two extensions included. Sign in with Google, or get a magic link by email.
        No password.
      </p>

      {message ? (
        <p className="landing-alert" role="alert">
          {message}
        </p>
      ) : null}

      <form action={signInWithGoogle} className="mt-10">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <SubmitButton className="landing-google" pendingLabel="Redirecting to Google…">
          <GoogleMark />
          Continue with Google
        </SubmitButton>
      </form>

      <p className="landing-or">or</p>

      <form action={signInWithEmail}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label htmlFor="signup-email" className="sr-only">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Email address"
          className="landing-input"
        />
        <SubmitButton className="landing-primary mt-3 w-full" pendingLabel="Sending link…">
          Email me a sign-in link
        </SubmitButton>
      </form>
    </div>
  )
}
