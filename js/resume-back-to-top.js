/* Resume-only Back-to-Top behavior. */
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('toTopMinimal');
    if (!button) return;

    const printButton = document.getElementById('printResume');
    if (printButton) printButton.addEventListener('click', () => window.print());

    const update = () => {
        button.classList.toggle('is-visible', window.scrollY > 420);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
});
