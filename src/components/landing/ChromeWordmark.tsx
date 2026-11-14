type ChromeWordmarkProps = {
  className?: string;
  size?: "nav" | "hero" | "footer";
};

const SIZE_CLASS: Record<NonNullable<ChromeWordmarkProps["size"]>, string> = {
  nav: "text-sm tracking-[0.42em] sm:text-[15px]",
  hero: "text-4xl tracking-[0.36em] sm:text-5xl md:text-6xl",
  footer: "text-xs tracking-[0.4em]",
};

/** Geometric all-caps metallic NEXUS wordmark. */
export function ChromeWordmark({
  className = "",
  size = "nav",
}: ChromeWordmarkProps) {
  return (
    <span
      className={`nexus-chrome-wordmark font-[family-name:var(--font-wordmark)] font-bold uppercase ${SIZE_CLASS[size]} ${className}`}
    >
      Nexus
    </span>
  );
}
