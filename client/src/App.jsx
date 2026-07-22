import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Register from './pages/Register'
import Attendance from './pages/Attendance'
import './App.css'

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/register" element={<Register />} />
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>FaceTrack Attendance System &copy; 2026</p>
      </footer>
    </>
  )
}
