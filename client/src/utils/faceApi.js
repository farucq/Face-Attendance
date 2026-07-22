const MODEL_URL = '/models'
let modelsLoaded = false

export const DETECTION_OPTIONS = {
  TinyFace: { inputSize: 416, scoreThreshold: 0.6 },
  SSD: { minConfidence: 0.6 },
}

export const MATCH_TOLERANCE = 0.45

export async function loadModels() {
  if (modelsLoaded) return true
  try {
    await window.faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)
    await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    await window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    await window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    modelsLoaded = true
    return true
  } catch (err) {
    console.error('Model load error:', err)
    return false
  }
}

export function getDetector() {
  if (window.faceapi.nets.ssdMobilenetv1.isLoaded) {
    return new window.faceapi.SsdMobilenetv1Options(DETECTION_OPTIONS.SSD)
  }
  return new window.faceapi.TinyFaceDetectorOptions(DETECTION_OPTIONS.TinyFace)
}

export function matchFace(descriptor, users) {
  let bestMatch = null
  let bestDist = MATCH_TOLERANCE

  for (const user of users) {
    const descriptors = user.descriptors || (user.descriptor ? [user.descriptor] : [])
    if (descriptors.length === 0) continue

    for (const stored of descriptors) {
      const dist = window.faceapi.euclideanDistance(descriptor, new Float32Array(stored))
      if (dist < bestDist) {
        bestDist = dist
        bestMatch = user
      }
    }
  }
  return bestMatch
}

export function timeString(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export async function fetchJSON(url, options) {
  const res = await fetch(url, options)
  return res.json()
}
