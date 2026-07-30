const MODEL_URL = '/models';
let modelsLoaded = false;
let users = [];

async function loadModels() {
    const statusEl = document.getElementById('model-status');
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        modelsLoaded = true;
        statusEl.innerHTML = '<span class="status-dot"></span>Models loaded';
    } catch (err) {
        statusEl.innerHTML = '<span class="status-dot error"></span>Failed to load models';
        console.error('Model load error:', err);
    }
}

async function fetchUsers() {
    const res = await fetch('/api/users');
    users = await res.json();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function timeString(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadStats() {
    const res = await fetch('/api/stats');
    const s = await res.json();
    document.getElementById('stat-registered').textContent = s.totalRegistered;
    document.getElementById('stat-present').textContent = s.presentToday;
    document.getElementById('stat-total').textContent = s.totalRecords;
}

async function loadToday() {
    const res = await fetch('/api/attendance/today');
    const records = await res.json();
    const list = document.getElementById('today-list');
    const count = document.getElementById('today-count');
    count.textContent = records.length;

    if (records.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No attendance recorded yet</p></div>';
        return;
    }

    list.innerHTML = records.map(r => `
        <div class="today-item">
            <span class="today-item-name">${r.name}</span>
            <span class="today-item-time">${timeString(r.timestamp)}</span>
        </div>
    `).join('');
}

/* ---------- Dashboard Camera ---------- */
let videoStream = null;
let detectInterval = null;

document.getElementById('btn-start').addEventListener('click', async () => {
    if (!modelsLoaded) return showToast('Models still loading...', 'error');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        const video = document.getElementById('video');
        video.srcObject = videoStream;
        document.getElementById('camera-placeholder').style.display = 'none';
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-stop').disabled = false;

        video.onloadedmetadata = () => {
            const overlay = document.getElementById('overlay');
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            startDetection(video, overlay);
        };
    } catch (err) {
        showToast('Camera access denied', 'error');
    }
});

document.getElementById('btn-stop').addEventListener('click', stopCamera);

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
    }
    if (detectInterval) clearInterval(detectInterval);
    const video = document.getElementById('video');
    video.srcObject = null;
    document.getElementById('camera-placeholder').style.display = 'flex';
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    const overlay = document.getElementById('overlay');
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
}

async function startDetection(video, overlay) {
    const ctx = overlay.getContext('2d');
    detectInterval = setInterval(async () => {
        if (video.paused || video.ended) return;

        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        const resized = faceapi.resizeResults(detections, displaySize);

        ctx.clearRect(0, 0, overlay.width, overlay.height);

        resized.forEach(det => {
            const box = det.detection.box;
            const matched = matchFace(det.descriptor);

            ctx.strokeStyle = matched ? '#10b981' : '#f59e0b';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            const label = matched ? matched.name : 'Unknown';
            ctx.fillStyle = matched ? '#10b981' : '#f59e0b';
            ctx.fillRect(box.x, box.y - 22, ctx.measureText(label).width + 12, 22);
            ctx.fillStyle = '#fff';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(label, box.x + 6, box.y - 6);
        });

        updateDetectedFaces(resized);
    }, 300);
}

function matchFace(descriptor) {
    let bestMatch = null;
    let bestDist = 0.6;

    for (const user of users) {
        const samples = user.descriptors && user.descriptors.length > 0
            ? user.descriptors
            : user.descriptor
                ? [user.descriptor]
                : [];
        for (const sample of samples) {
            const dist = faceapi.euclideanDistance(descriptor, new Float32Array(sample));
            if (dist < bestDist) {
                bestDist = dist;
                bestMatch = user;
            }
        }
    }
    return bestMatch;
}

let lastMarked = {};

function updateDetectedFaces(detections) {
    const container = document.getElementById('detected-faces');
    if (detections.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No faces detected</p></div>';
        return;
    }

    container.innerHTML = detections.map(det => {
        const matched = matchFace(det.descriptor);
        const now = Date.now();

        if (matched && (!lastMarked[matched.id] || now - lastMarked[matched.id] > 10000)) {
            lastMarked[matched.id] = now;
            markAttendance(matched.id, matched.name);
        }

        if (matched) {
            return `
                <div class="face-item">
                    <div class="face-avatar">${matched.name.charAt(0)}</div>
                    <div class="face-details">
                        <div class="face-name">${matched.name}</div>
                        <div class="face-id">${matched.id}</div>
                    </div>
                    <span class="face-badge badge-present">Present</span>
                </div>`;
        }
        return `
            <div class="face-item unknown">
                <div class="face-avatar">?</div>
                <div class="face-details">
                    <div class="face-name">Unknown</div>
                    <div class="face-id">Not registered</div>
                </div>
                <span class="face-badge badge-unknown">Unknown</span>
            </div>`;
    }).join('');
}

async function markAttendance(userId, name) {
    const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name })
    });
    const data = await res.json();
    if (!data.alreadyMarked) {
        showToast(`${name} marked present`, 'success');
        loadStats();
        loadToday();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadModels(), fetchUsers()]);
    loadStats();
    loadToday();
});
