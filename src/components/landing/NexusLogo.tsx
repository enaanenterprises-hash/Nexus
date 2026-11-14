import Image from "next/image";
import mark from "@/assets/brand/nexus-mark.png";
import wordmark from "@/assets/brand/nexus-wordmark.png";

// Served untouched so the metallic gradients are never re-encoded; the sources are 4x+ their display size.

/** Gold three-shard mark used across the app chrome. */
export function NexusMark({ className = "" }: { className?: string }) {
  return <Image src={mark} alt="Nexus" unoptimized draggable={false} className={`select-none ${className}`} />;
}

/** Chrome NEXUS wordmark, reserved for the landing page. */
export function NexusWordmark({ className = "" }: { className?: string }) {
  return <Image src={wordmark} alt="Nexus" unoptimized preload draggable={false} className={`select-none ${className}`} />;
}
