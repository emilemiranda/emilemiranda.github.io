/* Shared small site behaviors. */
document.addEventListener('DOMContentLoaded', () => {
    const year = document.getElementById('currentYear');
    if (year) year.textContent = String(new Date().getFullYear());

    const skip = document.querySelector('.skip-link');
    const main = document.getElementById('main');
    if (skip && main) {
        skip.addEventListener('click', () => {
            main.setAttribute('tabindex', '-1');
            main.focus({ preventScroll: true });
        });
    }
});
