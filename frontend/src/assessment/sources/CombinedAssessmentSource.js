import { acquisitionModeLabels, acquisitionModes } from "../assessmentModel.js";

export class CombinedAssessmentSource {
  constructor({ config, t }) {
    this.config = config;
    this.t = t;
  }

  start() {
    return false;
  }

  getFrame() {
    return null;
  }

  getResults() {
    return null;
  }

  stop() {
    return true;
  }

  getStream() {
    return null;
  }

  static metadata(t = {}) {
    return {
      mode: acquisitionModes.combined,
      label: t.combinedAssessmentMode ?? acquisitionModeLabels[acquisitionModes.combined],
      description: t.combinedAssessmentModeDesc ?? "Future combined webcam posture and ESP32 board sensor acquisition.",
      availableNow: false,
    };
  }
}
