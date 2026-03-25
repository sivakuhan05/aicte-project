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
        'food stalls': 'Food',
        sport: 'Sports',
        ports: 'Sports',
        sports: 'Sports',
        'sports events': 'Sports',
        music: 'Music',
        'music events': 'Music',
        arts: 'Arts',
        art: 'Arts',
        general: 'General'
    };
    const departmentAliases = {
        cse: 'CSE',
        'computer science': 'CSE',
        'computer science and engineering': 'CSE',
        it: 'IT',
        'information technology': 'IT',
        mech: 'MECH',
        mechanical: 'MECH',
        'mechanical engineering': 'MECH',
        ece: 'ECE',
        electronics: 'ECE',
        'electronics and communication': 'ECE',
        'electronics and communication engineering': 'ECE',
        aiml: 'AIML',
        'ai ml': 'AIML',
        'ai and ml': 'AIML',
        'artificial intelligence and machine learning': 'AIML'
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
        const mapped = categoryAliases[lowered];
        return mapped || cleaned;
    }

    function normalizeAssociation(value) {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeDepartment(value) {
        const cleaned = String(value || '').trim();
        if (!cleaned) {
            return '';
        }

        const lowered = cleaned
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[/-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return departmentAliases[lowered] || cleaned.toUpperCase();
    }

    function matchesInterestedEvent(event, interests) {
        const normalizedInterests = (interests || []).map(normalizeCategory);
        return normalizedInterests.includes(normalizeCategory(event.category));
    }

    function eventVisibleToStudent(event, profile) {
        const accessScope = String(event?.accessScope || 'all').trim().toLowerCase();
        const allowedDepartments = Array.isArray(event?.allowedDepartments)
            ? event.allowedDepartments.map(normalizeDepartment).filter(Boolean)
            : [];

        if (accessScope !== 'department' || !allowedDepartments.length) {
            return true;
        }

        const studentDepartment = normalizeDepartment(profile?.department);
        return allowedDepartments.includes(studentDepartment);
    }

    function formatAccessLabel(event) {
        const allowedDepartments = Array.isArray(event?.allowedDepartments)
            ? event.allowedDepartments.map(normalizeDepartment).filter(Boolean)
            : [];

        if (String(event?.accessScope || 'all').trim().toLowerCase() !== 'department' || !allowedDepartments.length) {
            return 'All departments';
        }

        return allowedDepartments.join(', ');
    }

    function truncateText(value, maxLength = 140) {
        const text = String(value || '').trim();
        if (text.length <= maxLength) {
            return text;
        }
        return `${text.slice(0, maxLength).trim()}...`;
    }

    function getSession() {
        return {
            email: localStorage.getItem('studentEmail')
                || localStorage.getItem('loggedInUser')
                || localStorage.getItem('useremail')
                || '',
            name: localStorage.getItem('studentName')
                || localStorage.getItem('username')
                || '',
            token: localStorage.getItem('authToken') || ''
        };
    }

    function storeSession({ email, name, token }) {
        if (email) {
            localStorage.setItem('studentEmail', email);
            localStorage.setItem('loggedInUser', email);
            localStorage.setItem('useremail', email);
        }
        if (name) {
            localStorage.setItem('studentName', name);
            localStorage.setItem('username', name);
        }
        if (token) {
            localStorage.setItem('authToken', token);
        }
    }

    function clearSession() {
        [
            'studentEmail',
            'studentName',
            'loggedInUser',
            'username',
            'useremail',
            'authToken',
            'selectedEvent'
        ].forEach((key) => localStorage.removeItem(key));
    }

    function requireSession(redirectPath = 'login.html') {
        const session = getSession();
        if (!session.email) {
            window.location.href = redirectPath;
            return null;
        }
        return session;
    }

    function redirectIfAuthenticated(targetPath = 'dashboard.html') {
        const session = getSession();
        if (session.email) {
            window.location.href = targetPath;
            return true;
        }
        return false;
    }

    function attachLogoutHandlers() {
        document.querySelectorAll('[data-student-logout]').forEach((element) => {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                clearSession();
                window.location.href = 'login.html';
            });
        });
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
            const message = data.message || 'Request failed.';
            const requestError = new Error(message);
            requestError.status = response.status;
            requestError.data = data;
            throw requestError;
        }

        return data;
    }

    function buildRegistrationKey(item) {
        return item.eventId || `${item.eventName || ''}::${item.organizerUsername || ''}`;
    }

    window.EventStudent = {
        API_BASE,
        attachLogoutHandlers,
        buildRegistrationKey,
        clearSession,
        escapeHtml,
        fetchJson,
        formatDateTime,
        formatShortDate,
        formatTime,
        formatAccessLabel,
        getSession,
        eventVisibleToStudent,
        matchesInterestedEvent,
        normalizeAssociation,
        normalizeCategory,
        normalizeDepartment,
        redirectIfAuthenticated,
        requireSession,
        safeDate,
        storeSession,
        truncateText
    };
}());
