document.addEventListener('DOMContentLoaded', () => {
    const studentApp = window.EventStudent;

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
