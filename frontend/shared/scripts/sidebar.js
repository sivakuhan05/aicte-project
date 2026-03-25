function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        return;
    }
    sidebar.classList.toggle('close');
    localStorage.setItem('sidebarClosed', sidebar.classList.contains('close'));
}

window.toggleSidebar = toggleSidebar;

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && localStorage.getItem('sidebarClosed') === 'true' && window.innerWidth > 640) {
        sidebar.classList.add('close');
    }

    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('#sidebar a').forEach((link) => {
        const target = (link.getAttribute('href') || '').split('/').pop();
        const parent = link.closest('li');
        if (!parent) {
            return;
        }

        if (target === currentPage) {
            parent.classList.add('active');
        }

        link.addEventListener('click', () => {
            if (target === 'orglog.html') {
                [
                    'organizerUsername',
                    'organizerEmail',
                    'organizerAssociation',
                    'organizerBio',
                    'organizerApprovalStatus'
                ].forEach((key) => localStorage.removeItem(key));
            }

            document.querySelectorAll('#sidebar li').forEach((item) => item.classList.remove('active'));
            parent.classList.add('active');
        });
    });
});
