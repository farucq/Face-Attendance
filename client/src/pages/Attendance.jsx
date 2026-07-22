import { useState, useEffect, useCallback } from 'react'
import { fetchJSON } from '../utils/faceApi'

export default function Attendance() {
  const [allRecords, setAllRecords] = useState([])
  const [filtered, setFiltered] = useState([])
  const [dateFilter, setDateFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const loadRecords = useCallback(async () => {
    const records = await fetchJSON('/api/attendance')
    setAllRecords(records)
    setFiltered(records)
  }, [])

  useEffect(() => {
    loadRecords()
  }, [])

  useEffect(() => {
    let result = allRecords
    if (dateFilter) {
      result = result.filter(r => r.timestamp.startsWith(dateFilter))
    }
    if (searchFilter) {
      const s = searchFilter.toLowerCase()
      result = result.filter(r =>
        r.name.toLowerCase().includes(s) || r.userId.toLowerCase().includes(s)
      )
    }
    setFiltered(result)
  }, [dateFilter, searchFilter, allRecords])

  const clearFilters = () => {
    setDateFilter('')
    setSearchFilter('')
    setFiltered(allRecords)
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Attendance History</h1>
        <p className="page-subtitle">View and export attendance records</p>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="filter-date">Date</label>
          <input type="date" id="filter-date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-search">Search</label>
          <input type="text" id="filter-search" placeholder="Name or ID..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear</button>
        <div className="filter-actions">
          <a href="/api/export/csv" className="btn btn-outline btn-sm" download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </a>
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Name</th>
                <th>User ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="4" className="empty-state">No records found</td></tr>
              ) : (
                filtered.map((r, i) => {
                  const d = new Date(r.timestamp)
                  const date = d.toLocaleDateString()
                  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  return (
                    <tr key={i}>
                      <td>{date} {time}</td>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.userId}</td>
                      <td><span className="status-chip">{r.status}</span></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
