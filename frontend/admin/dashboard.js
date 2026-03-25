let adminEvents = [];
let selectedDateKey = '';
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

function getDayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function updateCalendarHeader() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];
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

function renderSelectedDayPanel() {
    const adminApp = window.EventAdmin;
    const title = document.getElementById('selected-day-title');
    const list = document.getElementById('selected-day-events');
    if (!title || !list) {
        return;
    }

    const selectedEvents = adminEvents
        .filter((event) => {
            const eventDate = adminApp.safeDate(event.eventDate);
            return eventDate && getDayKey(eventDate) === selectedDateKey;
        })
        .sort((left, right) => new Date(left.eventDate) - new Date(right.eventDate));

    const selectedDate = selectedEvents[0]
        ? adminApp.safeDate(selectedEvents[0].eventDate)
        : null;

    title.textContent = selectedDate
        ? `Events on ${selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
        : 'Events on This Date';

    if (!selectedEvents.length) {
        list.innerHTML = '<p class="empty-state">No events are scheduled on this date.</p>';
        return;
    }

    list.innerHTML = '';
    selectedEvents.forEach((event) => {
        const article = document.createElement('article');
        article.className = 'event-item-compact';
        const registeredCount = Number(event.participantCount) || 0;
        const attendedCount = Number(event.attendedCount) || 0;
        article.innerHTML = `
            <div class="event-time">${adminApp.escapeHtml(adminApp.formatShortDate(event.eventDate))}<span>${adminApp.escapeHtml(adminApp.formatTime(event.eventDate))}</span></div>
            <div class="event-content">
                <h4>${adminApp.escapeHtml(event.eventName || 'Untitled event')}</h4>
                <p>${adminApp.escapeHtml(event.clubAssociation || 'Open to All')}</p>
                <p class="event-count-meta">Registered: ${registeredCount} | Attended: ${attendedCount}</p>
            </div>
            <span class="event-pill ${String(event.approvalStatus || '').toLowerCase() === 'approved' ? 'upcoming' : 'pending'}">${adminApp.escapeHtml(String(event.approvalStatus || 'pending'))}</span>
        `;
        list.appendChild(article);
    });
}

function generateCalendarDays() {
    const adminApp = window.EventAdmin;
    const calendarDays = document.getElementById('calendar-days');
    if (!calendarDays) {
        return;
    }

    calendarDays.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const firstDayIndex = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    for (let index = firstDayIndex - 1; index >= 0; index -= 1) {
        calendarDays.appendChild(createDayElement(prevMonthLastDay - index, true));
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const dayElement = createDayElement(day);
        const thisDay = new Date(currentYear, currentMonth, day);
        const dayKey = getDayKey(thisDay);

        if (thisDay.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        if (selectedDateKey === dayKey) {
            dayElement.classList.add('selected');
        }

        const eventsOnDay = adminEvents.filter((event) => {
            const eventDate = adminApp.safeDate(event.eventDate);
            return eventDate && getDayKey(eventDate) === dayKey;
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
            tooltip.innerHTML = eventsOnDay.map((event) => `
                <div class="tooltip-item">
                    <span>${adminApp.escapeHtml(event.eventName || 'Event')}</span>
                    <span>${adminApp.escapeHtml(adminApp.formatTime(event.eventDate))}</span>
                </div>
            `).join('');
            dayElement.appendChild(tooltip);
        }

        dayElement.addEventListener('click', () => {
            selectedDateKey = dayKey;
            generateCalendarDays();
            renderSelectedDayPanel();
        });

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
    const adminApp = window.EventAdmin;
    const session = adminApp.requireSession('login.html');
    if (!session) {
        return;
    }

    adminApp.attachLogoutHandlers();
    document.getElementById('admin-welcome').textContent = `Welcome, ${session.username || 'Admin'}`;

    try {
        const data = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/dashboard`);
        adminEvents = Array.isArray(data.calendarEvents) ? data.calendarEvents : [];

        document.getElementById('upcoming-count').textContent = Number(data.counts?.upcomingEvents) || 0;
        document.getElementById('completed-count').textContent = Number(data.counts?.completedEvents) || 0;
        document.getElementById('pending-organizers-count').textContent = Number(data.counts?.pendingOrganizers) || 0;
        document.getElementById('pending-events-count').textContent = Number(data.counts?.pendingEvents) || 0;

        const today = new Date();
        selectedDateKey = getDayKey(today);
        if (!adminEvents.some((event) => {
            const eventDate = adminApp.safeDate(event.eventDate);
            return eventDate && getDayKey(eventDate) === selectedDateKey;
        }) && adminEvents.length) {
            const firstDate = adminApp.safeDate(adminEvents[0].eventDate);
            if (firstDate) {
                selectedDateKey = getDayKey(firstDate);
                currentMonth = firstDate.getMonth();
                currentYear = firstDate.getFullYear();
            }
        }

        updateCalendarHeader();
        generateCalendarDays();
        renderSelectedDayPanel();

        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    } catch (error) {
        console.error('Failed to load admin dashboard:', error);
        document.getElementById('selected-day-events').innerHTML = '<p class="empty-state">Failed to load the admin dashboard.</p>';
    }
});
