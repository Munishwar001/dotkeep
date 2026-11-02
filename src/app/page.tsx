import { Suspense } from "react";
import LandingPage from "@/modules/landing/landing-page";
import { RedirectIfSignedIn } from "@/modules/auth/redirect-if-signed-in";

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <LandingPage />
    </>
  );
}
