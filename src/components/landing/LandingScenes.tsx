import { ArchitecturePrinciple } from "./ArchitecturePrinciple";
import { IntegrationsAtlas } from "./EcosystemAtlas";
import { EditorialManifesto } from "./EditorialManifesto";
import { LightfallTransition } from "./LightfallTransition";
import { NodePlatformSection } from "./NodePlatformSection";
import { SecurityAndBetaClose } from "./SecurityAndBetaClose";
import { SingularityStage } from "./SingularityStage";
import { WorkflowsShowcase } from "./WorkflowsShowcase";

export function LandingScenes() {
  return (
    <>
      <EditorialManifesto />
      <LightfallTransition />
      <div id="dark-realm" data-obsidian-band="true" className="landing-obsidian">
        <SingularityStage />
        <IntegrationsAtlas />
        <NodePlatformSection />
        <WorkflowsShowcase />
        <ArchitecturePrinciple />
        <SecurityAndBetaClose />
      </div>
    </>
  );
}
