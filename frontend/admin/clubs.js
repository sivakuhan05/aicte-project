let allClubs = [];

function renderOrganizerList(organizers) {
    const adminApp = window.EventAdmin;
    if (!Array.isArray(organizers) || !organizers.length) {
        return '<p class="empty-state">No contact profiles available for this club.</p>';
    }

    return organizers.map((organizer) => `
        <div class="student-chip">
            <strong>${adminApp.escapeHtml(organizer.username || 'Contact')}</strong>
            <p class="meta-line">${adminApp.escapeHtml(organizer.email || 'No email')}</p>
            <p class="meta-line">${adminApp.escapeHtml(String(organizer.approvalStatus || 'pending'))}</p>
        </div>
    `).join('');
}

function renderRegisteredStudents(students) {
    const adminApp = window.EventAdmin;
    if (!Array.isArray(students) || !students.length) {
        return '<p class="empty-state">No student registrations yet.</p>';
    }

    return students.map((student) => `
        <div class="student-chip">
            <strong>${adminApp.escapeHtml(student.name || 'Student')}</strong>
            <p class="meta-line">${adminApp.escapeHtml(student.email || 'No email')}</p>
            <p class="meta-line">${adminApp.escapeHtml(student.department || 'Department not set')} | ${adminApp.escapeHtml(student.currentYear || 'Year not set')}</p>
        </div>
    `).join('');
}

function renderUpcomingEvents(events) {
    const adminApp = window.EventAdmin;
    if (!Array.isArray(events) || !events.length) {
        return '<p class="empty-state">No upcoming events for this club.</p>';
    }

    return events.map((event) => `
        <div class="club-event-item">
            <h5>${adminApp.escapeHtml(event.eventName || 'Untitled event')}</h5>
            <p class="meta-line">${adminApp.escapeHtml(adminApp.formatDateTime(event.eventDate))}</p>
            <p class="meta-line">Registered: ${Number(event.participantCount) || 0} | Approval: ${adminApp.escapeHtml(String(event.approvalStatus || 'pending'))}</p>
            <div class="student-list">${renderRegisteredStudents(event.registeredStudents)}</div>
        </div>
    `).join('');
}

function renderCompletedEvents(events) {
    const adminApp = window.EventAdmin;
    if (!Array.isArray(events) || !events.length) {
        return '<p class="empty-state">No completed events for this club within 1 year.</p>';
    }

    return events.map((event) => `
        <div class="club-event-item">
            <h5>${adminApp.escapeHtml(event.eventName || 'Untitled event')}</h5>
            <p class="meta-line">${adminApp.escapeHtml(adminApp.formatDateTime(event.eventDate))}</p>
            <p class="meta-line">Registered: ${Number(event.participantCount) || 0} | Attended: ${Number(event.attendedCount) || 0}</p>
            <div class="rating-block">${adminApp.buildStarMarkup(event.averageRating, event.ratingCount)}</div>
        </div>
    `).join('');
}

function buildClubCard(club) {
    const adminApp = window.EventAdmin;
    const card = document.createElement('article');
    card.className = 'club-card';

    card.innerHTML = `
        <div class="club-card-header">
            <div>
                <p class="eyebrow">Club / Association</p>
                <h2>${adminApp.escapeHtml(club.clubAssociation || 'Open to All')}</h2>
            </div>
            <div class="rating-block">${adminApp.buildStarMarkup(club.overallRating, club.ratingCount)}</div>
        </div>
        <div class="summary-grid">
            <div class="info-card"><strong>Total Events</strong><span>${Number(club.totalEvents) || 0}</span></div>
            <div class="info-card"><strong>Upcoming Events</strong><span>${Number(club.upcomingCount) || 0}</span></div>
            <div class="info-card"><strong>Completed Events</strong><span>${Number(club.completedCount) || 0}</span></div>
            <div class="info-card"><strong>Pending Events</strong><span>${Number(club.pendingEventCount) || 0}</span></div>
            <div class="info-card"><strong>Registered</strong><span>${Number(club.registeredCount) || 0}</span></div>
            <div class="info-card"><strong>Attended</strong><span>${Number(club.attendedCount) || 0}</span></div>
        </div>
        <div class="club-sections">
            <section class="club-section">
                <h4>Contacts</h4>
                <div class="student-list">${renderOrganizerList(club.organizers)}</div>
            </section>
            <section class="club-section">
                <h4>Upcoming Events and Registered Students</h4>
                <div class="club-event-list">${renderUpcomingEvents(club.upcomingEvents)}</div>
            </section>
            <section class="club-section">
                <h4>Completed Events, Attendance, and Ratings</h4>
                <div class="club-event-list">${renderCompletedEvents(club.completedEvents)}</div>
            </section>
        </div>
    `;

    return card;
}

function renderClubGrid(clubs) {
    const grid = document.getElementById('club-grid');
    const note = document.getElementById('club-filter-note');
    if (!grid || !note) {
        return;
    }

    if (!clubs.length) {
        grid.innerHTML = '<p class="empty-state">No clubs match this filter.</p>';
        note.textContent = 'No clubs or associations match your search.';
        return;
    }

    grid.innerHTML = '';
    clubs.forEach((club) => {
        grid.appendChild(buildClubCard(club));
    });

    if (clubs.length === allClubs.length) {
        note.textContent = 'Showing all clubs and associations.';
        return;
    }

    note.textContent = `Showing ${clubs.length} matching club${clubs.length === 1 ? '' : 's'}.`;
}

function filterClubs(query) {
    const cleanedQuery = String(query || '').trim().toLowerCase();
    if (!cleanedQuery) {
        renderClubGrid(allClubs);
        return;
    }

    const filtered = allClubs.filter((club) =>
        String(club.clubAssociation || '').toLowerCase().includes(cleanedQuery)
    );
    renderClubGrid(filtered);
}

document.addEventListener('DOMContentLoaded', async () => {
    const adminApp = window.EventAdmin;
    const session = adminApp.requireSession('login.html');
    if (!session) {
        return;
    }

    adminApp.attachLogoutHandlers();

    const grid = document.getElementById('club-grid');
    const filterForm = document.getElementById('club-filter-form');
    const clearButton = document.getElementById('club-clear-button');
    const searchInput = document.getElementById('club-search-input');
    grid.innerHTML = '<p class="meta">Loading club analytics...</p>';

    if (filterForm && searchInput) {
        filterForm.addEventListener('submit', (event) => {
            event.preventDefault();
            filterClubs(searchInput.value);
        });
    }

    if (clearButton && searchInput) {
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            renderClubGrid(allClubs);
        });
    }

    try {
        const data = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/clubs`);
        allClubs = Array.isArray(data.clubs) ? data.clubs : [];
        document.getElementById('club-count').textContent = Number(data.count) || allClubs.length;

        if (!allClubs.length) {
            grid.innerHTML = '<p class="empty-state">No clubs or associations are available yet.</p>';
            return;
        }

        renderClubGrid(allClubs);
    } catch (error) {
        console.error('Failed to load club analytics:', error);
        grid.innerHTML = '<p class="empty-state">Failed to load club analytics.</p>';
    }
});
