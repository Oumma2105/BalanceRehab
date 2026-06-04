import { acquisitionModes } from "../assessmentModel.js";
import { BoardAssessmentSource } from "./BoardAssessmentSource.js";
import { CombinedAssessmentSource } from "./CombinedAssessmentSource.js";
import { DemoAssessmentSource } from "./DemoAssessmentSource.js";
import { WebcamAssessmentSource } from "./WebcamAssessmentSource.js";

const sourceMap = {
  [acquisitionModes.webcam]: WebcamAssessmentSource,
  [acquisitionModes.demo]: DemoAssessmentSource,
  [acquisitionModes.combined]: CombinedAssessmentSource,
  [acquisitionModes.board]: BoardAssessmentSource,
};

export function createAssessmentSource({ mode, config, t }) {
  const Source = sourceMap[mode] ?? WebcamAssessmentSource;
  return new Source({ config, t });
}

export function getAssessmentSourceOptions(t) {
  return [
    WebcamAssessmentSource.metadata(t),
    DemoAssessmentSource.metadata(t),
    CombinedAssessmentSource.metadata(t),
    BoardAssessmentSource.metadata(t),
  ];
}

export { acquisitionModes };
