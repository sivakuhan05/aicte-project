const organizerSessionKeys = [
  'organizerUsername',
  'organizerEmail',
  'organizerAssociation',
  'organizerBio',
  'organizerApprovalStatus'
];
const currentYear = new Date().getFullYear() % 100;
const allowedYears = new Set(Array.from({ length: 5 }, (_, index) => String((currentYear - index + 100) % 100).padStart(2, '0')));

function clearOrganizerSession() {
  organizerSessionKeys.forEach((key) => localStorage.removeItem(key));
}

function isValidPsgEmail(email) {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const match = trimmedEmail.match(/^(\d{2})([a-z])(\d{3})@psgtech\.ac\.in$/i);
  return Boolean(match && allowedYears.has(match[1]));
}

clearOrganizerSession();

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

  if (!isValidPsgEmail(email)) {
    alert('Use a valid PSG email like 23z213@psgtech.ac.in with a joining year from the last 5 years.');
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

    clearOrganizerSession();
    window.location.replace('/landing/web.html?portal=organization');
  } catch (error) {
    console.error('Organization signup failed:', error);
    alert(error.message || 'Failed to register organization.');
  }
});
