import type { Metadata } from "next";
import { SignupForm } from "@/components/landing/SignupForm";

export const metadata: Metadata = {
  title: "Sign up — Nexus",
};

export default function SignupPage() {
  return <SignupForm />;
}
