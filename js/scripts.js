/*
 * scripts.js
 * Shared navigation behavior across index.html, resume.html, and map.html.
 */

document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('mainNav');
    const collapseElement = document.getElementById('navbarResponsive');
    const toggler = document.querySelector('#mainNav .navbar-toggler');

    if (!navbar) return;

    const syncNavbarHeight = () => {
        const height = Math.ceil(navbar.getBoundingClientRect().height);
        if (height > 0) {
            document.documentElement.style.setProperty('--site-navbar-height', `${height}px`);
        }
    };

    const shrinkNavbar = () => {
        navbar.classList.toggle('navbar-shrink', window.scrollY > 12);
    };

    const closeMobileNavbar = () => {
        if (!collapseElement || !toggler || typeof bootstrap === 'undefined') return;
        if (!collapseElement.classList.contains('show')) return;
        bootstrap.Collapse.getOrCreateInstance(collapseElement).hide();
    };

    syncNavbarHeight();
    shrinkNavbar();

    window.addEventListener('load', syncNavbarHeight, { passive: true });
    window.addEventListener('resize', syncNavbarHeight, { passive: true });
    window.addEventListener('scroll', shrinkNavbar, { passive: true });

    if (collapseElement && toggler) {
        collapseElement.addEventListener('shown.bs.collapse', syncNavbarHeight);
        collapseElement.addEventListener('hidden.bs.collapse', syncNavbarHeight);

        document.querySelectorAll('#navbarResponsive a.nav-link').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.matchMedia('(max-width: 991.98px)').matches) {
                    closeMobileNavbar();
                }
            });
        });

        document.addEventListener('click', (event) => {
            if (!collapseElement.classList.contains('show')) return;
            if (navbar.contains(event.target)) return;
            closeMobileNavbar();
        });

        document.addEventListener('scroll', () => {
            if (window.matchMedia('(max-width: 991.98px)').matches) {
                closeMobileNavbar();
            }
        }, { passive: true });
    }

    const sameDocumentSectionLinks = Array.from(
        document.querySelectorAll('#mainNav a.nav-link[href^="#"]')
    );

    if (
        sameDocumentSectionLinks.length > 0 &&
        typeof bootstrap !== 'undefined' &&
        bootstrap.ScrollSpy
    ) {
        bootstrap.ScrollSpy.getOrCreateInstance(document.body, {
            target: '#mainNav',
            rootMargin: '0px 0px -45%',
        });
    }
});
