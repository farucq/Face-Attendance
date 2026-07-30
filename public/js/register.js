const MODEL_URL = '/models';
let regStream = null;
let capturedBlob = null;
let capturedDescriptor = null;
let regDetectInterval = null;
let modelsReady = false;
let editingId = null;

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

async function ensureModels() {
    if (modelsReady) return true;
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        modelsReady = true;
        return true;
    } catch (err) {
        console.error('Model load error:', err);
        showToast('Failed to load face detection models', 'error');
        return false;
    }
}

/* Camera */
document.getElementById('btn-reg-start').addEventListener('click', async () => {
    const ok = await ensureModels();
    if (!ok) return;

    try {
        regStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
        const video = document.getElementById('reg-video');
        video.srcObject = regStream;
        document.getElementById('reg-placeholder').style.display = 'none';
        document.getElementById('btn-reg-start').disabled = true;
        document.getElementById('btn-capture').disabled = false;

        video.onloadedmetadata = () => {
            const overlay = document.getElementById('reg-overlay');
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            startRegDetection(video, overlay);
        };
    } catch (err) {
        showToast('Camera access denied', 'error');
    }
});

async function startRegDetection(video, overlay) {
    const ctx = overlay.getContext('2d');

    regDetectInterval = setInterval(async () => {
        if (video.paused || video.ended || !modelsReady) return;
        try {
            const detections = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
                .withFaceLandmarks();

            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            const resized = faceapi.resizeResults(detections, displaySize);

            ctx.clearRect(0, 0, overlay.width, overlay.height);
            resized.forEach(det => {
                const box = det.detection.box;
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                ctx.strokeStyle = 'rgba(79,70,229,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(box.x + 4, box.y + 4, box.width - 8, box.height - 8);
            });
        } catch (e) { /* skip frame on error */ }
    }, 200);
}

/* Capture */
document.getElementById('btn-capture').addEventListener('click', async () => {
    if (!modelsReady) {
        showToast('Models still loading, please wait...', 'error');
        return;
    }

    const video = document.getElementById('reg-video');
    if (!video.srcObject) {
        showToast('Camera not started', 'error');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    if (regDetectInterval) clearInterval(regDetectInterval);
    if (regStream) {
        regStream.getTracks().forEach(t => t.stop());
        regStream = null;
    }

    let detection = null;
    try {
        detection = await faceapi
            .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
    } catch (err) {
        console.error('Detection error:', err);
    }

    if (!detection) {
        showToast('No face detected. Position your face in the center with good lighting.', 'error');
        document.getElementById('btn-reg-start').disabled = false;
        document.getElementById('btn-capture').style.display = 'inline-flex';
        return;
    }

    capturedDescriptor = Array.from(detection.descriptor);

    canvas.toBlob((blob) => {
        capturedBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('photo-preview').src = url;
        document.getElementById('photo-preview').style.display = 'block';
        document.getElementById('photo-placeholder').style.display = 'none';
        document.getElementById('btn-register').disabled = false;
        document.getElementById('btn-capture').style.display = 'none';
        document.getElementById('btn-retake').style.display = 'inline-flex';
        showToast('Face captured successfully!', 'success');
    }, 'image/jpeg', 0.92);
});

document.getElementById('btn-retake').addEventListener('click', () => {
    capturedBlob = null;
    capturedDescriptor = null;
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-placeholder').style.display = 'flex';
    document.getElementById('btn-register').disabled = true;
    document.getElementById('btn-capture').style.display = 'inline-flex';
    document.getElementById('btn-retake').style.display = 'none';
    document.getElementById('btn-reg-start').disabled = false;
});

function resetForm() {
    capturedBlob = null;
    capturedDescriptor = null;
    editingId = null;
    document.getElementById('user-name').value = '';
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-placeholder').style.display = 'flex';
    document.getElementById('btn-register').disabled = true;
    document.getElementById('btn-register').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> Register';
    document.getElementById('btn-capture').style.display = 'inline-flex';
    document.getElementById('btn-retake').style.display = 'none';
    document.getElementById('btn-reg-start').disabled = false;
    document.getElementById('btn-cancel-edit').style.display = 'none';
    document.getElementById('page-title').textContent = 'Register New User';
    document.getElementById('photo-label-hint').textContent = '';
}

function startEdit(user) {
    editingId = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('page-title').textContent = 'Update User';
    document.getElementById('photo-label-hint').textContent = '(optional — leave empty to keep existing)';
    document.getElementById('btn-register').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Update User';
    document.getElementById('btn-cancel-edit').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Register / Update */
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!capturedBlob && !editingId) return showToast('Please capture a photo first', 'error');

    const name = document.getElementById('user-name').value.trim();
    if (!name) return showToast('Fill in name', 'error');
    if (!editingId && !capturedDescriptor) return showToast('No face descriptor. Retake the photo.', 'error');

    const formData = new FormData();
    formData.append('name', name);
    if (capturedBlob) {
        formData.append('image', capturedBlob, 'face.jpg');
        formData.append('descriptor', JSON.stringify(capturedDescriptor));
    }

    const url = editingId ? `/api/users/${editingId}` : '/api/register';
    const method = editingId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, { method, body: formData });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            resetForm();
            loadUsers();
        } else if (data.matched) {
            showToast('Already registered: ' + data.user.name + ' (' + data.user.id + '). Duplicate not allowed.', 'error');
            resetForm();
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) {
        showToast(err.message || 'Operation failed', 'error');
    }
});

document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);

async function deleteUser(id, name) {
    if (!confirm('Delete ' + name + ' (' + id + ')? This cannot be undone.')) return;
    try {
        const res = await fetch('/api/users/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            if (editingId === id) resetForm();
            loadUsers();
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) {
        showToast(err.message || 'Delete failed', 'error');
    }
}

async function loadUsers() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const grid = document.getElementById('users-grid');
    const count = document.getElementById('user-count');
    count.textContent = users.length;

    if (users.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No users registered yet</p></div>';
        return;
    }

    grid.innerHTML = users.map(u => {
        const photoSrc = u.photo
            ? u.photo.startsWith('/api/') ? u.photo : `/api${u.photo}`
            : '';
        return `
        <div class="user-card" data-id="${u.id}">
            <img src="${photoSrc}" alt="${u.name}" onerror="this.style.display='none'">
            <div class="user-card-info">
                <div class="user-card-name">${u.name}</div>
                <div class="user-card-id">${u.id}</div>
            </div>
            <div class="user-card-actions">
                <button class="btn-icon btn-icon-edit" title="Edit" onclick="startEdit(${JSON.stringify(u).replace(/'/g, "\\'")})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon btn-icon-delete" title="Delete" onclick="deleteUser('${u.id}','${u.name.replace(/'/g, "\\'")}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', loadUsers);