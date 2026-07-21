let allRecords = [];

async function loadRecords() {
    const res = await fetch('/api/attendance');
    allRecords = await res.json();
    renderTable(allRecords);
}

function renderTable(records) {
    const tbody = document.getElementById('attendance-body');
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No records found</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(r => {
        const d = new Date(r.timestamp);
        const date = d.toLocaleDateString();
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `
            <tr>
                <td>${date} ${time}</td>
                <td><strong>${r.name}</strong></td>
                <td>${r.userId}</td>
                <td><span class="status-chip">${r.status}</span></td>
            </tr>`;
    }).join('');
}

function applyFilters() {
    const dateVal = document.getElementById('filter-date').value;
    const searchVal = document.getElementById('filter-search').value.toLowerCase();

    let filtered = allRecords;
    if (dateVal) {
        filtered = filtered.filter(r => r.timestamp.startsWith(dateVal));
    }
    if (searchVal) {
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(searchVal) ||
            r.userId.toLowerCase().includes(searchVal)
        );
    }
    renderTable(filtered);
}

document.getElementById('filter-date').addEventListener('change', applyFilters);
document.getElementById('filter-search').addEventListener('input', applyFilters);
document.getElementById('btn-clear').addEventListener('click', () => {
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-search').value = '';
    renderTable(allRecords);
});

document.addEventListener('DOMContentLoaded', loadRecords);
