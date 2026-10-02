/*
 * projects.js
 * Project data, rendering, filtering, and accessible case-study dialog.
 */

document.addEventListener('DOMContentLoaded', () => {
    const projects = [
        {
            id: 'madrid-mobility',
            title: 'Madrid Mobility',
            category: 'Mobility',
            filter: ['mobility'],
            featured: true,
            summary: 'A reproducible GIS workflow using BiciMAD and EMT data to examine neighborhood accessibility, service coverage, and mobility gaps across Madrid.',
            problem: 'Assess how transportation services relate to neighborhood-level access and identify geographic patterns that are difficult to see in tabular data alone.',
            methods: 'Python, GeoPandas, Madrid Open Data, EMT stops and routes, BiciMAD, GeoJSON, CRS management, service-area buffering, and spatial overlays.',
            outputs: 'Accessibility scores, district-level summaries, service-gap analysis, and map-ready outputs for communicating spatial patterns.',
            tags: ['GIS', 'Python', 'GeoPandas', 'Urban Mobility'],
            image: 'assets/img/projects/madrid-mobility.png',
            visualClass: 'visual-madrid',
            icon: 'fa-city',
            github: '',
            live: ''
        },
        {
            id: 'nyc-healthcare',
            title: 'NYC Healthcare Accessibility',
            category: 'Health',
            filter: ['health', 'accessibility'],
            featured: false,
            summary: 'A spatial analysis of healthcare accessibility in New York City, connecting population needs with the geographic distribution of healthcare resources.',
            problem: 'Identify underserved areas and explore where healthcare resources and population demand do not align geographically.',
            methods: 'ArcGIS API for Python, GeoPandas, pandas, NumPy, ACS Summary Files, TIGER/Line data, spatial classification, and candidate-site analysis.',
            outputs: 'Coverage indicators, underserved-tract classifications, candidate facility locations, and reusable GIS data exports.',
            tags: ['GIS', 'Healthcare', 'Accessibility', 'Python'],
            image: 'assets/img/projects/nyc-healthcare.png',
            visualClass: 'visual-nyc',
            icon: 'fa-hospital',
            github: '',
            live: ''
        },
        {
            id: 'flood-exposure',
            title: 'Flood Exposure Mapping',
            category: 'Risk & Resilience',
            filter: ['risk'],
            featured: false,
            summary: 'A geospatial risk workflow using flood layers, buffers, and spatial intersections to identify buildings and locations exposed to flooding.',
            problem: 'Understand where flood hazards intersect with buildings and other geographic assets to support consistent exposure screening.',
            methods: 'Python, GeoPandas, Shapely, GeoJSON, projected CRS, 100 m / 250 m / 500 m buffers, clipping, intersections, and spatial joins.',
            outputs: 'Exposure bands, at-risk building datasets, and cartographic outputs suitable for risk screening and downstream analysis.',
            tags: ['GIS', 'Python', 'Flood Risk', 'Shapely'],
            image: 'assets/img/projects/flood-exposure.png',
            visualClass: 'visual-flood',
            icon: 'fa-water',
            github: '',
            live: ''
        },
        {
            id: 'spain-healthcare',
            title: 'Spain Healthcare Accessibility',
            category: 'Health',
            filter: ['health', 'accessibility'],
            featured: false,
            summary: 'A reusable geospatial data workflow for healthcare accessibility analysis across Spain using public services, demographic indicators, and standardized GIS outputs.',
            problem: 'Build a repeatable process for combining public geospatial services and demographic indicators into comparable municipal-level accessibility measures.',
            methods: 'Python, WFS, IGN/CNIG, sigMayores, INE, GeoPackage, CSV, data cleaning, indicator construction, joins, and interactive HTML mapping.',
            outputs: 'Standardized CSV and GeoPackage datasets, municipal indicators, hotspot mapping, and an interactive vulnerability map.',
            tags: ['GIS', 'Healthcare', 'WFS', 'Python'],
            image: 'assets/img/projects/spain-healthcare.png',
            visualClass: 'visual-spain',
            icon: 'fa-heart-pulse',
            github: '',
            live: ''
        },
        {
            id: 'harris-flood',
            title: 'Harris County Flood Risk & Social Vulnerability',
            category: 'Risk & Resilience',
            filter: ['risk', 'accessibility', 'python'],
            featured: false,
            summary: 'A composite GIS risk analysis combining flood exposure, social vulnerability, and evacuation difficulty to interpret where hazard and community vulnerability overlap.',
            problem: 'Examine environmental hazard and community vulnerability together so that spatial priorities are not interpreted from a single layer in isolation.',
            methods: 'QGIS, FEMA flood hazard polygons, ACS 5-Year Estimates, census tracts, weighted spatial scoring, Python-assisted workflows, and ArcGIS StoryMaps.',
            outputs: 'A weighted Final Priority Index and StoryMap-ready analysis communicating geographic patterns of potential flood impact.',
            tags: ['GIS', 'Flood Risk', 'Social Vulnerability', 'Python'],
            image: 'assets/img/projects/harris-flood.png',
            visualClass: 'visual-harris',
            icon: 'fa-house-flood-water',
            github: '',
            live: ''
        }
    ];

    const grid = document.getElementById('projects-grid');
    const featured = document.getElementById('featured-project');
    const filters = Array.from(document.querySelectorAll('.project-filter'));

    const modal = document.getElementById('projectModal');
    if (!grid || !featured || !modal) return;

    const modalDialog = modal.querySelector('.project-modal-dialog');
    const modalBackdrop = modal.querySelector('.project-modal-backdrop');
    const modalClose = document.getElementById('projectModalClose');
    const modalVisual = document.getElementById('projectModalVisual');
    const modalCategory = document.getElementById('projectModalCategory');
    const modalTitle = document.getElementById('projectModalTitle');
    const modalSummary = document.getElementById('projectModalSummary');
    const modalProblem = document.getElementById('projectModalProblem');
    const modalMethods = document.getElementById('projectModalMethods');
    const modalOutputs = document.getElementById('projectModalOutputs');
    const modalTags = document.getElementById('projectModalTags');
    const modalActions = document.getElementById('projectModalActions');

    let lastFocusedElement = null;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const tagMarkup = (tags) => tags.map((tag) => (
        `<span class="project-tag">${escapeHtml(tag)}</span>`
    )).join('');

    const imageMarkup = (project, loading = 'lazy') => {
        if (!project.image) {
            return `<div class="project-image-placeholder"><div><i class="fa-solid ${escapeHtml(project.icon)}" aria-hidden="true"></i><strong>${escapeHtml(project.title)}</strong></div></div>`;
        }

        return `
      <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)} project map" loading="${loading}" decoding="async">
      <div class="project-image-placeholder" hidden>
        <div><i class="fa-solid ${escapeHtml(project.icon)}" aria-hidden="true"></i><strong>${escapeHtml(project.title)}</strong></div>
      </div>
    `;
    };

    const attachImageFallback = (root) => {
        const image = root?.querySelector('img');
        const fallback = root?.querySelector('.project-image-placeholder[hidden]');
        if (!image || !fallback) return;
        image.addEventListener('error', () => {
            image.hidden = true;
            fallback.hidden = false;
        }, { once: true });
    };

    const setPageInert = (state) => {
        Array.from(document.body.children).forEach((child) => {
            if (child !== modal && 'inert' in child) child.inert = state;
        });
    };

    const focusableSelector = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const getFocusable = () => Array.from(modal.querySelectorAll(focusableSelector));

    const closeModal = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('project-modal-open');
        setPageInert(false);
        const previous = lastFocusedElement;
        lastFocusedElement = null;
        previous?.focus?.();
    };

    const openModal = (projectId, trigger) => {
        const project = projects.find((item) => item.id === projectId);
        if (!project) return;

        lastFocusedElement = trigger instanceof HTMLElement ? trigger : document.activeElement;

        modalCategory.textContent = project.category;
        modalTitle.textContent = project.title;
        modalSummary.textContent = project.summary;
        modalProblem.textContent = project.problem;
        modalMethods.textContent = project.methods;
        modalOutputs.textContent = project.outputs;
        modalTags.innerHTML = tagMarkup(project.tags);
        modalVisual.className = `project-modal-visual ${escapeHtml(project.visualClass)}`;
        modalVisual.innerHTML = imageMarkup(project, 'eager');
        attachImageFallback(modalVisual);

        const links = [];
        if (project.live) {
            links.push(`<a class="project-card-button primary" href="${escapeHtml(project.live)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot me-1" aria-hidden="true"></i>View Interactive Map</a>`);
        }
        if (project.github) {
            links.push(`<a class="project-card-button secondary" href="${escapeHtml(project.github)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github me-1" aria-hidden="true"></i>GitHub</a>`);
        }
        links.push('<button type="button" class="project-card-button secondary" id="modalCloseAction">Close</button>');
        modalActions.innerHTML = links.join('');

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('project-modal-open');
        setPageInert(true);

        document.getElementById('modalCloseAction')?.addEventListener('click', closeModal);
        modalDialog?.focus();
    };

    const renderFeatured = () => {
        const project = projects.find((item) => item.featured);
        if (!project) return;

        featured.innerHTML = `
      <article class="featured-project">
        <div class="featured-project-inner">
          <div class="featured-project-visual ${escapeHtml(project.visualClass)}">${imageMarkup(project, 'eager')}</div>
          <div class="featured-project-content">
            <span class="featured-label"><i class="fa-solid fa-star" aria-hidden="true"></i>Featured Case Study</span>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.summary)}</p>
            <div class="featured-meta"><div class="project-tags">${tagMarkup(project.tags)}</div></div>
            <div class="project-card-actions">
              <button type="button" class="project-card-button primary" data-project-id="${escapeHtml(project.id)}" aria-haspopup="dialog" aria-controls="projectModal">View Case Study</button>
            </div>
          </div>
        </div>
      </article>
    `;
        attachImageFallback(featured);
    };

    const renderProjects = (filter = 'all') => {
        const filtered = projects.filter((project) => {
            if (project.featured) return false;
            return filter === 'all' || project.filter.includes(filter);
        });

        if (!filtered.length) {
            grid.innerHTML = '<div class="col-12"><div class="py-5 text-center"><p class="mb-0 text-muted">No projects are currently assigned to this category.</p></div></div>';
            return;
        }

        grid.innerHTML = filtered.map((project) => `
      <div class="col-md-6 col-xl-4">
        <article class="project-card">
          <div class="project-card-visual ${escapeHtml(project.visualClass)}">
            ${imageMarkup(project)}
            <div class="project-card-visual-title">${escapeHtml(project.title)}</div>
          </div>
          <div class="project-card-body">
            <div class="project-card-category">${escapeHtml(project.category)}</div>
            <h3 class="project-card-title">${escapeHtml(project.title)}</h3>
            <p class="project-card-summary">${escapeHtml(project.summary)}</p>
            <div class="project-tags">${tagMarkup(project.tags)}</div>
            <div class="project-card-actions">
              <button type="button" class="project-card-button primary" data-project-id="${escapeHtml(project.id)}" aria-haspopup="dialog" aria-controls="projectModal">View Case Study</button>
            </div>
          </div>
        </article>
      </div>
    `).join('');

        grid.querySelectorAll('.project-card-visual').forEach(attachImageFallback);
    };

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-project-id]');
        if (!trigger) return;
        openModal(trigger.dataset.projectId, trigger);
    });

    modalClose?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
        if (!modal.classList.contains('is-open')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
            return;
        }

        if (event.key !== 'Tab') return;
        const focusables = getFocusable();
        if (!focusables.length) {
            event.preventDefault();
            modalDialog?.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    filters.forEach((button) => {
        button.addEventListener('click', () => {
            filters.forEach((item) => {
                const isActive = item === button;
                item.classList.toggle('active', isActive);
                item.setAttribute('aria-pressed', String(isActive));
            });
            renderProjects(button.dataset.filter || 'all');
        });
    });

    renderFeatured();
    renderProjects('all');
});
