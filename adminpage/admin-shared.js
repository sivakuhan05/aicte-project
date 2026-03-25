(function () {
    const API_BASE = 'http://localhost:3000';
    const categoryAliases = {
        technical: 'Tech',
        tech: 'Tech',
        'non-tech': 'Non-Tech',
        'non tech': 'Non-Tech',
        'non-technical': 'Non-Tech',
        'non technical': 'Non-Tech',
        food: 'Food',
        sport: 'Sports',
        sports: 'Sports',
        music: 'Music',
        arts: 'Arts',
        art: 'Arts',
        general: 'General'
    };

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

    function formatDateTime(value) {
        const parsed = safeDate(value);
        if (!parsed) {
            return 'Date pending';
        }
        return `${parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })} | ${parsed.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    }

    function formatShortDate(value) {
        const parsed = safeDate(value);
        if (!parsed) {
            return 'Date pending';
        }
        return parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    function formatTime(value) {
        const parsed = safeDate(value);
        if (!parsed) {
            return 'Time pending';
        }
        return parsed.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function normalizeCategory(value) {
        const cleaned = String(value || '').trim();
        const lowered = cleaned.toLowerCase();
        if (lowered.includes('sport')) {
            return 'Sports';
        }
        return categoryAliases[lowered] || cleaned || 'General';
    }

    function normalizeAssociation(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getSession() {
        return {
            username: localStorage.getItem('adminUsername') || '',
            email: localStorage.getItem('adminEmail') || ''
        };
    }

    function storeSession({ username, email }) {
        if (username) {
            localStorage.setItem('adminUsername', username);
        }
        if (email) {
            localStorage.setItem('adminEmail', email);
        }
    }

    function clearSession() {
        localStorage.removeItem('adminUsername');
        localStorage.removeItem('adminEmail');
    }

    function requireSession(redirectPath = 'login.html') {
        const session = getSession();
        if (!session.email) {
            window.location.href = redirectPath;
            return null;
        }
        return session;
    }

    function attachLogoutHandlers() {
        document.querySelectorAll('[data-admin-logout]').forEach((element) => {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                clearSession();
                window.location.href = 'login.html';
            });
        });
    }

    function buildStarMarkup(averageRating, ratingCount) {
        const average = Number(averageRating) || 0;
        const count = Number(ratingCount) || 0;
        const rounded = Math.round(average);
        const stars = Array.from({ length: 5 }, (_, index) => (
            `<span class="star ${index < rounded ? 'filled' : 'empty'}">&#9733;</span>`
        )).join('');

        if (!count) {
            return `
                <div class="star-summary">
                    <div class="star-row">${stars}</div>
                    <p class="rating-meta">No ratings yet</p>
                </div>
            `;
        }

        return `
            <div class="star-summary">
                <div class="star-row">${stars}</div>
                <p class="rating-meta"><span class="rating-value">${average.toFixed(1)}</span>/5 from ${count} rating${count === 1 ? '' : 's'}</p>
            </div>
        `;
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (!response.ok) {
            const requestError = new Error(data.message || 'Request failed.');
            requestError.status = response.status;
            requestError.data = data;
            throw requestError;
        }

        return data;
    }

    window.EventAdmin = {
        API_BASE,
        attachLogoutHandlers,
        buildStarMarkup,
        clearSession,
        escapeHtml,
        fetchJson,
        formatDateTime,
        formatShortDate,
        formatTime,
        getSession,
        normalizeAssociation,
        normalizeCategory,
        requireSession,
        safeDate,
        storeSession
    };
}());
