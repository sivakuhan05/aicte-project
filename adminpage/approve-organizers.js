function buildOrganizerCard(organizer) {
    const adminApp = window.EventAdmin;
    const card = document.createElement('article');
    card.className = 'event-card';

    card.innerHTML = `
        <div class="event-image">
            <div class="no-image">Organization Request</div>
        </div>
        <div class="event-main">
            <div class="event-header-row">
                <div class="event-title-block">
                    <h3>${adminApp.escapeHtml(organizer.username || 'Contact Name')}</h3>
                    <p class="event-meta-line">${adminApp.escapeHtml(organizer.clubAssociation || 'Club / Association not set')}</p>
                </div>
                <span class="event-pill pending">Pending</span>
            </div>
            <div class="status-row">
                <span class="status-chip">Email: ${adminApp.escapeHtml(organizer.email || 'Not set')}</span>
                <span class="status-chip">Created: ${adminApp.escapeHtml(adminApp.formatDateTime(organizer.createdAt))}</span>
            </div>
            <p class="page-note">${adminApp.escapeHtml(organizer.bio || 'No club or association description added yet.')}</p>
            <div class="event-actions">
                <button type="button" class="btn-primary approve-btn">Approve Organization</button>
            </div>
        </div>
    `;

    card.querySelector('.approve-btn').addEventListener('click', async () => {
        const button = card.querySelector('.approve-btn');
        button.disabled = true;
        button.textContent = 'Approving...';

        try {
            await adminApp.fetchJson(`${adminApp.API_BASE}/admin/organizers/${organizer.id}/approve`, {
                method: 'POST'
            });
            card.remove();

            const countElement = document.getElementById('pending-organizers-count');
            countElement.textContent = Math.max(0, Number(countElement.textContent) - 1);

            if (!document.getElementById('pending-organizers-list').children.length) {
                document.getElementById('pending-organizers-list').innerHTML = '<p class="empty-state">No organization approvals are waiting right now.</p>';
            }
        } catch (error) {
            console.error('Failed to approve organization:', error);
            button.disabled = false;
            button.textContent = 'Approve Organization';
            alert(error.message || 'Failed to approve organization.');
        }
    });

    return card;
}

document.addEventListener('DOMContentLoaded', async () => {
    const adminApp = window.EventAdmin;
    const session = adminApp.requireSession('login.html');
    if (!session) {
        return;
    }

    adminApp.attachLogoutHandlers();

    const list = document.getElementById('pending-organizers-list');
    list.innerHTML = '<p class="meta">Loading organization approvals...</p>';

    try {
        const data = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/organizers/pending`);
        const organizers = Array.isArray(data.organizers) ? data.organizers : [];
        document.getElementById('pending-organizers-count').textContent = Number(data.count) || organizers.length;

        if (!organizers.length) {
            list.innerHTML = '<p class="empty-state">No organization approvals are waiting right now.</p>';
            return;
        }

        list.innerHTML = '';
        organizers.forEach((organizer) => {
            list.appendChild(buildOrganizerCard(organizer));
        });
    } catch (error) {
        console.error('Failed to load pending organizations:', error);
        list.innerHTML = '<p class="empty-state">Failed to load pending organizations.</p>';
    }
});
