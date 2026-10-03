import {Composition} from 'remotion';
import {YapFlowLaunch} from './YapFlowLaunch';

export const Root = () => (
  <Composition
    id="YapFlowLaunch"
    component={YapFlowLaunch}
    durationInFrames={1500}
    fps={30}
    width={1920}
    height={1080}
  />
);
