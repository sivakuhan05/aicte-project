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
        return `<div class="star-summary ${small ? 'small' : ''}"><div class="star-row">${stars}</div><p class="rating-meta">No student ratings yet</p></div>`;
    }

    return `<div class="star-summary ${small ? 'small' : ''}"><div class="star-row">${stars}</div><p class="rating-meta"><span class="rating-value">${average.toFixed(1)}</span>/5 from ${count} rating${count === 1 ? '' : 's'}</p></div>`;
}

async function fetchOrganizerEvents(organizerUsername) {
    const response = await fetch(`http://localhost:3000/organizer-events/${encodeURIComponent(organizerUsername)}`);
    if (!response.ok) {
        throw new Error(`Failed to load organizer events (${response.status})`);
    }
    return response.json();
}

async function fetchFeedbackForEvent(event) {
    const organizerUsername = localStorage.getItem('organizerUsername') || '';
    const query = new URLSearchParams({
        eventName: event.eventName || '',
        organizerUsername
    });
    const response = await fetch(`http://localhost:3000/feedback/event?${query.toString()}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Failed to load feedback');
    }
    return data;
}

function renderFeedbackPanel(panel, data) {
    const feedbacks = Array.isArray(data.feedbacks) ? data.feedbacks : [];

    if (!feedbacks.length) {
        panel.innerHTML = `
            <h4>Student Feedback</h4>
            ${buildStarMarkup(data.averageRating, data.ratingCount, true)}
            <p class="feedback-empty">No student feedback has been posted yet.</p>
        `;
        return;
    }

    panel.innerHTML = `
        <h4>Student Feedback</h4>
        ${buildStarMarkup(data.averageRating, data.ratingCount, true)}
        <div class="feedback-list">
            ${feedbacks.map((item) => `
                <article class="feedback-item">
                    <div class="feedback-head">
                        <div>
                            <strong>${escapeHtml(item.participantName || 'Participant')}</strong>
                            <span>${escapeHtml(item.participantEmail || 'No email provided')}</span>
                        </div>
                        ${buildStarMarkup(item.rating, item.rating ? 1 : 0, true)}
                    </div>
                    <div class="feedback-body">
                        <p>${escapeHtml(item.feedback || 'No written feedback provided.')}</p>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function formatDateLine(eventDate, location) {
    if (!eventDate) {
        return escapeHtml(location || 'Location pending');
    }
    return `${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} | ${escapeHtml(location || 'Location pending')}`;
}

function renderEvents(events) {
    const eventList = document.getElementById('event-list');
    eventList.innerHTML = '';

    if (!events.length) {
        eventList.innerHTML = '<p class="empty-state">No organized events are available within 1 year.</p>';
        return;
    }

    const sortedEvents = [...events].sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

    sortedEvents.forEach((event) => {
        const eventCard = document.createElement('article');
        eventCard.className = 'event-card';

        const eventDate = safeDate(event.eventDate);
        const now = new Date();
        const isPastEvent = Boolean(eventDate && eventDate < now);
        const completion = event.completion || null;
        const approvalStatus = String(event.approvalStatus || 'pending').toLowerCase();
        const participatedCount = completion && completion.participantsParticipated !== undefined
            ? completion.participantsParticipated
            : 'Not reported yet';
        const statusMarkup = approvalStatus !== 'approved'
            ? '<span class="event-pill pending">Pending Approval</span>'
            : (completion
                ? '<span class="event-pill reported">Reported</span>'
                : (isPastEvent
                    ? '<span class="event-pill completed">Completed</span>'
                    : '<span class="event-pill upcoming">Upcoming</span>'));

        eventCard.innerHTML = `
            <div class="event-image">
                ${event.image ? `<img src="${event.image}" alt="${escapeHtml(event.eventName || 'Event image')}">` : '<div class="no-image">No image uploaded</div>'}
            </div>
            <div class="event-main">
                <div class="event-header-row">
                    <div class="event-title-block">
                        <h3>${escapeHtml(event.eventName || 'Untitled event')}</h3>
                        <p class="event-meta-line">${formatDateLine(eventDate, event.eventLocation)}</p>
                    </div>
                    ${statusMarkup}
                </div>
                <div class="event-stats">
                    <div class="stat-chip">
                        <strong>Applied</strong>
                        <span>${Number(event.participantCount) || 0}</span>
                    </div>
                    <div class="stat-chip">
                        <strong>Participated</strong>
                        <span>${escapeHtml(participatedCount)}</span>
                    </div>
                    <div class="stat-chip">
                        <strong>Student rating</strong>
                        ${buildStarMarkup(event.averageRating, event.ratingCount, true)}
                    </div>
                </div>
                <div class="event-actions">
                    ${event._id ? '<button class="btn-outline edit-event-btn" type="button">Edit Event</button>' : ''}
                    <button class="btn-outline view-details-btn" type="button">View Details</button>
                    <button class="btn-outline view-feedback-btn" type="button">View Feedback</button>
                    ${isPastEvent && !completion ? '<button class="btn-primary complete-btn" type="button">Add Completion Details</button>' : ''}
                </div>
                <div class="event-extra hidden">
                    <div class="detail-grid">
                        <div class="info-card"><strong>Category</strong><span>${escapeHtml(event.category || 'General')}</span></div>
                        <div class="info-card"><strong>Applied participants</strong><span>${Number(event.participantCount) || 0}</span></div>
                        <div class="info-card"><strong>Participants participated</strong><span>${escapeHtml(participatedCount)}</span></div>
                        <div class="info-card"><strong>Approval</strong><span>${escapeHtml(approvalStatus === 'approved' ? 'Approved' : 'Pending approval')}</span></div>
                        <div class="info-card"><strong>Student feedback count</strong><span>${Number(event.feedbackCount) || 0}</span></div>
                    </div>
                    <div class="event-metrics">
                        <p>${escapeHtml(event.eventDescription || 'No event description available.')}</p>
                        ${completion && completion.feedback ? `<p><strong>Club / Association summary:</strong> ${escapeHtml(completion.feedback)}</p>` : '<p><strong>Club / Association summary:</strong> Not submitted yet.</p>'}
                    </div>
                    ${isPastEvent && !completion ? `
                        <form class="completion-form">
                            <label>
                                Participants participated
                                <input type="number" name="participantsParticipated" min="0" required placeholder="Enter attended count">
                            </label>
                            <label>
                                Overall feedback
                                <textarea name="feedback" rows="4" required placeholder="Write the club or association summary for this event"></textarea>
                            </label>
                            <div class="form-actions">
                                <button class="btn-primary submit-completion-btn" type="submit">Save Completion</button>
                            </div>
                        </form>
                    ` : ''}
                </div>
                <div class="feedback-panel hidden"></div>
            </div>
        `;

        const detailsButton = eventCard.querySelector('.view-details-btn');
        const feedbackButton = eventCard.querySelector('.view-feedback-btn');
        const completionButton = eventCard.querySelector('.complete-btn');
        const editButton = eventCard.querySelector('.edit-event-btn');
        const extraPanel = eventCard.querySelector('.event-extra');
        const feedbackPanel = eventCard.querySelector('.feedback-panel');
        const completionForm = eventCard.querySelector('.completion-form');

        if (editButton) {
            editButton.addEventListener('click', () => {
                window.location.href = `hostevent.html?eventId=${encodeURIComponent(event._id)}`;
            });
        }

        detailsButton.addEventListener('click', () => {
            extraPanel.classList.toggle('hidden');
            detailsButton.textContent = extraPanel.classList.contains('hidden') ? 'View Details' : 'Hide Details';
        });

        feedbackButton.addEventListener('click', async () => {
            if (!feedbackPanel.dataset.loaded) {
                feedbackPanel.classList.remove('hidden');
                feedbackPanel.innerHTML = '<p class="meta">Loading student feedback...</p>';
                try {
                    const data = await fetchFeedbackForEvent(event);
                    renderFeedbackPanel(feedbackPanel, data);
                    feedbackPanel.dataset.loaded = 'true';
                } catch (error) {
                    console.error('Error loading feedback:', error);
                    feedbackPanel.innerHTML = '<p class="feedback-empty">Failed to load feedback for this event.</p>';
                }
                feedbackButton.textContent = 'Hide Feedback';
                return;
            }

            feedbackPanel.classList.toggle('hidden');
            feedbackButton.textContent = feedbackPanel.classList.contains('hidden') ? 'View Feedback' : 'Hide Feedback';
        });

        if (completionButton) {
            completionButton.addEventListener('click', () => {
                extraPanel.classList.remove('hidden');
                detailsButton.textContent = 'Hide Details';
                const input = eventCard.querySelector('input[name="participantsParticipated"]');
                if (input) {
                    input.focus();
                }
            });
        }

        if (completionForm) {
            completionForm.addEventListener('submit', async (submitEvent) => {
                submitEvent.preventDefault();
                const formData = new FormData(completionForm);
                const participantsParticipated = formData.get('participantsParticipated');
                const feedback = formData.get('feedback');

                try {
                    const response = await fetch(`http://localhost:3000/events/${event._id}/completion`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ participantsParticipated, feedback })
                    });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.message || 'Failed to save completion');
                    }

                    event.completion = result.event && result.event.completion ? result.event.completion : {
                        participantsParticipated: Number(participantsParticipated),
                        feedback
                    };
                    renderEvents(sortedEvents);
                } catch (error) {
                    console.error('Error saving completion:', error);
                    alert(error.message || 'Failed to save completion details.');
                }
            });
        }

        eventList.appendChild(eventCard);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const organizerUsername = localStorage.getItem('organizerUsername');
    if (!organizerUsername) {
        window.location.href = 'orglog.html';
        return;
    }

    try {
        const events = await fetchOrganizerEvents(organizerUsername);
        renderEvents(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        document.getElementById('event-list').innerHTML = '<p class="empty-state">Failed to load organized events.</p>';
    }
});
