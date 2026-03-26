document.addEventListener('DOMContentLoaded', () => {
    const studentApp = window.EventStudent;
    const currentYear = new Date().getFullYear() % 100;
    const allowedYears = new Set(Array.from({ length: 5 }, (_, index) => String((currentYear - index + 100) % 100).padStart(2, '0')));

    function isValidPsgEmail(email) {
        const trimmedEmail = String(email || '').trim().toLowerCase();
        const match = trimmedEmail.match(/^(\d{2})([a-z])(\d{3})@psgtech\.ac\.in$/i);
        return Boolean(match && allowedYears.has(match[1]));
    }

    const form = document.getElementById('login-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            alert('Please enter your email and password.');
            return;
        }

        if (!isValidPsgEmail(email)) {
            alert('This mail is not supported. Use college mail.');
            return;
        }

        try {
            const data = await studentApp.fetchJson(`${studentApp.API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            studentApp.storeSession({
                email: data.email,
                name: data.name,
                token: data.token
            });

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Student login failed:', error);
            alert(error.message || 'Unable to log in right now.');
        }
    });
});
