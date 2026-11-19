import { IntegrationsAtlas, SecurityAndWaitlist } from "./EcosystemAtlas";
import { EditorialManifesto } from "./EditorialManifesto";
import { LightfallTransition } from "./LightfallTransition";
import { SingularityStage } from "./SingularityStage";
import { SystemArchitecture } from "./SystemArchitecture";

export function LandingScenes() {
  return (
    <>
      <EditorialManifesto />
      <LightfallTransition />
      <div id="dark-realm" data-obsidian-band="true" className="landing-obsidian">
        <SingularityStage />
        <IntegrationsAtlas />
        <SystemArchitecture />
        <SecurityAndWaitlist />
      </div>
    </>
  );
}
