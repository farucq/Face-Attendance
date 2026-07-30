import { useState, useRef, useEffect, useCallback } from 'react'
import { loadModels, fetchJSON } from '../utils/faceApi'
import { useToast } from '../components/Toast'

const SAMPLES_NEEDED = 5

export default function Register() {
  const showToast = useToast()
  const [users, setUsers] = useState([])
  const [cameraActive, setCameraActive] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [userId, setUserId] = useState('')
  const [captureCount, setCaptureCount] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)

  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const capturedBlobRef = useRef(null)
  const capturedDescriptorsRef = useRef([])

  const loadUsers = useCallback(async () => {
    const u = await fetchJSON('/api/users')
    setUsers(u)
  }, [])

  useEffect(() => {
    loadUsers()
    return () => stopCamera()
  }, [])

  const startCamera = async () => {
    const ok = await loadModels()
    if (!ok) return showToast('Failed to load face detection models', 'error')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      setCameraActive(true)

      video.onloadedmetadata = () => {
        const overlay = overlayRef.current
        overlay.width = video.videoWidth
        overlay.height = video.videoHeight
        startRegDetection(video, overlay)
      }
    } catch {
      showToast('Camera access denied', 'error')
    }
  }

  const startRegDetection = (video, overlay) => {
    const ctx = overlay.getContext('2d')
    intervalRef.current = setInterval(async () => {
      if (video.paused || video.ended) return
      try {
        const detections = await window.faceapi
          .detectAllFaces(video, new window.faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
          .withFaceLandmarks()

        const displaySize = { width: video.videoWidth, height: video.videoHeight }
        const resized = window.faceapi.resizeResults(detections, displaySize)

        ctx.clearRect(0, 0, overlay.width, overlay.height)
        resized.forEach(det => {
          const box = det.detection.box
          ctx.strokeStyle = '#4f46e5'
          ctx.lineWidth = 2
          ctx.strokeRect(box.x, box.y, box.width, box.height)
          ctx.strokeStyle = 'rgba(79,70,229,0.3)'
          ctx.lineWidth = 1
          ctx.strokeRect(box.x + 4, box.y + 4, box.width - 8, box.height - 8)
          const conf = `${(det.detection.score * 100).toFixed(0)}%`
          ctx.fillStyle = 'rgba(79,70,229,0.9)'
          ctx.fillRect(box.x, box.y - 18, 40, 18)
          ctx.fillStyle = '#fff'
          ctx.font = '10px Inter, sans-serif'
          ctx.fillText(conf, box.x + 4, box.y - 5)
        })
      } catch {}
    }, 200)
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  const captureMultiple = async () => {
    const video = videoRef.current
    if (!video.srcObject) return showToast('Camera not started', 'error')

    setIsCapturing(true)
    capturedDescriptorsRef.current = []
    setCaptureCount(0)

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx2d = canvas.getContext('2d')

    let captured = 0
    let attempts = 0
    const maxAttempts = 30

    const captureFrame = async () => {
      if (captured >= SAMPLES_NEEDED || attempts >= maxAttempts) return

      ctx2d.drawImage(video, 0, 0)

      try {
        const detection = await window.faceapi
          .detectSingleFace(canvas, new window.faceapi.SsdMobilenetv1Options({ minConfidence: 0.7 }))
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (detection) {
          capturedDescriptorsRef.current.push(Array.from(detection.descriptor))
          captured++
          setCaptureCount(captured)
        }
      } catch {}

      attempts++
      if (captured < SAMPLES_NEEDED && attempts < maxAttempts) {
        setTimeout(captureFrame, 250)
      } else {
        if (capturedDescriptorsRef.current.length === 0) {
          showToast('No face detected across all attempts. Ensure good lighting and face the camera.', 'error')
          setIsCapturing(false)
          return
        }

        ctx2d.drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
          capturedBlobRef.current = blob
          setPreviewUrl(URL.createObjectURL(blob))
          setCaptured(true)
          setIsCapturing(false)
          stopCamera()
          showToast(`${capturedDescriptorsRef.current.length} face samples captured!`, 'success')
        }, 'image/jpeg', 0.95)
      }
    }

    captureFrame()
  }

  const retake = () => {
    capturedBlobRef.current = null
    capturedDescriptorsRef.current = []
    setPreviewUrl(null)
    setCaptured(false)
    setCaptureCount(0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!capturedBlobRef.current) return showToast('Please capture a photo first', 'error')
    const trimmedName = name.trim()
    const trimmedId = userId.trim()
    if (!trimmedName || !trimmedId) return showToast('Fill in all fields', 'error')
    if (capturedDescriptorsRef.current.length === 0) return showToast('No face descriptor. Retake the photo.', 'error')

    setSubmitting(true)
    const formData = new FormData()
    formData.append('name', trimmedName)
    formData.append('id', trimmedId)
    formData.append('image', capturedBlobRef.current, 'face.jpg')
    formData.append('descriptors', JSON.stringify(capturedDescriptorsRef.current))

    try {
      const res = await fetch('/api/register', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        showToast(data.message, 'success')
        setName('')
        setUserId('')
        retake()
        loadUsers()
      } else {
        showToast(data.error, 'error')
      }
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Register New User</h1>
        <p className="page-subtitle">Capture multiple face samples for accurate recognition</p>
      </div>

      <div className="register-layout">
        <div className="register-form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="user-name">Full Name</label>
              <input type="text" id="user-name" placeholder="e.g. John Doe" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="user-id">Employee / Student ID</label>
              <input type="text" id="user-id" placeholder="e.g. EMP001" required value={userId} onChange={e => setUserId(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Face Photo ({captureCount}/{SAMPLES_NEEDED} samples)</label>
              <div className="photo-capture-area">
                <div className="photo-preview-container">
                  {previewUrl ? (
                    <img className="photo-preview" src={previewUrl} alt="Captured face" />
                  ) : (
                    <div className="photo-placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <p>No photo captured</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={!captured || submitting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              {submitting ? 'Registering...' : 'Register User'}
            </button>
          </form>
        </div>

        <div className="capture-card">
          <div className="section-header">
            <h2>Capture Photo</h2>
            {isCapturing && <span className="badge">{captureCount}/{SAMPLES_NEEDED}</span>}
          </div>
          <div className="camera-container">
            <video ref={videoRef} autoPlay muted playsInline></video>
            <canvas ref={overlayRef}></canvas>
            {!cameraActive && !captured && (
              <div className="camera-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <p>Start camera to capture</p>
              </div>
            )}
            {isCapturing && (
              <div className="camera-placeholder" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <p style={{ color: '#fff', fontWeight: 600 }}>Capturing sample {captureCount}/{SAMPLES_NEEDED}...</p>
                <p style={{ color: '#ddd', fontSize: '0.75rem' }}>Keep your face steady and well-lit</p>
              </div>
            )}
          </div>
          <div className="camera-controls">
            {!captured && !isCapturing && (
              <>
                <button className="btn btn-secondary" onClick={startCamera} disabled={cameraActive}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Start
                </button>
                <button className="btn btn-success" onClick={captureMultiple} disabled={!cameraActive}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Capture 5 Samples
                </button>
              </>
            )}
            {!captured && isCapturing && (
              <button className="btn btn-danger" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12"/></svg>
                Capturing...
              </button>
            )}
            {captured && (
              <button className="btn btn-secondary" onClick={retake}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Retake
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="registered-users-card">
        <div className="section-header">
          <h2>Registered Users</h2>
          <span className="badge">{users.length}</span>
        </div>
        <div className="users-grid">
          {users.length === 0 ? (
            <div className="empty-state"><p>No users registered yet</p></div>
          ) : (
            users.map(u => {
              const photoSrc = u.photo
                ? u.photo.startsWith('/api/') ? u.photo : `/api${u.photo}`
                : '';
              return (
              <div key={u.id} className="user-card">
                <img src={photoSrc} alt={u.name} onError={e => e.target.style.display = 'none'} />
                <div className="user-card-info">
                  <div className="user-card-name">{u.name}</div>
                  <div className="user-card-id">{u.id}</div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </>
  )
}
