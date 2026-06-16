export const webcamVideoConstraints = {
  facingMode: "user",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

export const holisticTrackingConfig = {
  wasmBaseUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  options: {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minHandLandmarksConfidence: 0.45,
    outputFaceBlendshapes: true,
    outputPoseSegmentationMasks: false,
  },
};

export const holisticSkeletonStyle = {
  landmarkStroke: "#FFFFFF",
  poseLandmarkColor: "#43AA8B",
  poseConnectorColor: "rgba(144, 190, 109, 0.92)",
  torsoColor: "#F9C74F",
  warningColor: "#F8961E",
  leftHandColor: "rgba(87, 117, 144, 0.96)",
  rightHandColor: "rgba(249, 65, 68, 0.92)",
  faceMeshColor: "rgba(125, 211, 252, 0.24)",
  faceContourColor: "rgba(249, 199, 79, 0.76)",
  faceLandmarkColor: "rgba(255, 255, 255, 0.38)",
  poseConnectorWidth: 5,
  poseLandmarkRadius: 4.5,
  handConnectorWidth: 3.25,
  handLandmarkRadius: 2.75,
  faceMeshWidth: 1,
  faceLandmarkRadius: 0.85,
  faceContourWidth: 2,
};
