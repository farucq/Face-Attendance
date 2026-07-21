import os
import cv2
import numpy as np
import face_recognition
import pickle
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/faces'
app.config['ENCODINGS_FILE'] = 'data/encodings.pkl'
app.config['ATTENDANCE_FILE'] = 'data/attendance.csv'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('data', exist_ok=True)

def load_encodings():
    if os.path.exists(app.config['ENCODINGS_FILE']):
        with open(app.config['ENCODINGS_FILE'], 'rb') as f:
            return pickle.load(f)
    return {'encodings': [], 'names': [], 'ids': []}

def save_encodings(data):
    with open(app.config['ENCODINGS_FILE'], 'wb') as f:
        pickle.dump(data, f)

def log_attendance(name, user_id, status):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(app.config['ATTENDANCE_FILE'], 'a') as f:
        f.write(f'{timestamp},{name},{user_id},{status}\n')

def get_attendance_history():
    if not os.path.exists(app.config['ATTENDANCE_FILE']):
        return []
    records = []
    with open(app.config['ATTENDANCE_FILE'], 'r') as f:
        for line in f.readlines():
            parts = line.strip().split(',')
            if len(parts) == 4:
                records.append({
                    'timestamp': parts[0],
                    'name': parts[1],
                    'id': parts[2],
                    'status': parts[3]
                })
    return list(reversed(records))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name')
        user_id = request.form.get('id')
        file = request.files.get('image')
        
        if not name or not user_id or not file:
            return jsonify({'error': 'All fields are required'}), 400
        
        filename = secure_filename(f'{user_id}_{name}.jpg')
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        image = face_recognition.load_image_file(filepath)
        encodings = face_recognition.face_encodings(image)
        
        if len(encodings) == 0:
            os.remove(filepath)
            return jsonify({'error': 'No face detected in image'}), 400
        
        data = load_encodings()
        data['encodings'].append(encodings[0])
        data['names'].append(name)
        data['ids'].append(user_id)
        save_encodings(data)
        
        return jsonify({'success': True, 'message': f'{name} registered successfully'})
    
    return render_template('register.html')

@app.route('/attendance')
def attendance():
    history = get_attendance_history()
    return render_template('attendance.html', history=history)

@app.route('/api/recognize', methods=['POST'])
def recognize():
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image provided'}), 400
    
    image_bytes = file.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    face_locations = face_recognition.face_locations(rgb_image)
    face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
    
    data = load_encodings()
    results = []
    
    for encoding in face_encodings:
        matches = face_recognition.compare_faces(data['encodings'], encoding, tolerance=0.6)
        name = "Unknown"
        user_id = "Unknown"
        confidence = 0
        
        if True in matches:
            face_distances = face_recognition.face_distance(data['encodings'], encoding)
            best_match_index = np.argmin(face_distances)
            
            if matches[best_match_index]:
                name = data['names'][best_match_index]
                user_id = data['ids'][best_match_index]
                confidence = 1 - face_distances[best_match_index]
                
                log_attendance(name, user_id, 'Present')
        
        results.append({
            'name': name,
            'id': user_id,
            'confidence': float(confidence)
        })
    
    return jsonify({'faces': results})

@app.route('/api/attendance/today')
def today_attendance():
    today = datetime.now().strftime('%Y-%m-%d')
    records = get_attendance_history()
    today_records = [r for r in records if r['timestamp'].startswith(today)]
    return jsonify(today_records)

@app.route('/api/stats')
def stats():
    today = datetime.now().strftime('%Y-%m-%d')
    records = get_attendance_history()
    today_records = [r for r in records if r['timestamp'].startswith(today)]
    data = load_encodings()
    
    return jsonify({
        'total_registered': len(data['ids']),
        'present_today': len(set(r['id'] for r in today_records)),
        'total_records': len(records)
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
