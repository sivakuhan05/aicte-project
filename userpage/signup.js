document.addEventListener('DOMContentLoaded', () => {
    const studentApp = window.EventStudent;
    const form = document.getElementById('signup-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const interests = Array.from(
            document.querySelectorAll('input[name="interest"]:checked')
        ).map((input) => input.value);

        const payload = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            confirmPassword: document.getElementById('confirm-password').value,
            gender: document.getElementById('gender').value,
            department: document.getElementById('department').value,
            interests
        };

        if (!interests.length) {
            alert('Please choose at least one interested event domain.');
            return;
        }

        try {
            const data = await studentApp.fetchJson(`${studentApp.API_BASE}/students/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            studentApp.storeSession({
                email: data.user.email,
                name: data.user.name,
                token: data.token
            });

            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Student signup failed:', error);
            alert(error.message || 'Unable to create your account right now.');
        }
    });
});
