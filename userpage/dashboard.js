let calendarRegistrations = [];
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

function renderEditedNotifications(notifications) {
    const studentApp = window.EventStudent;
    const panel = document.getElementById('edited-events-panel');
    const list = document.getElementById('edited-events-list');

    if (!panel || !list) {
        return;
    }

    if (!notifications.length) {
        panel.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    panel.classList.remove('hidden');
    list.innerHTML = notifications.map((notification) => {
        const eventName = studentApp.escapeHtml(notification.eventName || 'Event');
        const previousEventName = studentApp.escapeHtml(notification.previousEventName || '');
        const renameLine = notification.previousEventName && notification.previousEventName !== notification.eventName
            ? `<p class="edited-notice-meta">Earlier name: ${previousEventName}</p>`
            : '';
        const updatedSchedule = notification.eventDate
            ? studentApp.formatDateTime(notification.eventDate)
            : 'Updated schedule will be shared soon';
        const lastUpdated = notification.updatedAt
            ? studentApp.formatDateTime(notification.updatedAt)
            : 'Recently updated';

        return `
            <article class="edited-notice-card">
                <div class="edited-notice-header">
                    <div>
                        <h3 class="edited-notice-title">${eventName}</h3>
                        <p class="edited-notice-meta">Updated schedule: ${studentApp.escapeHtml(updatedSchedule)}</p>
                        ${renameLine}
                    </div>
                    <span class="edited-notice-time">Updated ${studentApp.escapeHtml(lastUpdated)}</span>
                </div>
                <p class="edited-notice-message">${studentApp.escapeHtml(notification.message || 'This event was edited. Your registration was removed. Please review the updated event and register again after admin approval.')}</p>
            </article>
        `;
    }).join('');
}

function renderInterests(interests) {
    const list = document.getElementById('student-interest-list');
    if (!list) {
        return;
    }

    list.innerHTML = '';
    if (!interests.length) {
        list.innerHTML = '<span class="interest-badge">No interests saved yet</span>';
        return;
    }

    interests.forEach((interest) => {
        const badge = document.createElement('span');
        badge.className = 'interest-badge';
        badge.textContent = interest;
        list.appendChild(badge);
    });
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

function generateCalendarDays() {
    const studentApp = window.EventStudent;
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

        if (thisDay.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }

        const eventsOnDay = calendarRegistrations.filter((eventItem) => {
            const eventDate = studentApp.safeDate(eventItem.eventDate);
            if (!eventDate) {
                return false;
            }
            return eventDate.getDate() === day
                && eventDate.getMonth() === currentMonth
                && eventDate.getFullYear() === currentYear;
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
            tooltip.innerHTML = eventsOnDay.map((eventItem) => `
                <div class="tooltip-item">
                    <span>${studentApp.escapeHtml(eventItem.eventName || 'Event')}</span>
                    <span>${studentApp.escapeHtml(studentApp.formatTime(eventItem.eventDate))}</span>
                </div>
            `).join('');
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
    const studentApp = window.EventStudent;
    const session = studentApp.requireSession('login.html');
    if (!session) {
        return;
    }

    studentApp.attachLogoutHandlers();

    try {
        const [profile, registrationsData, notificationsData] = await Promise.all([
            studentApp.fetchJson(`${studentApp.API_BASE}/user/${encodeURIComponent(session.email)}`),
            studentApp.fetchJson(`${studentApp.API_BASE}/my-events/${encodeURIComponent(session.email)}`),
            studentApp.fetchJson(`${studentApp.API_BASE}/student-notifications/${encodeURIComponent(session.email)}`)
        ]);

        studentApp.storeSession({
            email: profile.email || session.email,
            name: profile.name || session.name,
            token: session.token
        });

        const registrations = Array.isArray(registrationsData.events) ? registrationsData.events : [];
        const editedNotifications = Array.isArray(notificationsData.notifications)
            ? notificationsData.notifications
            : [];
        const attendedEvents = registrations.filter((item) => item.status === 'attended');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        calendarRegistrations = registrations.filter((item) => {
            const eventDate = studentApp.safeDate(item.eventDate);
            return eventDate && eventDate >= thirtyDaysAgo;
        });

        document.getElementById('dashboard-welcome').textContent = `Welcome, ${profile.name || 'Student'}`;
        document.getElementById('attended-count').textContent = attendedEvents.length;
        document.getElementById('registered-count').textContent = registrations.length;
        document.getElementById('attended-subtext').textContent = attendedEvents.length
            ? `${attendedEvents.length} completed event${attendedEvents.length === 1 ? '' : 's'}`
            : 'No completed events yet';
        document.getElementById('registered-subtext').textContent = registrations.length
            ? `${registrations.length} event${registrations.length === 1 ? '' : 's'} saved in My Events`
            : 'No registrations yet';
        renderInterests(profile.interests || []);
        renderEditedNotifications(editedNotifications);

        updateCalendarHeader();
        generateCalendarDays();

        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    } catch (error) {
        console.error('Failed to load student dashboard:', error);
        document.getElementById('edited-events-panel')?.classList.add('hidden');
        document.getElementById('calendar-days').innerHTML = '<p class="empty-state">Failed to load your calendar.</p>';
    }
});
