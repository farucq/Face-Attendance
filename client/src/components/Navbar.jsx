import { useState, useCallback } from 'react'
import { NavLink } from 'react-router-dom'

export default function Navbar() {
  const [open, setOpen] = useState(false)

  const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`

  const handleNavClick = useCallback(() => setOpen(false), [])

  return (
    <>
      <nav className="navbar">
        <div className="nav-brand">
          <svg className="logo-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" fill="currentColor"/>
            <path d="M15 11.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" fill="currentColor"/>
            <path d="M7 4a5 5 0 0 1 10 0v1a5 5 0 0 1-10 0V4z"/>
            <path d="M3 21h18"/>
            <path d="M5 21V19a7 7 0 0 1 14 0v2"/>
          </svg>
          <span className="brand-name">FaceTrack</span>
        </div>
        <button className="nav-toggle" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className={`nav-links${open ? ' open' : ''}`}>
          <NavLink to="/" className={linkClass} onClick={handleNavClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Dashboard
          </NavLink>
          <NavLink to="/register" className={linkClass} onClick={handleNavClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Register
          </NavLink>
          <NavLink to="/attendance" className={linkClass} onClick={handleNavClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Attendance
          </NavLink>
        </div>
      </nav>

      <nav className="mobile-bottom-nav">
        <NavLink to="/" className={linkClass} end>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Dashboard
        </NavLink>
        <NavLink to="/register" className={linkClass}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Register
        </NavLink>
        <NavLink to="/attendance" className={linkClass}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Attendance
        </NavLink>
      </nav>
    </>
  )
}
