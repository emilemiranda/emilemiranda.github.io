/*
 * projects.js
 * Project data, rendering, filtering, and accessible case-study dialog.
 */

document.addEventListener('DOMContentLoaded', () => {
  const projects = [
    {
      id: 'madrid-mobility',
      caseStudy: 'case-studies/madrid-mobility.html',
      title: 'Madrid Mobility',
      category: 'Mobility',
      filter: ['mobility'],
      featured: true,
      summary: 'A reproducible neighborhood-level analysis using official Madrid and EMT data, BiciMAD stations and available usage context, and district/neighborhood boundaries to produce accessibility indicators and service-gap summaries.',
      problem: 'Compare the distribution of BiciMAD stations, EMT stops/routes, and neighborhood boundaries using documented buffer-based access measures.',
      methods: 'Python, GeoPandas, official Madrid open data, EMT stops/routes, BiciMAD station and usage data where available, CRS standardization, buffers, spatial overlays, and GeoJSON exports.',
      outputs: 'Neighborhood accessibility scores, district summary statistics, service-gap summaries, GeoJSON layers, and PNG maps/charts. The project README records a data snapshot retrieved 18 June 2026.',
      tags: ['GIS', 'Python', 'GeoPandas', 'Urban Mobility'],
      image: 'assets/img/projects/madrid-mobility.png',
      visualClass: 'visual-madrid',
      icon: 'fa-city',
      github: '',
      live: ''
    },
    {
      id: 'nyc-healthcare',
      caseStudy: 'case-studies/nyc-healthcare-accessibility.html',
      title: 'NYC Healthcare Accessibility',
      category: 'Health',
      filter: ['health', 'accessibility'],
      featured: false,
      summary: 'A reproducible NYC healthcare-accessibility workflow combining healthcare facility locations, local ACS 5-Year Summary Files, and 2024 TIGER/Line census tracts.',
      problem: 'Estimate tract-level healthcare coverage, classify tracts with high demographic need and low coverage under the project criteria, and rank tract-centroid candidate locations for follow-up review.',
      methods: 'ArcGIS API for Python, GeoPandas, pandas, NumPy, local ACS tables B01003/B19013/B25003, Geos20235YR, 2024 TIGER/Line tracts, one-mile buffers, and spatial classification.',
      outputs: 'Healthcare coverage indicators, underserved census-tract classifications, candidate facility locations, CSV/GeoJSON/Shapefile exports, Hosted Feature Layers, a Web Map, and a QGIS GeoPackage.',
      tags: ['GIS', 'Healthcare', 'Accessibility', 'Python'],
      image: 'assets/img/projects/nyc-healthcare.png',
      visualClass: 'visual-nyc',
      icon: 'fa-hospital',
      github: '',
      live: ''
    },
    {
      id: 'flood-exposure',
      caseStudy: 'case-studies/flood-exposure-mapping.html',
      title: 'Flood Exposure Mapping',
      category: 'Risk & Resilience',
      filter: ['risk'],
      featured: false,
      summary: 'A Python-based exposure-screening workflow using a study-area clip, 100 m/250 m/500 m distance bands, spatial joins, and GeoJSON building outputs.',
      problem: 'Identify building footprints that meet the project’s selected distance-band and spatial-intersection criteria within a defined study area.',
      methods: 'Python, GeoPandas, Shapely, projected CRS validation, study-area clipping, 100 m/250 m/500 m buffers, spatial intersections, and spatial joins.',
      outputs: 'risk_zone_100m/250m/500m.geojson, buildings_0_100m/100_250m/250_500m.geojson, at_risk_buildings_combined.geojson, and a portfolio cover image.',
      tags: ['GIS', 'Python', 'Flood Risk', 'Shapely'],
      image: 'assets/img/projects/flood-exposure.png',
      visualClass: 'visual-flood',
      icon: 'fa-water',
      github: '',
      live: ''
    },
    {
      id: 'spain-healthcare',
      caseStudy: 'case-studies/spain-healthcare-accessibility.html',
      title: 'Spain Healthcare Accessibility',
      category: 'Health',
      filter: ['health', 'accessibility'],
      featured: false,
      summary: 'A five-notebook Python workflow combining IGN/CNIG administrative boundaries, sigMayores healthcare/social-resource WFS inputs, and INE population-by-sex-and-age data.',
      problem: 'Create a repeatable municipal-level pipeline to standardize public geographic and demographic inputs, build indicators, explore hotspots, and export interactive and GIS-ready outputs.',
      methods: 'Python, five ordered Jupyter notebooks, IGN/CNIG WFS, sigMayores healthcare/social WFS, INE population by sex and age, reusable data/analysis/export scripts, hotspot mapping.',
      outputs: 'municipality_vulnerability.gpkg, municipality_vulnerability_attributes.csv, top_20_vulnerable_municipalities.csv, vulnerability_index_map.png, and interactive_vulnerability_map.html.',
      tags: ['GIS', 'Healthcare', 'WFS', 'Python'],
      image: 'assets/img/projects/spain-healthcare.png',
      visualClass: 'visual-spain',
      icon: 'fa-heart-pulse',
      github: '',
      live: ''
    },
    {
      id: 'harris-flood',
      caseStudy: 'case-studies/harris-county-flood-risk.html',
      title: 'Harris County Flood Risk & Social Vulnerability',
      category: 'Risk & Resilience',
      filter: ['risk', 'accessibility', 'python'],
      featured: false,
      summary: 'A Harris County GIS decision-support study combining FEMA flood exposure, ACS 5-Year demographic/housing/mobility indicators, and census-tract geography into a weighted Final Priority Index.',
      problem: 'Identify census tracts where flood exposure, social vulnerability, and evacuation difficulty overlap, while retaining the individual component scores for interpretation.',
      methods: 'QGIS, FEMA flood-hazard polygons, ACS 5-Year Estimates, census-tract GEOID joins, normalized component indicators, and a weighted index (40% exposure, 35% social vulnerability, 25% evacuation difficulty).' ,
      outputs: 'A tract-level Final Priority Index, flood-exposure/social-vulnerability/evacuation-difficulty components, decision-support maps, and an ArcGIS StoryMap.',
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
    if (project.caseStudy) {
      links.push(`<a class="project-card-button primary" href="${escapeHtml(project.caseStudy)}"><i class="fa-solid fa-book-open me-1" aria-hidden="true"></i>Read Full Case Study</a>`);
    }
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
              <a class="project-card-button primary" href="${escapeHtml(project.caseStudy)}">Read Case Study <i class="fa-solid fa-arrow-right ms-1" aria-hidden="true"></i></a>
              <button type="button" class="project-card-button secondary" data-project-id="${escapeHtml(project.id)}" aria-haspopup="dialog" aria-controls="projectModal">Quick Overview</button>
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
              <a class="project-card-button primary" href="${escapeHtml(project.caseStudy)}">Read Case Study <i class="fa-solid fa-arrow-right ms-1" aria-hidden="true"></i></a>
              <button type="button" class="project-card-button secondary" data-project-id="${escapeHtml(project.id)}" aria-haspopup="dialog" aria-controls="projectModal">Quick Overview</button>
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
