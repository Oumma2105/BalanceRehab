import { DrawingUtils } from "@mediapipe/tasks-vision";

import { holisticSkeletonStyle } from "./webcamConfig.js";

const torsoLandmarkIndexes = new Set([11, 12, 23, 24]);

export function drawHolisticOverlay({ canvas, video, holistic, connections }) {
  if (!canvas || !video) return;

  const layout = syncCanvasToVideo(canvas, video);
  const context = canvas.getContext("2d");
  if (!context) return;

  context.save();
  context.clearRect(0, 0, layout.width, layout.height);

  if (!holistic || typeof holistic !== "object") {
    context.restore();
    return;
  }

  const pose = projectLandmarks(safeLandmarks(holistic.pose), layout);
  const face = projectLandmarks(safeLandmarks(holistic.face), layout);
  const leftHand = projectLandmarks(safeLandmarks(holistic.leftHand), layout);
  const rightHand = projectLandmarks(safeLandmarks(holistic.rightHand), layout);

  context.lineCap = "round";
  context.lineJoin = "round";

  const drawingUtils = new DrawingUtils(context);
  drawFaceMesh(drawingUtils, face, connections);
  drawPose(drawingUtils, context, pose, connections?.pose);
  drawHand(drawingUtils, leftHand, connections?.hand, holisticSkeletonStyle.leftHandColor);
  drawHand(drawingUtils, rightHand, connections?.hand, holisticSkeletonStyle.rightHandColor);

  context.restore();
}

export function clearPoseOverlay(canvas) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

function syncCanvasToVideo(canvas, video) {
  const rect = video.getBoundingClientRect();
  const width = Math.max(1, rect.width || video.clientWidth || 1280);
  const height = Math.max(1, rect.height || video.clientHeight || 720);
  const canvasWidth = Math.round(width);
  const canvasHeight = Math.round(height);

  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;

  return {
    width,
    height,
    offsetX: (width - renderedWidth) / 2,
    offsetY: (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  };
}

function projectLandmarks(landmarks, layout) {
  return landmarks.map((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { x: 0, y: 0, z: 0, visibility: 0 };
    }
    return {
      ...point,
      x: (layout.offsetX + point.x * layout.renderedWidth) / layout.width,
      y: (layout.offsetY + point.y * layout.renderedHeight) / layout.height,
    };
  });
}

function drawFaceMesh(drawingUtils, landmarks, connections) {
  if (!landmarks.length) return;
  drawingUtils.drawConnectors(landmarks, normalizeConnections(connections?.face), {
    color: holisticSkeletonStyle.faceMeshColor,
    lineWidth: holisticSkeletonStyle.faceMeshWidth,
  });
  drawingUtils.drawConnectors(landmarks, normalizeConnections(connections?.faceContours), {
    color: holisticSkeletonStyle.faceContourColor,
    lineWidth: holisticSkeletonStyle.faceContourWidth,
  });
  drawingUtils.drawLandmarks(landmarks, {
    color: holisticSkeletonStyle.faceLandmarkColor,
    fillColor: holisticSkeletonStyle.faceLandmarkColor,
    lineWidth: 0,
    radius: holisticSkeletonStyle.faceLandmarkRadius,
  });
}

function drawPose(drawingUtils, context, landmarks, connections) {
  if (!landmarks.length) return;
  const normalizedConnections = normalizeConnections(connections);
  drawingUtils.drawConnectors(landmarks, normalizedConnections, {
    color: holisticSkeletonStyle.poseConnectorColor,
    lineWidth: holisticSkeletonStyle.poseConnectorWidth,
  });

  drawTorsoEmphasis(context, landmarks);

  drawingUtils.drawLandmarks(landmarks, {
    color: holisticSkeletonStyle.landmarkStroke,
    fillColor: holisticSkeletonStyle.poseLandmarkColor,
    lineWidth: 2,
    radius: (point) => (torsoLandmarkIndexes.has(point.index) ? holisticSkeletonStyle.poseLandmarkRadius + 2 : holisticSkeletonStyle.poseLandmarkRadius),
  });
}

function drawTorsoEmphasis(context, landmarks) {
  [
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
  ].forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];
    if (!isVisible(startPoint) || !isVisible(endPoint)) return;
    drawLine(context, startPoint, endPoint, {
      strokeStyle: holisticSkeletonStyle.torsoColor,
      lineWidth: holisticSkeletonStyle.poseConnectorWidth + 2,
    });
  });
}

function drawHand(drawingUtils, landmarks, connections, color) {
  if (!landmarks.length) return;
  drawingUtils.drawConnectors(landmarks, normalizeConnections(connections), {
    color,
    lineWidth: holisticSkeletonStyle.handConnectorWidth,
  });
  drawingUtils.drawLandmarks(landmarks, {
    color: holisticSkeletonStyle.landmarkStroke,
    fillColor: color,
    lineWidth: 1.5,
    radius: holisticSkeletonStyle.handLandmarkRadius,
  });
}

function drawLine(context, startPoint, endPoint, { strokeStyle, lineWidth }) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  context.beginPath();
  context.moveTo(startPoint.x * width, startPoint.y * height);
  context.lineTo(endPoint.x * width, endPoint.y * height);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
}

function normalizeConnections(connections) {
  if (!Array.isArray(connections)) return [];
  return connections
    .map((connection) => {
      if (Array.isArray(connection) && connection.length >= 2) {
        return { start: connection[0], end: connection[1] };
      }
      if (connection && Number.isInteger(connection.start) && Number.isInteger(connection.end)) {
        return { start: connection.start, end: connection.end };
      }
      return null;
    })
    .filter(Boolean);
}

function isVisible(point, minVisibility = 0.35) {
  return point && (point.visibility == null || point.visibility > minVisibility);
}

function safeLandmarks(landmarks) {
  return Array.isArray(landmarks) ? landmarks : [];
}
