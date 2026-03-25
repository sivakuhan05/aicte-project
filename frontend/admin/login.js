document.addEventListener('DOMContentLoaded', () => {
    const adminApp = window.EventAdmin;
    const form = document.getElementById('admin-login-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            alert('Please enter your admin email and password.');
            return;
        }

        try {
            const result = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            adminApp.storeSession({
                username: result.admin.username,
                email: result.admin.email
            });

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Admin login failed:', error);
            alert(error.message || 'Unable to log in right now.');
        }
    });
});
