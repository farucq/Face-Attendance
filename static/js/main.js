const FaceAttendance = {
    video: null,
    stream: null,
    
    init() {
        this.video = document.getElementById('video');
    },
    
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            this.video.srcObject = this.stream;
            return true;
        } catch (err) {
            console.error('Camera error:', err);
            throw err;
        }
    },
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
            this.stream = null;
        }
    },
    
    captureFrame() {
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        canvas.getContext('2d').drawImage(this.video, 0, 0);
        return canvas;
    },
    
    async recognizeFace(canvas) {
        return new Promise((resolve) => {
            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('image', blob, 'capture.jpg');
                
                try {
                    const response = await fetch('/api/recognize', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    resolve(data);
                } catch (err) {
                    console.error('Recognition error:', err);
                    resolve({ faces: [] });
                }
            }, 'image/jpeg', 0.9);
        });
    },
    
    async getStats() {
        try {
            const response = await fetch('/api/stats');
            return await response.json();
        } catch (err) {
            console.error('Stats error:', err);
            return { total_registered: 0, present_today: 0, total_records: 0 };
        }
    },
    
    async getTodayAttendance() {
        try {
            const response = await fetch('/api/attendance/today');
            return await response.json();
        } catch (err) {
            console.error('Attendance error:', err);
            return [];
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceAttendance;
}
