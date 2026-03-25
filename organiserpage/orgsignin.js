document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const clubAssociation = document.getElementById('club-association').value.trim();
  const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm-password').value;

  if (!username || !email || !clubAssociation || !password || !confirm) {
    alert('Please complete all organization fields.');
    return;
  }

  if (password !== confirm) {
    alert('Passwords do not match.');
    return;
  }

    try {
        const response = await fetch('http://localhost:3000/org/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, clubAssociation })
    });

    const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to register organization.');
        }

        localStorage.setItem('organizerUsername', data.organizer?.username || username);
        localStorage.setItem('organizerEmail', data.organizer?.email || email);
        localStorage.setItem('organizerAssociation', data.organizer?.clubAssociation || clubAssociation);
        localStorage.setItem('organizerBio', data.organizer?.bio || 'Not set');
        localStorage.setItem('organizerApprovalStatus', data.organizer?.approvalStatus || 'pending');

        alert(data.message || 'Organization account created successfully.');
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Organization signup failed:', error);
        alert(error.message || 'Failed to register organization.');
    }
});
