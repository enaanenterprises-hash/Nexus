import { CommandScene } from "./CommandScene";
import { NetworkScene } from "./NetworkScene";
import { SocketScene } from "./SocketScene";

export function LandingScenes() {
  return (
    <>
      <NetworkScene />
      <CommandScene />
      <SocketScene />
    </>
  );
}
