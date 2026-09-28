/* =========================================================
   GIS PROJECTS
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    /*
     * =======================================================
     * PROJECT DATA
     *
     * Edit this section when you want to change a project.
     * =======================================================
     */

    const projects = [

        {
            id: "madrid-mobility",
            title: "Madrid Mobility",
            category: "Mobility",
            filter: ["mobility"],
            featured: true,

            summary:
                "A GIS case study focused on urban mobility, spatial patterns, accessibility, and the geographic distribution of transportation-related activity in Madrid.",

            problem:
                "Explore a transportation and mobility question using geographic data to identify spatial patterns and support location-based interpretation.",

            methods:
                "GIS spatial analysis, thematic mapping, geographic data visualization, and web-based map presentation.",

            outputs:
                "Interactive mapping outputs designed to communicate mobility patterns and geographic relationships clearly.",

            tags: [
                "GIS",
                "Spatial Analysis",
                "Urban Mobility",
                "Cartography"
            ],

            image:
                "assets/img/projects/madrid-mobility.png",

            visualClass:
                "visual-madrid",

            icon:
                "fa-city",

            github:
                "",

            live:
                ""
        },


        {
            id: "nyc-healthcare",
            title: "NYC Healthcare Accessibility",
            category: "Health",
            filter: ["health", "accessibility"],
            featured: false,

            summary:
                "A spatial analysis project examining healthcare accessibility and the geographic relationship between population needs and healthcare resources in New York City.",

            problem:
                "Investigate how healthcare resources are distributed geographically and identify patterns relevant to accessibility and spatial equity.",

            methods:
                "GIS network and proximity concepts, spatial analysis, thematic cartography, and geographic visualization.",

            outputs:
                "Map-based analysis communicating healthcare accessibility and geographic disparities.",

            tags: [
                "GIS",
                "Health",
                "Accessibility",
                "Spatial Analysis"
            ],

            image:
                "assets/img/projects/nyc-healthcare.png",

            visualClass:
                "visual-nyc",

            icon:
                "fa-hospital",

            github:
                "",

            live:
                ""
        },


        {
            id: "flood-exposure",
            title: "Flood Exposure Mapping",
            category: "Risk & Resilience",
            filter: ["risk"],
            featured: false,

            summary:
                "A GIS project exploring flood exposure through spatial overlay, geographic visualization, and analysis of areas affected by flood risk.",

            problem:
                "Understand where flood hazards intersect with people, infrastructure, land use, or other geographic features of interest.",

            methods:
                "Spatial overlay, hazard mapping, thematic cartography, and geographic visualization.",

            outputs:
                "Flood exposure maps designed to support interpretation of geographic risk and potential impacts.",

            tags: [
                "GIS",
                "Flood Risk",
                "Spatial Analysis",
                "Resilience"
            ],

            image:
                "assets/img/projects/flood-exposure.png",

            visualClass:
                "visual-flood",

            icon:
                "fa-water",

            github:
                "",

            live:
                ""
        },


        {
            id: "spain-healthcare",
            title: "Spain Healthcare Accessibility",
            category: "Health",
            filter: ["health", "accessibility"],
            featured: false,

            summary:
                "A geographic analysis of healthcare accessibility in Spain, examining how healthcare resources relate to population distribution and geographic access.",

            problem:
                "Explore regional patterns in healthcare availability and the geographic factors that influence accessibility.",

            methods:
                "Spatial analysis, demographic mapping, accessibility analysis, and thematic cartography.",

            outputs:
                "Maps and geographic analyses that communicate healthcare accessibility across Spanish regions.",

            tags: [
                "GIS",
                "Healthcare",
                "Accessibility",
                "Spain"
            ],

            image:
                "assets/img/projects/spain-healthcare.png",

            visualClass:
                "visual-spain",

            icon:
                "fa-heart-pulse",

            github:
                "",

            live:
                ""
        },


        {
            id: "harris-flood",
            title: "Harris County Flood Risk & Social Vulnerability",
            category: "Risk & Resilience",
            filter: ["risk", "accessibility", "python"],
            featured: false,

            summary:
                "A GIS risk-analysis project combining flood exposure with social vulnerability to better understand where hazards and community-level vulnerability overlap.",

            problem:
                "Identify areas where flood risk intersects with social vulnerability so that geographic patterns of potential impact can be interpreted together rather than independently.",

            methods:
                "Weighted spatial analysis, social vulnerability mapping, flood-risk analysis, GIS visualization, and Python-assisted geospatial workflows.",

            outputs:
                "Composite geographic risk analysis communicating the relationship between environmental hazard and social vulnerability.",

            tags: [
                "GIS",
                "Flood Risk",
                "Social Vulnerability",
                "Python",
                "Resilience"
            ],

            image:
                "assets/img/projects/harris-flood.png",

            visualClass:
                "visual-harris",

            icon:
                "fa-house-flood-water",

            github:
                "",

            live:
                ""
        }

    ];


    /*
     * =======================================================
     * ELEMENTS
     * =======================================================
     */

    const projectsGrid =
        document.getElementById("projects-grid");

    const featuredProject =
        document.getElementById("featured-project");

    const filterButtons =
        document.querySelectorAll(".project-filter");

    const modal =
        document.getElementById("projectModal");

    const modalBackdrop =
        document.querySelector(".project-modal-backdrop");

    const modalClose =
        document.getElementById("projectModalClose");

    const modalVisual =
        document.getElementById("projectModalVisual");

    const modalCategory =
        document.getElementById("projectModalCategory");

    const modalTitle =
        document.getElementById("projectModalTitle");

    const modalSummary =
        document.getElementById("projectModalSummary");

    const modalProblem =
        document.getElementById("projectModalProblem");

    const modalMethods =
        document.getElementById("projectModalMethods");

    const modalOutputs =
        document.getElementById("projectModalOutputs");

    const modalTags =
        document.getElementById("projectModalTags");

    const modalActions =
        document.getElementById("projectModalActions");


    /*
     * =======================================================
     * HELPERS
     * =======================================================
     */

    function escapeHtml(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    function tagMarkup(tags) {

        return tags
            .map(function (tag) {
                return `
                    <span class="project-tag">
                        ${escapeHtml(tag)}
                    </span>
                `;
            })
            .join("");

    }


    function imageMarkup(project) {

        if (!project.image) {

            return `
                <div class="project-image-placeholder">
                    <div>
                        <i class="fas ${escapeHtml(project.icon)}"></i>
                        <strong>
                            ${escapeHtml(project.title)}
                        </strong>
                    </div>
                </div>
            `;

        }

        return `
            <img
                src="${escapeHtml(project.image)}"
                alt="${escapeHtml(project.title)} project map"
                loading="lazy"
                onerror="
                    this.style.display='none';
                    this.nextElementSibling.style.display='flex';
                "
            >

            <div
                class="project-image-placeholder"
                style="display:none;"
            >
                <div>
                    <i class="fas ${escapeHtml(project.icon)}"></i>
                    <strong>
                        ${escapeHtml(project.title)}
                    </strong>
                </div>
            </div>
        `;

    }


    /*
     * =======================================================
     * FEATURED PROJECT
     * =======================================================
     */

    function renderFeaturedProject() {

        if (!featuredProject) {
            return;
        }

        const project =
            projects.find(function (item) {
                return item.featured === true;
            });

        if (!project) {
            return;
        }


        featuredProject.innerHTML = `

            <article class="featured-project">

                <div class="featured-project-inner">

                    <div
                        class="featured-project-visual ${escapeHtml(project.visualClass)}"
                    >
                        ${imageMarkup(project)}
                    </div>


                    <div class="featured-project-content">

                        <span class="featured-label">
                            <i
                                class="fas fa-star"
                                aria-hidden="true"
                            ></i>

                            Featured Case Study
                        </span>


                        <h3>
                            ${escapeHtml(project.title)}
                        </h3>


                        <p>
                            ${escapeHtml(project.summary)}
                        </p>


                        <div class="featured-meta">
                            ${tagMarkup(project.tags)}
                        </div>


                        <div class="project-card-actions">

                            <button
                                type="button"
                                class="project-card-button primary"
                                data-project-id="${escapeHtml(project.id)}"
                            >
                                <i
                                    class="fas fa-arrow-up-right-from-square me-1"
                                    aria-hidden="true"
                                ></i>

                                View Case Study
                            </button>

                        </div>

                    </div>

                </div>

            </article>
        `;

    }


    /*
     * =======================================================
     * PROJECT GRID
     * =======================================================
     */

    function renderProjects(filter) {

        if (!projectsGrid) {
            return;
        }


        const filteredProjects =
            projects.filter(function (project) {

                if (project.featured) {
                    return false;
                }

                if (filter === "all") {
                    return true;
                }

                return project.filter.includes(filter);

            });


        if (filteredProjects.length === 0) {

            projectsGrid.innerHTML = `
                <div class="col-12">

                    <div class="text-center py-5">

                        <p class="mb-0 text-muted">
                            No projects are currently assigned
                            to this category.
                        </p>

                    </div>

                </div>
            `;

            return;
        }


        projectsGrid.innerHTML =
            filteredProjects
                .map(function (project) {

                    return `

                        <div class="col-md-6 col-xl-4">

                            <article
                                class="project-card"
                            >

                                <div
                                    class="project-card-visual ${escapeHtml(project.visualClass)}"
                                >
                                    ${imageMarkup(project)}

                                    <div
                                        class="project-card-visual-title"
                                    >
                                        ${escapeHtml(project.title)}
                                    </div>

                                </div>


                                <div class="project-card-body">

                                    <div
                                        class="project-card-category"
                                    >
                                        ${escapeHtml(project.category)}
                                    </div>


                                    <h3 class="project-card-title">
                                        ${escapeHtml(project.title)}
                                    </h3>


                                    <p class="project-card-summary">
                                        ${escapeHtml(project.summary)}
                                    </p>


                                    <div class="project-tags">
                                        ${tagMarkup(project.tags)}
                                    </div>


                                    <div class="project-card-actions">

                                        <button
                                            type="button"
                                            class="project-card-button primary"
                                            data-project-id="${escapeHtml(project.id)}"
                                        >
                                            View Case Study
                                        </button>

                                    </div>

                                </div>

                            </article>

                        </div>
                    `;

                })
                .join("");

    }


    /*
     * =======================================================
     * OPEN MODAL
     * =======================================================
     */

    function openProjectModal(projectId) {

        const project =
            projects.find(function (item) {
                return item.id === projectId;
            });

        if (!project || !modal) {
            return;
        }


        modalCategory.textContent =
            project.category;

        modalTitle.textContent =
            project.title;

        modalSummary.textContent =
            project.summary;

        modalProblem.textContent =
            project.problem;

        modalMethods.textContent =
            project.methods;

        modalOutputs.textContent =
            project.outputs;


        modalTags.innerHTML =
            tagMarkup(project.tags);


        modalVisual.className =
            "project-modal-visual " +
            project.visualClass;

        modalVisual.innerHTML =
            imageMarkup(project);


        let actions = `
            <button
                type="button"
                class="project-card-button secondary"
                id="modalCloseAction"
            >
                Close
            </button>
        `;


        if (project.live) {

            actions = `
                <a
                    class="project-card-button primary"
                    href="${escapeHtml(project.live)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i
                        class="fas fa-map-location-dot me-1"
                        aria-hidden="true"
                    ></i>

                    View Interactive Map
                </a>

                ${project.github ? `
                    <a
                        class="project-card-button secondary"
                        href="${escapeHtml(project.github)}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <i
                            class="fab fa-github me-1"
                            aria-hidden="true"
                        ></i>

                        GitHub
                    </a>
                ` : ""}

                <button
                    type="button"
                    class="project-card-button secondary"
                    id="modalCloseAction"
                >
                    Close
                </button>
            `;

        } else if (project.github) {

            actions = `
                <a
                    class="project-card-button secondary"
                    href="${escapeHtml(project.github)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <i
                        class="fab fa-github me-1"
                        aria-hidden="true"
                    ></i>

                    GitHub
                </a>

                <button
                    type="button"
                    class="project-card-button secondary"
                    id="modalCloseAction"
                >
                    Close
                </button>
            `;

        }


        modalActions.innerHTML =
            actions;


        modal.classList.add("is-open");

        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("project-modal-open");

        modalClose.focus();


        const closeAction =
            document.getElementById("modalCloseAction");

        if (closeAction) {

            closeAction.addEventListener(
                "click",
                closeProjectModal
            );

        }

    }


    /*
     * =======================================================
     * CLOSE MODAL
     * =======================================================
     */

    function closeProjectModal() {

        if (!modal) {
            return;
        }

        modal.classList.remove("is-open");

        modal.setAttribute("aria-hidden", "true");

        document.body.classList.remove("project-modal-open");

    }


    /*
     * =======================================================
     * EVENT HANDLING
     * =======================================================
     */

    document.addEventListener("click", function (event) {

        const projectButton =
            event.target.closest(
                "[data-project-id]"
            );

        if (projectButton) {

            openProjectModal(
                projectButton.dataset.projectId
            );

        }

    });


    if (modalClose) {

        modalClose.addEventListener(
            "click",
            closeProjectModal
        );

    }


    if (modalBackdrop) {

        modalBackdrop.addEventListener(
            "click",
            closeProjectModal
        );

    }


    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Escape" &&
                modal &&
                modal.classList.contains("is-open")
            ) {

                closeProjectModal();

            }

        }
    );


    /*
     * =======================================================
     * FILTER EVENTS
     * =======================================================
     */

    filterButtons.forEach(function (button) {

        button.addEventListener(
            "click",
            function () {

                filterButtons.forEach(function (item) {
                    item.classList.remove("active");
                });

                button.classList.add("active");

                renderProjects(
                    button.dataset.filter
                );

            }
        );

    });


    /*
     * =======================================================
     * INITIAL RENDER
     * =======================================================
     */

    renderFeaturedProject();

    renderProjects("all");

});
