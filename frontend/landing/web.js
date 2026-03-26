document.addEventListener('DOMContentLoaded', () => {
  const roles = {
    student: {
      tag: 'Student',
      title: 'Student Portal',
      description: 'Explore events, register quickly, and manage your student profile.',
      loginHref: '../student/login.html',
      signupHref: '../student/signup.html'
    },
    organization: {
      tag: 'Organization',
      title: 'Organization Portal',
      description: 'Create events, manage your club or association, and track approvals.',
      loginHref: '../organizer/orglog.html',
      signupHref: '../organizer/orgsignin.html'
    },
    admin: {
      tag: 'Admin',
      title: 'Admin Portal',
      description: 'Approve accounts and events, review club activity, and manage the platform.',
      loginHref: '../admin/login.html',
      signupHref: '../admin/signup.html'
    }
  };

  const tabs = Array.from(document.querySelectorAll('.portal-tab'));
  const tag = document.getElementById('portal-tag');
  const title = document.getElementById('portal-title');
  const description = document.getElementById('portal-description');
  const loginLink = document.getElementById('portal-login-link');
  const signupLink = document.getElementById('portal-signup-link');

  function setRole(roleKey) {
    const role = roles[roleKey] || roles.student;
    tag.textContent = role.tag;
    title.textContent = role.title;
    description.textContent = role.description;
    loginLink.href = role.loginHref;
    signupLink.href = role.signupHref;

    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.role === roleKey);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setRole(tab.dataset.role);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const initialRole = params.get('portal');
  setRole(roles[initialRole] ? initialRole : 'student');
});
