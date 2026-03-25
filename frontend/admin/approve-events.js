let pendingEvents = [];
let activeFilter = 'All';
let activeAssociation = 'All Clubs';

function getAssociationOptions() {
    const defaults = ['All Clubs'];
    const known = new Set(defaults.map((item) => item.toLowerCase()));

    pendingEvents.forEach((event) => {
        const association = String(event.clubAssociation || '').trim() || 'Open to All';
        const lowered = association.toLowerCase();
        if (!known.has(lowered)) {
            defaults.push(association);
            known.add(lowered);
        }
    });

    return defaults;
}

function matchesAssociation(event) {
    const adminApp = window.EventAdmin;
    if (activeAssociation === 'All Clubs') {
        return true;
    }
    return adminApp.normalizeAssociation(event.clubAssociation) === adminApp.normalizeAssociation(activeAssociation);
}

function getFilteredEvents() {
    const adminApp = window.EventAdmin;
    let filtered = [...pendingEvents];

    if (activeFilter !== 'All') {
        filtered = filtered.filter((event) => (
            adminApp.normalizeCategory(event.category) === activeFilter
        ));
    }

    return filtered.filter(matchesAssociation);
}

function renderFilterBar() {
    const filterBar = document.getElementById('event-filter-bar');
    const filters = ['All', 'Tech', 'Non-Tech', 'Food', 'Sports', 'Music', 'Arts', 'General'];
    filterBar.innerHTML = '';

    filters.forEach((filter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-chip${activeFilter === filter ? ' active' : ''}`;
        button.textContent = filter;
        button.addEventListener('click', () => {
            activeFilter = filter;
            renderFilterBar();
            renderEvents();
        });
        filterBar.appendChild(button);
    });
}

function renderAssociationBar() {
    const associationBar = document.getElementById('association-filter-bar');
    associationBar.innerHTML = '';

    getAssociationOptions().forEach((association) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-chip${activeAssociation === association ? ' active' : ''}`;
        button.textContent = association;
        button.addEventListener('click', () => {
            activeAssociation = association;
            renderAssociationBar();
            renderEvents();
        });
        associationBar.appendChild(button);
    });
}

function buildEventCard(event) {
    const adminApp = window.EventAdmin;
    const card = document.createElement('article');
    card.className = 'event-card';

    const accessLabel = Array.isArray(event.allowedDepartments) && event.allowedDepartments.length
        ? event.allowedDepartments.join(', ')
        : 'All departments';

    card.innerHTML = `
        <div class="event-image">
            ${event.image
                ? `<img src="${event.image}" alt="${adminApp.escapeHtml(event.eventName || 'Event image')}">`
                : '<div class="no-image">No image uploaded</div>'}
        </div>
        <div class="event-main">
            <div class="event-header-row">
                <div class="event-title-block">
                    <h3>${adminApp.escapeHtml(event.eventName || 'Untitled event')}</h3>
                    <p class="event-meta-line">${adminApp.escapeHtml(adminApp.formatDateTime(event.eventDate))}</p>
                </div>
                <span class="event-pill pending">Pending</span>
            </div>
            <div class="status-row">
                <span class="status-chip">Club: ${adminApp.escapeHtml(event.clubAssociation || 'Open to All')}</span>
                <span class="status-chip">Contact: ${adminApp.escapeHtml(event.organizerUsername || 'Unknown')}</span>
                <span class="status-chip">Access: ${adminApp.escapeHtml(accessLabel)}</span>
            </div>
            <p class="page-note">${adminApp.escapeHtml(event.eventDescription || 'No event description available.')}</p>
            <div class="event-actions">
                <button type="button" class="btn-outline details-btn">View Details</button>
                <button type="button" class="btn-primary approve-btn">Approve Event</button>
            </div>
            <div class="event-extra hidden">
                <div class="detail-grid">
                    <div class="info-card"><strong>Category</strong><span>${adminApp.escapeHtml(adminApp.normalizeCategory(event.category))}</span></div>
                    <div class="info-card"><strong>Location</strong><span>${adminApp.escapeHtml(event.eventLocation || 'Location pending')}</span></div>
                    <div class="info-card"><strong>Applied participants</strong><span>${Number(event.participantCount) || 0}</span></div>
                    <div class="info-card"><strong>Registration URL</strong><span>${event.externalFormUrl ? 'Available' : 'Not added'}</span></div>
                </div>
            </div>
        </div>
    `;

    const detailsButton = card.querySelector('.details-btn');
    const extraPanel = card.querySelector('.event-extra');
    const approveButton = card.querySelector('.approve-btn');

    detailsButton.addEventListener('click', () => {
        extraPanel.classList.toggle('hidden');
        detailsButton.textContent = extraPanel.classList.contains('hidden') ? 'View Details' : 'Hide Details';
    });

    approveButton.addEventListener('click', async () => {
        approveButton.disabled = true;
        approveButton.textContent = 'Approving...';

        try {
            await adminApp.fetchJson(`${adminApp.API_BASE}/admin/events/${event._id}/approve`, {
                method: 'POST'
            });
            pendingEvents = pendingEvents.filter((item) => item._id !== event._id);
            document.getElementById('pending-events-count').textContent = pendingEvents.length;
            renderAssociationBar();
            renderEvents();
        } catch (error) {
            console.error('Failed to approve event:', error);
            approveButton.disabled = false;
            approveButton.textContent = 'Approve Event';
            alert(error.message || 'Failed to approve event.');
        }
    });

    return card;
}

function renderEvents() {
    const list = document.getElementById('pending-events-list');
    const filterCaption = document.getElementById('filter-caption');
    const associationCaption = document.getElementById('association-caption');
    const filteredEvents = getFilteredEvents().sort((left, right) => new Date(left.eventDate) - new Date(right.eventDate));

    filterCaption.textContent = activeFilter === 'All'
        ? 'Showing all pending events.'
        : `Showing pending ${activeFilter.toLowerCase()} events.`;
    associationCaption.textContent = activeAssociation === 'All Clubs'
        ? 'Showing events from every club and association.'
        : `Showing only ${activeAssociation} events.`;

    if (!filteredEvents.length) {
        list.innerHTML = '<p class="empty-state">No pending events match these filters right now.</p>';
        return;
    }

    list.innerHTML = '';
    filteredEvents.forEach((event) => {
        list.appendChild(buildEventCard(event));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const adminApp = window.EventAdmin;
    const session = adminApp.requireSession('login.html');
    if (!session) {
        return;
    }

    adminApp.attachLogoutHandlers();

    try {
        const data = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/events/pending`);
        pendingEvents = Array.isArray(data.events) ? data.events : [];
        document.getElementById('pending-events-count').textContent = Number(data.count) || pendingEvents.length;

        renderFilterBar();
        renderAssociationBar();
        renderEvents();
    } catch (error) {
        console.error('Failed to load pending events:', error);
        document.getElementById('pending-events-list').innerHTML = '<p class="empty-state">Failed to load pending events.</p>';
    }
});
