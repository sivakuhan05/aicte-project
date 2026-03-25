let organizerEvents = [];
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeDate(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildStarMarkup(averageRating, ratingCount, small = false) {
    const average = Number(averageRating) || 0;
    const count = Number(ratingCount) || 0;
    const rounded = Math.round(average);
    const stars = Array.from({ length: 5 }, (_, index) => {
        const filled = index < rounded;
        return `<span class="star ${filled ? 'filled' : 'empty'} ${small ? 'small' : ''}">&#9733;</span>`;
    }).join('');

    if (!count) {
        return `
            <div class="star-summary ${small ? 'small' : ''}">
                <div class="star-row">${stars}</div>
                <p class="rating-meta">No ratings yet</p>
            </div>
        `;
    }

    return `
        <div class="star-summary ${small ? 'small' : ''}">
            <div class="star-row">${stars}</div>
            <p class="rating-meta"><span class="rating-value">${average.toFixed(1)}</span>/5 from ${count} rating${count === 1 ? '' : 's'}</p>
        </div>
    `;
}

function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

async function fetchOrganizerEvents(organizerUsername) {
    try {
        const response = await fetch(`http://localhost:3000/events/organizer/${encodeURIComponent(organizerUsername)}`);
        if (!response.ok) {
            throw new Error(`Failed to load organizer events (${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching organizer events:', error);
        showErrorToast('Failed to load organizer events.');
        return [];
    }
}

function renderOrganizerRating() {
    const ratingBox = document.getElementById('organizer-rating');
    if (!ratingBox) {
        return;
    }

    const ratingSum = organizerEvents.reduce((total, event) => total + (Number(event.ratingSum) || 0), 0);
    const ratingCount = organizerEvents.reduce((total, event) => total + (Number(event.ratingCount) || 0), 0);
    const overallRating = ratingCount ? ratingSum / ratingCount : 0;

    ratingBox.innerHTML = `
        <span class="rating-label">Overall rating</span>
        ${buildStarMarkup(overallRating, ratingCount)}
    `;
}

function updateDashboardStats(organizerUsername) {
    const organizerAssociation = localStorage.getItem('organizerAssociation') || '';
    const now = new Date();

    const completedCount = organizerEvents.filter((event) => {
        const eventDate = safeDate(event.eventDate);
        if (!eventDate) {
            return false;
        }
        return eventDate < now;
    }).length;

    const upcomingCount = organizerEvents.filter((event) => {
        const eventDate = safeDate(event.eventDate);
        if (!eventDate) {
            return false;
        }
        return eventDate >= now;
    }).length;

    document.getElementById('completed-count').textContent = completedCount;
    document.getElementById('upcoming-count').textContent = upcomingCount;
    document.getElementById('completed-subtext').textContent = completedCount ? `${completedCount} event${completedCount === 1 ? '' : 's'} finished within 1 year` : 'No completed events within 1 year';
    document.getElementById('upcoming-subtext').textContent = upcomingCount ? `${upcomingCount} event${upcomingCount === 1 ? '' : 's'} scheduled ahead` : 'No upcoming events';

    const welcome = document.getElementById('dashboard-welcome');
    if (welcome) {
        welcome.textContent = `Welcome, ${organizerAssociation || organizerUsername}`;
    }

    renderOrganizerRating();
}

function updateUpcomingEvents() {
    const listContainer = document.getElementById('events-ahead-list');
    const detailsContainer = document.getElementById('participant-details');

    listContainer.innerHTML = '';
    detailsContainer.classList.add('hidden');
    detailsContainer.innerHTML = '';

    const now = new Date();
    const upcoming = organizerEvents
        .filter((event) => {
            const eventDate = safeDate(event.eventDate);
            return eventDate && eventDate >= now;
        })
        .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
        .slice(0, 5);

    if (!upcoming.length) {
        listContainer.innerHTML = '<p class="empty-state">No upcoming events scheduled.</p>';
        return;
    }

    upcoming.forEach((event) => {
        const eventDate = safeDate(event.eventDate);
        if (!eventDate) {
            return;
        }

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'event-item-compact';
        item.innerHTML = `
            <div class="event-time">${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<span>${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="event-content">
                <h4>${escapeHtml(event.eventName || 'Untitled event')}</h4>
                <p>${escapeHtml(event.eventLocation || 'Location pending')}</p>
            </div>
        `;
        item.addEventListener('click', () => showParticipantDetails(event, item));
        listContainer.appendChild(item);
    });
}

async function showParticipantDetails(event, eventElement) {
    const detailsContainer = document.getElementById('participant-details');
    if (!detailsContainer) {
        return;
    }

    document.querySelectorAll('.event-item-compact').forEach((item) => item.classList.remove('active'));
    eventElement.classList.add('active');
    detailsContainer.classList.remove('hidden');
    detailsContainer.innerHTML = '<p class="meta">Loading participants...</p>';

    const organizerUsername = localStorage.getItem('organizerUsername') || '';
    const query = new URLSearchParams({
        eventName: event.eventName || '',
        organizerUsername
    });

    try {
        const response = await fetch(`http://localhost:3000/participants/event?${query.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to load participants (${response.status})`);
        }

        const data = await response.json();
        const participants = Array.isArray(data.participants) ? data.participants : [];
        const eventDate = safeDate(event.eventDate);
        const dateLine = eventDate
            ? `${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
            : 'Date not available';

        detailsContainer.innerHTML = `
            <h3>${escapeHtml(event.eventName || 'Event')}</h3>
            <p class="meta">${escapeHtml(dateLine)} | ${escapeHtml(event.eventLocation || 'Location pending')}</p>
            <p class="meta">Total participants: <strong>${Number(data.count) || 0}</strong></p>
            <div class="participant-list"></div>
        `;

        const list = detailsContainer.querySelector('.participant-list');
        if (!participants.length) {
            list.innerHTML = '<p class="empty-state">No participants registered yet.</p>';
            return;
        }

        participants.forEach((participant) => {
            const card = document.createElement('div');
            card.className = 'participant-card';
            card.innerHTML = `
                <h4>${escapeHtml(participant.name || 'Participant')}</h4>
                <p>Email: ${escapeHtml(participant.email || 'N/A')}</p>
                <p>Profession: ${escapeHtml(participant.profession || 'N/A')}</p>
                <p>Age: ${escapeHtml(participant.age || 'N/A')}</p>
            `;
            list.appendChild(card);
        });
    } catch (error) {
        console.error('Error fetching participants:', error);
        detailsContainer.innerHTML = '<p class="empty-state">Failed to load participant details.</p>';
    }
}

function updateCalendarHeader() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('current-month').textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

function createDayElement(day, isOtherMonth = false) {
    const dayElement = document.createElement('div');
    dayElement.className = `calendar-day${isOtherMonth ? ' other-month' : ''}`;

    const label = document.createElement('span');
    label.className = 'day-number';
    label.textContent = day;
    dayElement.appendChild(label);
    return dayElement;
}

function generateCalendarDays() {
    const calendarDays = document.getElementById('calendar-days');
    calendarDays.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const firstDayIndex = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    for (let i = firstDayIndex - 1; i >= 0; i -= 1) {
        calendarDays.appendChild(createDayElement(prevMonthLastDay - i, true));
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const dayElement = createDayElement(day);
        const thisDay = new Date(currentYear, currentMonth, day);

        if (thisDay.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }

        const eventsOnDay = organizerEvents.filter((event) => {
            const eventDate = safeDate(event.eventDate);
            if (!eventDate) {
                return false;
            }
            return eventDate.getDate() === day && eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
        });

        if (eventsOnDay.length) {
            dayElement.classList.add('has-event');

            const dot = document.createElement('span');
            dot.className = 'event-dot';
            dayElement.appendChild(dot);

            if (eventsOnDay.length > 1) {
                const badge = document.createElement('span');
                badge.className = 'event-count';
                badge.textContent = String(eventsOnDay.length);
                dayElement.appendChild(badge);
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'event-tooltip';
            tooltip.innerHTML = eventsOnDay.map((event) => {
                const eventDate = safeDate(event.eventDate);
                const timeLabel = eventDate ? eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Time pending';
                return `<div class="tooltip-item"><span>${escapeHtml(event.eventName || 'Event')}</span><span>${escapeHtml(timeLabel)}</span></div>`;
            }).join('');
            dayElement.appendChild(tooltip);
        }

        calendarDays.appendChild(dayElement);
    }

    const slotsUsed = firstDayIndex + totalDays;
    for (let day = 1; day <= 42 - slotsUsed; day += 1) {
        calendarDays.appendChild(createDayElement(day, true));
    }
}

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear -= 1;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
    }
    updateCalendarHeader();
    generateCalendarDays();
}

document.addEventListener('DOMContentLoaded', async () => {
    const organizerUsername = localStorage.getItem('organizerUsername');
    if (!organizerUsername) {
        window.location.href = 'orglog.html';
        return;
    }

    organizerEvents = await fetchOrganizerEvents(organizerUsername);
    updateDashboardStats(organizerUsername);
    updateCalendarHeader();
    generateCalendarDays();
    updateUpcomingEvents();

    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
});
