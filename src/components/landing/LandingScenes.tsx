import { EcosystemAtlas } from "./EcosystemAtlas";
import { EditorialManifesto } from "./EditorialManifesto";
import { SingularityStage } from "./SingularityStage";
import { SystemArchitecture } from "./SystemArchitecture";

export function LandingScenes() {
  return (
    <>
      <EditorialManifesto />
      <SingularityStage />
      <SystemArchitecture />
      <EcosystemAtlas />
    </>
  );
}
