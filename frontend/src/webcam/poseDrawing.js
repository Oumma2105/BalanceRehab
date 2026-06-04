import { skeletonStyle } from "./webcamConfig.js";

const torsoLandmarkIndexes = new Set([11, 12, 23, 24]);

export function drawPoseOverlay({ canvas, video, landmarks, connections }) {
  if (!canvas || !video) return;

  const width = video.videoWidth || video.clientWidth || 1280;
  const height = video.videoHeight || video.clientHeight || 720;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (!Array.isArray(landmarks) || landmarks.length === 0) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  connections.forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];
    if (!isVisible(startPoint) || !isVisible(endPoint)) return;

    const isTorso = torsoLandmarkIndexes.has(start) && torsoLandmarkIndexes.has(end);
    context.beginPath();
    context.moveTo(startPoint.x * width, startPoint.y * height);
    context.lineTo(endPoint.x * width, endPoint.y * height);
    context.strokeStyle = isTorso ? skeletonStyle.torsoColor : skeletonStyle.connectorColor;
    context.lineWidth = isTorso ? skeletonStyle.connectorWidth + 1 : skeletonStyle.connectorWidth;
    context.stroke();
  });

  landmarks.forEach((point, index) => {
    if (!isVisible(point)) return;
    const x = point.x * width;
    const y = point.y * height;
    const radius = torsoLandmarkIndexes.has(index) ? skeletonStyle.landmarkRadius + 2 : skeletonStyle.landmarkRadius;

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = torsoLandmarkIndexes.has(index) ? skeletonStyle.warningColor : skeletonStyle.landmarkColor;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = skeletonStyle.landmarkStroke;
    context.stroke();
  });

  context.restore();
}

export function clearPoseOverlay(canvas) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function isVisible(point) {
  return point && (point.visibility == null || point.visibility > 0.35);
}
