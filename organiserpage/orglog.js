document.getElementById('form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Please enter your email and password.');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/org/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Invalid email or password.');
        }

        if (data.username) {
            localStorage.setItem('organizerUsername', data.username);
        }
        if (data.email) {
            localStorage.setItem('organizerEmail', data.email);
        }
        localStorage.setItem('organizerAssociation', data.clubAssociation || 'Not set');
        localStorage.setItem('organizerBio', data.bio || 'Not set');
        localStorage.setItem('organizerApprovalStatus', data.approvalStatus || 'approved');

        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Organizer login failed:', error);
        alert(error.message || 'Something went wrong. Please try again later.');
    }
});
