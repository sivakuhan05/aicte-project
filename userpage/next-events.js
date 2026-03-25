let studentProfile = null;
let allUpcomingEvents = [];
let registeredKeys = new Set();
let activeFilter = 'Interested Events';
let activeAssociation = 'All Clubs';

function eventKeyFromFeedItem(eventItem) {
    return {
        idKey: eventItem._id || '',
        compositeKey: `${eventItem.eventName || ''}::${eventItem.organizerUsername || ''}`
    };
}

function isRegisteredEvent(eventItem) {
    const keys = eventKeyFromFeedItem(eventItem);
    return registeredKeys.has(keys.idKey) || registeredKeys.has(keys.compositeKey);
}

function sortEventsByDate(left, right) {
    const studentApp = window.EventStudent;
    const leftDate = studentApp.safeDate(left.eventDate);
    const rightDate = studentApp.safeDate(right.eventDate);
    return (leftDate ? leftDate.getTime() : Number.MAX_SAFE_INTEGER)
        - (rightDate ? rightDate.getTime() : Number.MAX_SAFE_INTEGER);
}

function getAssociationOptions() {
    const defaults = ['All Clubs', 'CSEA Association', 'IEEE', 'IT Association', 'YRCS', 'Animal Welfare', 'Open to All'];
    const known = new Set(defaults.map((item) => item.toLowerCase()));

    allUpcomingEvents.forEach((eventItem) => {
        const association = String(eventItem.clubAssociation || '').trim();
        if (!association) {
            return;
        }
        const lowered = association.toLowerCase();
        if (!known.has(lowered)) {
            defaults.push(association);
            known.add(lowered);
        }
    });

    return defaults;
}

function renderFilterBar() {
    const filterBar = document.getElementById('event-filter-bar');
    if (!filterBar) {
        return;
    }

    const filters = ['Interested Events', 'All', 'Food', 'Sports', 'Music', 'Tech', 'Non-Tech', 'Arts', 'General'];
    filterBar.innerHTML = '';

    filters.forEach((filterName) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-chip${activeFilter === filterName ? ' active' : ''}`;
        button.textContent = filterName;
        button.addEventListener('click', () => {
            activeFilter = filterName;
            renderFilterBar();
            renderEvents();
        });
        filterBar.appendChild(button);
    });
}

function renderAssociationBar() {
    const associationBar = document.getElementById('association-filter-bar');
    if (!associationBar) {
        return;
    }

    associationBar.innerHTML = '';
    getAssociationOptions().forEach((associationName) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `filter-chip${activeAssociation === associationName ? ' active' : ''}`;
        button.textContent = associationName;
        button.addEventListener('click', () => {
            activeAssociation = associationName;
            renderAssociationBar();
            renderEvents();
        });
        associationBar.appendChild(button);
    });
}

function matchesAssociation(eventItem) {
    const studentApp = window.EventStudent;
    if (activeAssociation === 'All Clubs') {
        return true;
    }

    return studentApp.normalizeAssociation(eventItem.clubAssociation) === studentApp.normalizeAssociation(activeAssociation);
}

function getFilteredEvents() {
    const studentApp = window.EventStudent;
    let filtered = allUpcomingEvents.filter((eventItem) => (
        studentApp.eventVisibleToStudent(eventItem, studentProfile)
    ));

    if (activeFilter === 'Interested Events') {
        filtered = filtered.filter((eventItem) => (
            studentApp.matchesInterestedEvent(eventItem, studentProfile?.interests || [])
        ));
    } else if (activeFilter !== 'All') {
        filtered = filtered.filter((eventItem) => (
            studentApp.normalizeCategory(eventItem.category) === activeFilter
        ));
    }

    return filtered.filter(matchesAssociation);
}

function buildEventCard(eventItem) {
    const studentApp = window.EventStudent;
    const card = document.createElement('article');
    card.className = 'event-card';

    const isRegistered = isRegisteredEvent(eventItem);
    const description = studentApp.truncateText(eventItem.eventDescription, 170);
    const clubAssociation = eventItem.clubAssociation || 'Open to All';
    const accessLabel = studentApp.formatAccessLabel(eventItem);

    card.innerHTML = `
        <div class="event-image">
            ${eventItem.image
                ? `<img src="${eventItem.image}" alt="${studentApp.escapeHtml(eventItem.eventName || 'Event image')}">`
                : '<div class="no-image">No image uploaded</div>'}
        </div>
        <div class="event-main">
            <div class="event-header-row">
                <div class="event-title-block">
                    <h3>${studentApp.escapeHtml(eventItem.eventName || 'Untitled event')}</h3>
                    <p class="event-meta-line">${studentApp.escapeHtml(studentApp.formatDateTime(eventItem.eventDate))} | ${studentApp.escapeHtml(eventItem.eventLocation || 'Location pending')}</p>
                </div>
                <span class="event-pill upcoming">${studentApp.escapeHtml(studentApp.normalizeCategory(eventItem.category || 'General'))}</span>
            </div>
            <p class="event-summary">${studentApp.escapeHtml(description || 'No event description available.')}</p>
            <div class="status-row">
                <span class="status-chip">Club / Association: ${studentApp.escapeHtml(clubAssociation)}</span>
                <span class="status-chip">Access: ${studentApp.escapeHtml(accessLabel)}</span>
                <span class="status-chip">${eventItem.externalFormUrl ? 'Organizer registration URL available' : 'Registration URL not added yet'}</span>
            </div>
            <div class="event-actions">
                <button type="button" class="btn-outline view-details-btn">View Event Details</button>
                <button type="button" class="btn-primary register-btn"${isRegistered ? ' disabled' : ''}>${isRegistered ? 'Registered' : 'Register Event'}</button>
            </div>
            <div class="event-extra hidden">
                <div class="detail-grid">
                    <div class="info-card"><strong>Category</strong><span>${studentApp.escapeHtml(studentApp.normalizeCategory(eventItem.category || 'General'))}</span></div>
                    <div class="info-card"><strong>Club / Association</strong><span>${studentApp.escapeHtml(clubAssociation)}</span></div>
                    <div class="info-card"><strong>Access</strong><span>${studentApp.escapeHtml(accessLabel)}</span></div>
                    <div class="info-card"><strong>Schedule</strong><span>${studentApp.escapeHtml(studentApp.formatDateTime(eventItem.eventDate))}</span></div>
                </div>
                <div class="event-metrics">
                    <p>${studentApp.escapeHtml(eventItem.eventDescription || 'No event description available.')}</p>
                    <p><strong>Location:</strong> ${studentApp.escapeHtml(eventItem.eventLocation || 'Location pending')}</p>
                    <p><strong>Registration link:</strong> ${eventItem.externalFormUrl ? 'Available from organizer' : 'Organizer has not added a URL yet.'}</p>
                </div>
            </div>
        </div>
    `;

    const detailsButton = card.querySelector('.view-details-btn');
    const extraPanel = card.querySelector('.event-extra');
    const registerButton = card.querySelector('.register-btn');

    detailsButton.addEventListener('click', () => {
        extraPanel.classList.toggle('hidden');
        detailsButton.textContent = extraPanel.classList.contains('hidden')
            ? 'View Event Details'
            : 'Hide Event Details';
    });

    registerButton.addEventListener('click', async () => {
        const currentSession = studentApp.getSession();
        registerButton.disabled = true;
        registerButton.textContent = 'Saving...';

        try {
            const result = await studentApp.fetchJson(`${studentApp.API_BASE}/students/register-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentSession.email,
                    eventId: eventItem._id
                })
            });

            const keys = eventKeyFromFeedItem(eventItem);
            if (keys.idKey) {
                registeredKeys.add(keys.idKey);
            }
            registeredKeys.add(keys.compositeKey);
            registerButton.textContent = 'Registered';

            if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
                return;
            }

            alert('Event saved to My Events. The organizer has not added a registration URL yet.');
            renderEvents();
        } catch (error) {
            console.error('Failed to register event:', error);
            registerButton.disabled = false;
            registerButton.textContent = 'Register Event';
            alert(error.message || 'Failed to save this event.');
        }
    });

    return card;
}

function renderEvents() {
    const studentApp = window.EventStudent;
    const list = document.getElementById('next-events-list');
    const filterCopy = document.getElementById('active-filter-copy');
    const caption = document.getElementById('filter-caption');
    const associationCaption = document.getElementById('association-caption');
    if (!list || !caption || !filterCopy || !associationCaption) {
        return;
    }

    const filteredEvents = getFilteredEvents().sort(sortEventsByDate);
    filterCopy.textContent = `${activeFilter} | ${activeAssociation}`;

    if (activeFilter === 'Interested Events') {
        const interests = (studentProfile?.interests || []).join(', ');
        caption.textContent = interests
            ? `Showing upcoming events that match your interests: ${interests}.`
            : 'No interested domains saved yet. Update your profile or switch to another filter.';
    } else if (activeFilter === 'All') {
        caption.textContent = 'Showing every upcoming event created by organizers.';
    } else {
        caption.textContent = `Showing upcoming ${activeFilter.toLowerCase()} events.`;
    }

    associationCaption.textContent = activeAssociation === 'All Clubs'
        ? 'Showing events from every club and association.'
        : `Showing only ${activeAssociation} events.`;

    list.innerHTML = '';

    if (!filteredEvents.length) {
        list.innerHTML = '<p class="empty-state">No upcoming events match these filters right now.</p>';
        return;
    }

    filteredEvents.forEach((eventItem) => {
        list.appendChild(buildEventCard(eventItem));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const studentApp = window.EventStudent;
    const session = studentApp.requireSession('login.html');
    if (!session) {
        return;
    }

    studentApp.attachLogoutHandlers();

    try {
        const [profile, registrationsData, eventsData] = await Promise.all([
            studentApp.fetchJson(`${studentApp.API_BASE}/user/${encodeURIComponent(session.email)}`),
            studentApp.fetchJson(`${studentApp.API_BASE}/my-events/${encodeURIComponent(session.email)}`),
            studentApp.fetchJson(`${studentApp.API_BASE}/events?viewerEmail=${encodeURIComponent(session.email)}`)
        ]);

        studentProfile = profile;
        activeFilter = (profile.interests || []).length ? 'Interested Events' : 'All';
        activeAssociation = 'All Clubs';

        const registrations = Array.isArray(registrationsData.events) ? registrationsData.events : [];
        registeredKeys = new Set(registrations.map((item) => studentApp.buildRegistrationKey(item)));

        allUpcomingEvents = (Array.isArray(eventsData) ? eventsData : [])
            .filter((eventItem) => {
                const eventDate = studentApp.safeDate(eventItem.eventDate);
                if (eventDate && eventDate < new Date()) {
                    return false;
                }
                return studentApp.eventVisibleToStudent(eventItem, profile);
            });

        renderFilterBar();
        renderAssociationBar();
        renderEvents();
    } catch (error) {
        console.error('Failed to load event feed:', error);
        document.getElementById('next-events-list').innerHTML = '<p class="empty-state">Failed to load the upcoming event feed.</p>';
    }
});
