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

function renderEmptyState(list) {
    list.innerHTML = '<p class="empty-state">All past events already have club or association summaries.</p>';
}

function buildCardMarkup(event) {
    const eventDate = safeDate(event.eventDate);
    const dateLabel = eventDate
        ? `${eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
        : 'Date unavailable';

    return `
        <div class="afterevent-top">
            <div class="event-time">${escapeHtml(dateLabel)}<span>${escapeHtml(event.eventLocation || 'Location pending')}</span></div>
            <div class="event-content">
                <h4>${escapeHtml(event.eventName || 'Untitled event')}</h4>
                <p>${escapeHtml(event.category || 'General')}</p>
            </div>
            <div class="info-card">
                <strong>Applied</strong>
                <span>${Number(event.participantCount) || 0}</span>
            </div>
            <div class="info-card">
                <strong>Feedback</strong>
                <span>${Number(event.feedbackCount) || 0}</span>
            </div>
        </div>
        <div class="afterevent-form">
            <label>
                Participants participated
                <input type="number" name="participantsParticipated" min="0" placeholder="Enter attended count" required>
            </label>
            <label>
                Overall feedback
                <textarea name="feedback" rows="4" placeholder="Share the club or association summary for this event" required></textarea>
            </label>
            <div class="form-actions">
                <button class="btn-primary afterevent-submit" type="button">Submit Feedback</button>
            </div>
        </div>
    `;
}

async function fetchPendingEvents(organizerUsername) {
    const list = document.getElementById('after-event-list');
    list.innerHTML = '<p class="meta">Loading events...</p>';

    try {
        const response = await fetch(`http://localhost:3000/organizer-events/${encodeURIComponent(organizerUsername)}`);
        if (!response.ok) {
            throw new Error(`Failed to load events (${response.status})`);
        }

        const events = await response.json();
        const now = new Date();

        const pending = events
            .filter((event) => {
                const eventDate = safeDate(event.eventDate);
                if (!eventDate) {
                    return false;
                }
                return eventDate < now && !event.completion;
            })
            .sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

        renderPendingEvents(pending, list);
    } catch (error) {
        console.error('Error fetching pending events:', error);
        list.innerHTML = '<p class="empty-state">Failed to load pending club summaries.</p>';
    }
}

function renderPendingEvents(events, list) {
    list.innerHTML = '';

    if (!events.length) {
        renderEmptyState(list);
        return;
    }

    events.forEach((event) => {
        const card = document.createElement('article');
        card.className = 'event-item-compact afterevent-card';
        card.innerHTML = buildCardMarkup(event);

        const formPanel = card.querySelector('.afterevent-form');
        const submitButton = card.querySelector('.afterevent-submit');

        submitButton.addEventListener('click', async () => {
            const participantsParticipated = formPanel.querySelector('input[name="participantsParticipated"]').value;
            const feedback = formPanel.querySelector('textarea[name="feedback"]').value.trim();
            const parsedParticipants = Number(participantsParticipated);

            if (participantsParticipated === '' || Number.isNaN(parsedParticipants) || parsedParticipants < 0 || !feedback) {
                alert('Please enter participated count and the club or association summary.');
                return;
            }

            try {
                submitButton.disabled = true;
                submitButton.textContent = 'Saving...';
                const response = await fetch(`http://localhost:3000/events/${event._id}/completion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ participantsParticipated: parsedParticipants, feedback })
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.message || 'Failed to save feedback');
                }

                card.remove();
                if (!list.querySelector('.afterevent-card')) {
                    renderEmptyState(list);
                }
            } catch (error) {
                console.error('Error saving feedback:', error);
                alert(error.message || 'Failed to save the club or association summary.');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Feedback';
            }
        });

        list.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const organizerUsername = localStorage.getItem('organizerUsername');
    if (!organizerUsername) {
        window.location.href = 'orglog.html';
        return;
    }

    fetchPendingEvents(organizerUsername);
});
