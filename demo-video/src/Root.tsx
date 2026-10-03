import { Composition, Still } from "remotion";
import { YapFlowLaunch } from "./YapFlowLaunch";
import { Cover } from "./Cover";

export const Root = () => (<>
  <Composition
    id="YapFlowLaunch"
    component={YapFlowLaunch}
    durationInFrames={2700}
    fps={60}
    width={1920}
    height={1080}
  />
  <Still id="YapFlowPoster" component={Cover} width={1920} height={1080}/>
</>
);
