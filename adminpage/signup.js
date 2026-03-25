document.addEventListener('DOMContentLoaded', () => {
    const adminApp = window.EventAdmin;
    const form = document.getElementById('admin-signup-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!username || !email || !password || !confirmPassword) {
            alert('Please complete all admin fields.');
            return;
        }

        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        try {
            const result = await adminApp.fetchJson(`${adminApp.API_BASE}/admin/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            adminApp.storeSession({
                username: result.admin?.username || username,
                email: result.admin?.email || email
            });

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Admin signup failed:', error);
            alert(error.message || 'Unable to create the admin account right now.');
        }
    });
});
