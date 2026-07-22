import { useState, useRef, useEffect, useCallback } from 'react'
import { loadModels, getDetector, matchFace, timeString, fetchJSON } from '../utils/faceApi'
import { useToast } from '../components/Toast'

export default function Dashboard() {
  const showToast = useToast()
  const [modelStatus, setModelStatus] = useState('loading')
  const [stats, setStats] = useState({ totalRegistered: 0, presentToday: 0, totalRecords: 0 })
  const [todayRecords, setTodayRecords] = useState([])
  const [detectedFaces, setDetectedFaces] = useState([])
  const [cameraActive, setCameraActive] = useState(false)
  const [users, setUsers] = useState([])

  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const lastMarkedRef = useRef({})

  const loadData = useCallback(async () => {
    const [s, t, u] = await Promise.all([
      fetchJSON('/api/stats'),
      fetchJSON('/api/attendance/today'),
      fetchJSON('/api/users'),
    ])
    setStats(s)
    setTodayRecords(t)
    setUsers(u)
  }, [])

  useEffect(() => {
    loadModels().then(ok => setModelStatus(ok ? 'loaded' : 'error'))
    loadData()
    return () => stopCamera()
  }, [])

  const markAttendance = useCallback(async (userId, name) => {
    const data = await fetchJSON('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name }),
    })
    if (!data.alreadyMarked) {
      showToast(`${name} marked present`, 'success')
      loadData()
    }
  }, [loadData, showToast])

  const startDetection = useCallback((video, overlay) => {
    const ctx = overlay.getContext('2d')
    intervalRef.current = setInterval(async () => {
      if (video.paused || video.ended) return

      const detections = await window.faceapi
        .detectAllFaces(video, getDetector())
        .withFaceLandmarks()
        .withFaceDescriptors()

      const displaySize = { width: video.videoWidth, height: video.videoHeight }
      const resized = window.faceapi.resizeResults(detections, displaySize)

      ctx.clearRect(0, 0, overlay.width, overlay.height)

      const faces = resized.map(det => {
        const box = det.detection.box
        const matched = matchFace(det.descriptor, users)
        const confidence = det.detection.score

        ctx.strokeStyle = matched ? '#10b981' : '#f59e0b'
        ctx.lineWidth = 2
        ctx.strokeRect(box.x, box.y, box.width, box.height)

        const label = matched ? `${matched.name}` : 'Unknown'
        const confLabel = `${(confidence * 100).toFixed(0)}%`
        ctx.fillStyle = matched ? '#10b981' : '#f59e0b'
        const textWidth = Math.max(ctx.measureText(label).width, ctx.measureText(confLabel).width) + 12
        ctx.fillRect(box.x, box.y - 38, textWidth, 38)
        ctx.fillStyle = '#fff'
        ctx.font = '12px Inter, sans-serif'
        ctx.fillText(label, box.x + 6, box.y - 22)
        ctx.font = '10px Inter, sans-serif'
        ctx.fillText(confLabel, box.x + 6, box.y - 8)

        const now = Date.now()
        if (matched && (!lastMarkedRef.current[matched.id] || now - lastMarkedRef.current[matched.id] > 10000)) {
          lastMarkedRef.current[matched.id] = now
          markAttendance(matched.id, matched.name)
        }

        return { matched, confidence, key: `${matched ? matched.id : 'unknown'}-${box.x.toFixed(0)}-${box.y.toFixed(0)}` }
      })

      setDetectedFaces(faces)
    }, 300)
  }, [users, markAttendance])

  const startCamera = async () => {
    if (modelStatus !== 'loaded') return showToast('Models still loading...', 'error')
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
        startDetection(video, overlay)
      }
    } catch {
      showToast('Camera access denied', 'error')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setDetectedFaces([])
    if (overlayRef.current) {
      const ctx = overlayRef.current.getContext('2d')
      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Real-time face recognition attendance</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-blue">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-info">
            <h3>{stats.totalRegistered}</h3>
            <p>Registered</p>
          </div>
        </div>
        <div className="stat-card stat-green">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div className="stat-info">
            <h3>{stats.presentToday}</h3>
            <p>Present Today</p>
          </div>
        </div>
        <div className="stat-card stat-purple">
          <div className="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div className="stat-info">
            <h3>{stats.totalRecords}</h3>
            <p>Total Records</p>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="camera-section">
          <div className="section-header">
            <h2>Camera</h2>
            <div className="model-status">
              <span className={`status-dot ${modelStatus === 'loading' ? 'loading' : modelStatus === 'error' ? 'error' : ''}`}></span>
              {modelStatus === 'loading' ? 'Loading models...' : modelStatus === 'loaded' ? 'Models loaded (SSD)' : 'Failed to load models'}
            </div>
          </div>
          <div className="camera-container">
            <video ref={videoRef} autoPlay muted playsInline></video>
            <canvas ref={overlayRef}></canvas>
            {!cameraActive && (
              <div className="camera-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <p>Click Start to begin</p>
              </div>
            )}
          </div>
          <div className="camera-controls">
            <button className="btn btn-primary" onClick={startCamera} disabled={cameraActive}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Start Camera
            </button>
            <button className="btn btn-danger" onClick={stopCamera} disabled={!cameraActive}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12"/></svg>
              Stop
            </button>
          </div>
        </div>

        <div className="results-section">
          <div className="section-header">
            <h2>Detected Faces</h2>
          </div>
          <div className="detected-faces">
            {detectedFaces.length === 0 ? (
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                <p>No faces detected</p>
              </div>
            ) : (
              detectedFaces.map(face => (
                <div key={face.key} className={`face-item${face.matched ? '' : ' unknown'}`}>
                  <div className="face-avatar">{face.matched ? face.matched.name.charAt(0) : '?'}</div>
                  <div className="face-details">
                    <div className="face-name">{face.matched ? face.matched.name : 'Unknown'}</div>
                    <div className="face-id">{face.matched ? face.matched.id : 'Not registered'}</div>
                  </div>
                  <span className={`face-badge ${face.matched ? 'badge-present' : 'badge-unknown'}`}>
                    {face.matched ? `${(face.confidence * 100).toFixed(0)}%` : 'Unknown'}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="section-header" style={{ marginTop: '1.5rem' }}>
            <h2>Today's Attendance</h2>
            <span className="badge">{todayRecords.length}</span>
          </div>
          <div className="today-list">
            {todayRecords.length === 0 ? (
              <div className="empty-state"><p>No attendance recorded yet</p></div>
            ) : (
              todayRecords.map((r, i) => (
                <div key={i} className="today-item">
                  <span className="today-item-name">{r.name}</span>
                  <span className="today-item-time">{timeString(r.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
