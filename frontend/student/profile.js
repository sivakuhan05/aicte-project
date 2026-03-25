let studentProfile = null;

function getInitials(name) {
    return (name || 'Student')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || 'ST';
}

function toggleEditMode(showEditor) {
    document.getElementById('profile-view').classList.toggle('hidden', showEditor);
    document.getElementById('profile-form').classList.toggle('hidden', !showEditor);
    document.getElementById('edit-profile-btn').textContent = showEditor ? 'Close Editor' : 'Edit Profile';
}

function getSelectedInterests() {
    return Array.from(document.querySelectorAll('input[name="interest"]:checked')).map((input) => input.value);
}

function setSelectedInterests(interests) {
    const normalized = new Set(interests || []);
    document.querySelectorAll('input[name="interest"]').forEach((input) => {
        input.checked = normalized.has(input.value);
    });
}

function loadProfileIntoView(profile) {
    const studentApp = window.EventStudent;
    const interestsMarkup = (profile.interests || []).length
        ? profile.interests.map((interest) => `<span class="interest-badge">${studentApp.escapeHtml(interest)}</span>`).join('')
        : '<span class="interest-badge">No interests saved yet</span>';

    document.getElementById('profile-hero-name').textContent = profile.name || 'Student';
    document.getElementById('profile-hero-email').textContent = profile.email || 'Not set';
    document.getElementById('profile-avatar').textContent = getInitials(profile.name);

    document.getElementById('profile-name').textContent = profile.name || 'Not set';
    document.getElementById('profile-email').textContent = profile.email || 'Not set';
    document.getElementById('profile-gender').textContent = profile.gender || 'Not set';
    document.getElementById('profile-department').textContent = profile.department || 'Not set';
    document.getElementById('profile-interests').innerHTML = interestsMarkup;

    document.getElementById('student-name').value = profile.name || '';
    document.getElementById('student-email').value = profile.email || '';
    document.getElementById('student-gender').value = profile.gender || '';
    document.getElementById('student-department').value = studentApp.normalizeDepartment(profile.department || '');
    setSelectedInterests(profile.interests || []);
}

document.addEventListener('DOMContentLoaded', async () => {
    const studentApp = window.EventStudent;
    const session = studentApp.requireSession('login.html');
    if (!session) {
        return;
    }

    studentApp.attachLogoutHandlers();

    async function refreshProfile() {
        studentProfile = await studentApp.fetchJson(
            `${studentApp.API_BASE}/user/${encodeURIComponent(studentApp.getSession().email)}`
        );
        loadProfileIntoView(studentProfile);
    }

    try {
        await refreshProfile();
        toggleEditMode(false);
    } catch (error) {
        console.error('Failed to load student profile:', error);
        alert(error.message || 'Failed to load student profile.');
        return;
    }

    document.getElementById('edit-profile-btn').addEventListener('click', () => {
        const showEditor = document.getElementById('profile-form').classList.contains('hidden');
        if (showEditor) {
            loadProfileIntoView(studentProfile);
        }
        toggleEditMode(showEditor);
    });

    document.getElementById('cancel-profile-btn').addEventListener('click', () => {
        loadProfileIntoView(studentProfile);
        toggleEditMode(false);
    });

    document.getElementById('profile-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const currentSession = studentApp.getSession();
        const payload = {
            email: currentSession.email,
            newEmail: document.getElementById('student-email').value.trim(),
            name: document.getElementById('student-name').value.trim(),
            gender: document.getElementById('student-gender').value,
            department: document.getElementById('student-department').value,
            interests: getSelectedInterests()
        };

        if (!payload.interests.length) {
            alert('Please select at least one interested domain.');
            return;
        }

        try {
            const result = await studentApp.fetchJson(`${studentApp.API_BASE}/update-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${currentSession.token}`
                },
                body: JSON.stringify(payload)
            });

            studentApp.storeSession({
                email: result.user.email,
                name: result.user.name,
                token: result.token || currentSession.token
            });

            studentProfile = result.user;
            loadProfileIntoView(studentProfile);
            toggleEditMode(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert(error.message || 'Failed to update your profile.');
        }
    });
});
