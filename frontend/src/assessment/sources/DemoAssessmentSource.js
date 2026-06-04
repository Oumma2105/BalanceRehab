import { acquisitionModeLabels, acquisitionModes, normalizeAssessmentResults } from "../assessmentModel.js";
import { generateLiveFrame, simulateAssessmentResults } from "../../utils/assessment.js";

export class DemoAssessmentSource {
  constructor({ config, t }) {
    this.config = config;
    this.t = t;
  }

  start() {
    return true;
  }

  getFrame(progress) {
    return generateLiveFrame(progress, this.t, acquisitionModes.demo);
  }

  getResults() {
    return normalizeAssessmentResults(
      simulateAssessmentResults(
        {
          ...this.config,
          acquisitionMode: acquisitionModes.demo,
        },
        this.t,
      ),
    );
  }

  stop() {
    return true;
  }

  getStream() {
    return null;
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.demo,
      label: t.demoAssessmentMode ?? acquisitionModeLabels[acquisitionModes.demo],
      description: t.demoAssessmentModeDesc ?? "Simulated posture and board data for presentation.",
      availableNow: true,
    };
  }
}
