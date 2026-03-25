function sortMyEvents(left, right) {
    const studentApp = window.EventStudent;
    const leftDate = studentApp.safeDate(left.eventDate);
    const rightDate = studentApp.safeDate(right.eventDate);
    return (leftDate ? leftDate.getTime() : Number.MAX_SAFE_INTEGER)
        - (rightDate ? rightDate.getTime() : Number.MAX_SAFE_INTEGER);
}

function sortCompletedEvents(left, right) {
    const studentApp = window.EventStudent;
    const leftDate = studentApp.safeDate(left.eventDate);
    const rightDate = studentApp.safeDate(right.eventDate);
    return (rightDate ? rightDate.getTime() : 0) - (leftDate ? leftDate.getTime() : 0);
}

function buildMyEventCard(eventItem) {
    const studentApp = window.EventStudent;
    const card = document.createElement('article');
    card.className = 'event-card';

    const isUpcoming = eventItem.status === 'upcoming';
    const statusClass = isUpcoming ? 'upcoming' : 'completed';
    const statusLabel = isUpcoming ? 'Registered' : 'Completed';
    const clubAssociation = eventItem.clubAssociation || 'Open to All';
    const feedbackData = eventItem.studentFeedback || null;
    const selectedRating = Number(feedbackData?.rating) || 0;

    function getFeedbackButtonLabel() {
        return eventItem.studentFeedback && eventItem.studentFeedback.feedback
            ? 'Edit Feedback'
            : 'Give Feedback';
    }

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
                <span class="event-pill ${statusClass}">${statusLabel}</span>
            </div>
            <p class="event-summary">${studentApp.escapeHtml(studentApp.truncateText(eventItem.eventDescription, 170) || 'No event description available.')}</p>
            <div class="status-row">
                <span class="status-chip">Category: ${studentApp.escapeHtml(studentApp.normalizeCategory(eventItem.category || 'General'))}</span>
                <span class="status-chip">Club / Association: ${studentApp.escapeHtml(clubAssociation)}</span>
                <span class="status-chip">${studentApp.escapeHtml(statusLabel)}</span>
            </div>
            <div class="event-actions">
                <button type="button" class="btn-outline view-details-btn">View Event Details</button>
                <button type="button" class="btn-primary open-link-btn"${eventItem.externalFormUrl ? '' : ' disabled'}>${eventItem.externalFormUrl ? 'Open Registration URL' : 'No URL Added'}</button>
                ${isUpcoming ? '' : `<button type="button" class="btn-outline feedback-toggle-btn">${getFeedbackButtonLabel()}</button>`}
            </div>
            <div class="event-extra hidden">
                <div class="detail-grid">
                    <div class="info-card"><strong>Category</strong><span>${studentApp.escapeHtml(studentApp.normalizeCategory(eventItem.category || 'General'))}</span></div>
                    <div class="info-card"><strong>Club / Association</strong><span>${studentApp.escapeHtml(clubAssociation)}</span></div>
                    <div class="info-card"><strong>Status</strong><span>${statusLabel}</span></div>
                    <div class="info-card"><strong>Registered At</strong><span>${studentApp.escapeHtml(studentApp.formatDateTime(eventItem.registeredAt))}</span></div>
                </div>
                <div class="event-metrics">
                    <p>${studentApp.escapeHtml(eventItem.eventDescription || 'No event description available.')}</p>
                    <p><strong>Location:</strong> ${studentApp.escapeHtml(eventItem.eventLocation || 'Location pending')}</p>
                    <p><strong>Registration link:</strong> ${eventItem.externalFormUrl ? 'Saved from organizer event form.' : 'Organizer has not added a registration URL yet.'}</p>
                </div>
                ${isUpcoming ? '' : `
                    <form class="student-feedback-form hidden">
                        <label class="field-group">
                            <span class="field-label-inline">Rating</span>
                            <div class="feedback-rating-group">
                                ${[1, 2, 3, 4, 5].map((value) => `
                                    <label class="feedback-rating-option">
                                        <input type="radio" name="rating" value="${value}" ${selectedRating === value ? 'checked' : ''}>
                                        <span>${value} Star${value === 1 ? '' : 's'}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </label>
                        <label class="field-group">
                            <span class="field-label-inline">Text Feedback</span>
                            <textarea name="feedback" class="feedback-textarea" rows="4" placeholder="Share your feedback about this event"></textarea>
                        </label>
                        <div class="form-actions">
                            <button type="submit" class="btn-primary">${getFeedbackButtonLabel()}</button>
                        </div>
                    </form>
                `}
            </div>
        </div>
    `;

    const detailsButton = card.querySelector('.view-details-btn');
    const extraPanel = card.querySelector('.event-extra');
    const openLinkButton = card.querySelector('.open-link-btn');
    const feedbackToggleButton = card.querySelector('.feedback-toggle-btn');
    const feedbackForm = card.querySelector('.student-feedback-form');

    detailsButton.addEventListener('click', () => {
        extraPanel.classList.toggle('hidden');
        detailsButton.textContent = extraPanel.classList.contains('hidden')
            ? 'View Event Details'
            : 'Hide Event Details';
    });

    if (eventItem.externalFormUrl) {
        openLinkButton.addEventListener('click', () => {
            window.location.href = eventItem.externalFormUrl;
        });
    }

    if (feedbackToggleButton && feedbackForm) {
        const feedbackTextarea = feedbackForm.querySelector('textarea[name="feedback"]');
        const feedbackSubmitButton = feedbackForm.querySelector('button[type="submit"]');
        if (feedbackTextarea) {
            feedbackTextarea.value = feedbackData?.feedback || '';
        }

        feedbackToggleButton.addEventListener('click', () => {
            extraPanel.classList.remove('hidden');
            detailsButton.textContent = 'Hide Event Details';
            feedbackForm.classList.toggle('hidden');
            feedbackToggleButton.textContent = feedbackForm.classList.contains('hidden')
                ? getFeedbackButtonLabel()
                : 'Hide Feedback Form';
        });

        feedbackForm.addEventListener('submit', async (submitEvent) => {
            submitEvent.preventDefault();

            const ratingValue = Number(feedbackForm.querySelector('input[name="rating"]:checked')?.value || 0);
            const feedbackValue = feedbackForm.querySelector('textarea[name="feedback"]').value.trim();

            if (!ratingValue || !feedbackValue) {
                alert('Please choose a rating and enter your feedback.');
                return;
            }

            try {
                const result = await studentApp.fetchJson(`${studentApp.API_BASE}/submit-feedback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        participantName: eventItem.participant?.name || studentApp.getSession().name,
                        participantEmail: eventItem.participant?.email || studentApp.getSession().email,
                        eventId: eventItem.eventId,
                        eventName: eventItem.eventName,
                        organizerUsername: eventItem.organizerUsername,
                        rating: ratingValue,
                        feedback: feedbackValue
                    })
                });

                eventItem.studentFeedback = result.feedback || {
                    rating: ratingValue,
                    feedback: feedbackValue
                };
                alert(result.message || 'Feedback submitted successfully.');
                if (feedbackSubmitButton) {
                    feedbackSubmitButton.textContent = getFeedbackButtonLabel();
                }
                feedbackToggleButton.textContent = getFeedbackButtonLabel();
                feedbackForm.classList.add('hidden');
            } catch (error) {
                console.error('Failed to submit feedback:', error);
                alert(error.message || 'Failed to submit feedback right now.');
            }
        });
    }

    return card;
}

function renderEventSection(containerId, events, emptyMessage, sorter) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!events.length) {
        container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }

    events.sort(sorter).forEach((eventItem) => {
        container.appendChild(buildMyEventCard(eventItem));
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
        const registrationsData = await studentApp.fetchJson(
            `${studentApp.API_BASE}/my-events/${encodeURIComponent(session.email)}`
        );
        const events = Array.isArray(registrationsData.events) ? registrationsData.events : [];
        const upcomingEvents = events.filter((item) => item.status === 'upcoming');
        const completedEvents = events.filter((item) => item.status === 'attended');

        document.getElementById('my-events-count').textContent = upcomingEvents.length;
        document.getElementById('my-attended-count').textContent = completedEvents.length;
        document.getElementById('my-events-subtext').textContent = upcomingEvents.length
            ? `${upcomingEvents.length} event${upcomingEvents.length === 1 ? '' : 's'} currently registered`
            : 'No registered events yet';
        document.getElementById('my-attended-subtext').textContent = completedEvents.length
            ? `${completedEvents.length} event${completedEvents.length === 1 ? '' : 's'} already completed`
            : 'No completed events yet';

        renderEventSection(
            'registered-events-list',
            upcomingEvents,
            'No already registered upcoming events right now.',
            sortMyEvents
        );
        renderEventSection(
            'completed-events-list',
            completedEvents,
            'No completed events available yet.',
            sortCompletedEvents
        );
    } catch (error) {
        console.error('Failed to load registered events:', error);
        document.getElementById('registered-events-list').innerHTML = '<p class="empty-state">Failed to load your registered events.</p>';
        document.getElementById('completed-events-list').innerHTML = '<p class="empty-state">Failed to load your completed events.</p>';
    }
});
