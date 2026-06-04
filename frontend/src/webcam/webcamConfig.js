export const webcamVideoConstraints = {
  facingMode: "user",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

export const mediaPipePoseOptions = {
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  smoothSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

export const skeletonStyle = {
  landmarkColor: "#43AA8B",
  landmarkStroke: "#FFFFFF",
  connectorColor: "#90BE6D",
  torsoColor: "#F9C74F",
  warningColor: "#F8961E",
  dangerColor: "#F94144",
  connectorWidth: 4,
  landmarkRadius: 4,
};
