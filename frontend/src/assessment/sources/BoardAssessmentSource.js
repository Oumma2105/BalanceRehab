import { acquisitionModeLabels, acquisitionModes } from "../assessmentModel.js";

export class BoardAssessmentSource {
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
      mode: acquisitionModes.board,
      label: t.boardAssessmentMode ?? acquisitionModeLabels[acquisitionModes.board],
      description: t.boardAssessmentModeDesc ?? "ESP32 board sensor acquisition planned as an optional hardware mode.",
      availableNow: false,
    };
  }
}
