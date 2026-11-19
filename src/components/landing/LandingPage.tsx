import { FloatingWaitlistPill } from "./FloatingWaitlistPill";
import { GalleryFooter } from "./GalleryFooter";
import { HeroStage } from "./HeroStage";
import { LandingScenes } from "./LandingScenes";

export function LandingPage() {
  return (
    <div className="landing-gallery flex min-h-[100svh] flex-1 flex-col">
      <main className="flex flex-col">
        <HeroStage />
        <LandingScenes />
      </main>
      <GalleryFooter />
      <FloatingWaitlistPill />
    </div>
  );
}
