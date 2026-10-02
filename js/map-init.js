/*
 * map-init.js
 * Live Map application logic.
 *
 * Responsibilities:
 * - Leaflet map initialization
 * - Public ArcGIS FeatureServer data loading
 * - ArcGIS JSON / JSONP fallback + pagination
 * - Earthquake and air-quality overlays
 * - Layers, Filters, Basemap, Legend, Home and Info controls
 * - Map state restoration
 * - Coordinate display + scale bar
 *
 * Presentation belongs in map.css.
 */

(() => {
    'use strict';

    const EARTHQUAKE_LAYER_URL =
        'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Significant_Earthquakes/FeatureServer/0';

    // Preserve the original air-quality layer used by the portfolio.
    // Current ArcGIS metadata identifies layer 1 as OpenAQ - PM10.
    const AIR_QUALITY_LAYER_URL =
        'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Air_Quality_PM25_Latest_Results/FeatureServer/1';

    const PAGE_SIZE = 1000;
    const MAX_FEATURES = 50000;
    const JSONP_TIMEOUT = 20000;

    const safeNumber = (value, fallback = null) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const safeExternalUrl = (value) => {
        try {
            const url = new URL(String(value), window.location.href);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch {
            return null;
        }
    };

    const earthquakeColor = (magnitude) => {
        const n = safeNumber(magnitude);
        if (n === null) return '#fdd49e';
        if (n >= 7) return '#7f0000';
        if (n >= 6) return '#b30000';
        if (n >= 5) return '#e34a33';
        if (n >= 4) return '#fc8d59';
        if (n >= 3) return '#fdbb84';
        return '#fdd49e';
    };

    const earthquakeRadius = (magnitude) => {
        const n = safeNumber(magnitude);
        if (n === null) return 4;
        return Math.max(4, Math.min(24, Math.round(n * 2)));
    };

    const airQualityColor = (value) => {
        const n = safeNumber(value);
        if (n === null) return '#999999';
        if (n > 150) return '#7f0000';
        if (n > 55) return '#b30000';
        if (n > 35) return '#e34a33';
        if (n > 12) return '#fc8d59';
        return '#fdd49e';
    };

    const getFeatureYear = (feature) => {
        const properties = feature?.properties || {};

        for (const key of ['YEAR', 'year']) {
            const year = safeNumber(properties[key]);
            if (year !== null) return year;
        }

        for (const key of ['DATE_STRING', 'DATE']) {
            const value = properties[key];
            if (!value) continue;
            const match = String(value).match(/(\d{4})/);
            if (match) return Number(match[1]);
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
        }

        for (const [key, value] of Object.entries(properties)) {
            if (!/date|time|day/i.test(key) || value == null) continue;
            const match = String(value).match(/(\d{4})/);
            if (match) return Number(match[1]);
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
        }

        return null;
    };

    const webMercatorToWgs84 = (x, y) => {
        const lon = (x / 20037508.34) * 180;
        let lat = (y / 20037508.34) * 180;
        lat = (180 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
        return [lon, lat];
    };

    const arcgisGeometryToGeoJSON = (geometry, spatialReference) => {
        if (!geometry) return null;

        const wkid = spatialReference?.latestWkid || spatialReference?.wkid;
        const convertPoint = (point) => {
            if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
            if (wkid === 3857 || wkid === 102100) return webMercatorToWgs84(Number(point.x), Number(point.y));
            return [Number(point.x), Number(point.y)];
        };

        if ('x' in geometry && 'y' in geometry) {
            const coordinates = convertPoint(geometry);
            return coordinates ? { type: 'Point', coordinates } : null;
        }

        if (Array.isArray(geometry.paths)) {
            return { type: 'MultiLineString', coordinates: geometry.paths };
        }

        if (Array.isArray(geometry.rings)) {
            return { type: 'MultiPolygon', coordinates: [geometry.rings] };
        }

        return null;
    };

    const arcgisFeatureSetToGeoJSON = (data) => {
        if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
        if (!Array.isArray(data?.features)) return { type: 'FeatureCollection', features: [] };

        const spatialReference = data.spatialReference || {};

        return {
            type: 'FeatureCollection',
            features: data.features.map((feature) => ({
                type: 'Feature',
                id: feature.id ?? feature.attributes?.OBJECTID,
                properties: feature.attributes || {},
                geometry: arcgisGeometryToGeoJSON(feature.geometry, spatialReference)
            })).filter((feature) => feature.geometry)
        };
    };

    const appendQuery = (baseUrl, params) => {
        const url = new URL(baseUrl);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        });
        return url.toString();
    };

    const fetchArcGISJSON = async (url) => {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`ArcGIS request failed: HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(data.error.message || 'ArcGIS returned an error.');
        }

        return data;
    };

    const fetchArcGISJSONP = (url) => new Promise((resolve, reject) => {
        const callbackName = `__portfolioArcgis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        let timer = null;
        let settled = false;

        const cleanup = () => {
            window.clearTimeout(timer);
            script.remove();
            try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
        };

        window[callbackName] = (data) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (data?.error) reject(new Error(data.error.message || 'ArcGIS returned an error.'));
            else resolve(data);
        };

        script.async = true;
        script.src = appendQuery(url, { f: 'json', callback: callbackName });
        script.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('ArcGIS JSONP request failed.'));
        };

        timer = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('ArcGIS request timed out.'));
        }, JSONP_TIMEOUT);

        document.head.appendChild(script);
    });

    const requestArcGISPage = async (url) => {
        try {
            return await fetchArcGISJSON(appendQuery(url, { f: 'json' }));
        } catch (corsError) {
            console.warn('ArcGIS fetch unavailable; retrying with JSONP fallback.', corsError);
            return fetchArcGISJSONP(url);
        }
    };

    const queryArcGISLayer = async (layerUrl) => {
        const features = [];
        let offset = 0;

        while (offset < MAX_FEATURES) {
            const queryUrl = appendQuery(`${layerUrl}/query`, {
                where: '1=1',
                outFields: '*',
                outSR: 4326,
                returnGeometry: true,
                resultOffset: offset,
                resultRecordCount: PAGE_SIZE,
                resultType: 'standard'
            });

            const data = await requestArcGISPage(queryUrl);
            const page = arcgisFeatureSetToGeoJSON(data);
            const pageFeatures = page.features || [];
            features.push(...pageFeatures);

            if (!data.exceededTransferLimit || pageFeatures.length === 0) break;
            offset += pageFeatures.length;
        }

        return { type: 'FeatureCollection', features };
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof L === 'undefined') {
            console.error('Leaflet is not available.');
            return;
        }

        const mapElement = document.getElementById('map');
        if (!mapElement) return;

        const rotationAvailable = typeof L.control?.rotate === 'function';

        const map = L.map(mapElement, {
            zoomControl: true,
            worldCopyJump: true,
            minZoom: 2,
            maxZoom: 19,
            rotate: rotationAvailable,
            bearing: 0,
            dragRotate: rotationAvailable,
            shiftKeyRotate: rotationAvailable,
            touchRotate: rotationAvailable,
            rotateClockwise: true,
            rotateControl: rotationAvailable
                ? {
                    position: 'topright',
                    behavior: 'reset',
                    closeOnZeroBearing: false
                }
                : false
        }).setView([20, 0], 2);

        const TIME_PREFIX = `map_${mapElement.id}_`;
        const overlays = Object.create(null);
        const overlayVisibility = Object.create(null);
        const panelRegistry = [];

        let earthquakeFeatures = [];
        let earthquakeLayer = null;
        let airQualityFeatures = [];
        let airQualityLayer = null;
        let airQualityUnit = '';
        let airQualityFilter = { min: null, max: null };
        let initialMapState = null;
        let activePanel = null;
        let scrollFrame = null;

        /*
         * Register a live overlay in one place.
         * This function must stay in the same DOMContentLoaded scope as
         * the layer loaders because they call it after their async requests.
         */
        const addOverlay = (name, layer, visible = false) => {
            if (!name || !layer) return null;

            overlays[name] = layer;
            overlayVisibility[name] = Boolean(visible);

            if (visible && !map.hasLayer(layer)) {
                layer.addTo(map);
            }

            updateLayersPanel();
            updateLegend();
            updateFiltersPanelState();

            return layer;
        };

        const baseLayers = {
            Street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            }),
            Topographic: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
            }),
            Light: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 16,
                attribution: 'Tiles &copy; Esri'
            }),
            Dark: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 16,
                attribution: 'Tiles &copy; Esri'
            }),
            Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri'
            }),
            'Natural Earth': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 8,
                attribution: 'Tiles &copy; Esri'
            })
        };

        const basemapThumbs = {
            Street: 'https://www.senditur.com/multimedia/uploads/images/Noticias/España/Material/OpenStreetMap%20mapas%20gratis%20para%20dispositivos%20Garmin/openstreetmap.jpg',
            Topographic: 'https://public-files.gumroad.com/9q61jy6qnuafs4i6u7ly231qt7th',
            Light: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/BlankMap-World_gray.svg',
            Dark: 'https://static.vecteezy.com/system/resources/thumbnails/006/875/342/small/grey-map-of-the-world-high-detail-world-map-vector.jpg',
            Satellite: 'https://cdn.prod.website-files.com/62eb870036357a73104e20ad/67bc41f4aaff328484411ec6_2025_02_PlanetSAT_Global_2024.jpg',
            'Natural Earth': 'https://media.maptiler.com/img/landscape_v4_world_d271d92b02.webp'
        };

        let currentBaseName = 'Street';
        baseLayers.Street.addTo(map);

        const resetPanelPosition = (panel) => {
            if (!panel) return;
            panel.style.left = '';
            panel.style.top = '';
            panel.style.width = '';
            panel.style.maxHeight = '';
        };

        const closePanel = (entry, restoreFocus = false) => {
            if (!entry) return;
            entry.panel.hidden = true;
            entry.panel.setAttribute('aria-hidden', 'true');
            entry.trigger.setAttribute('aria-expanded', 'false');
            if (activePanel === entry) activePanel = null;
            resetPanelPosition(entry.panel);
            if (restoreFocus) entry.trigger.focus();
        };

        const closeAllPanels = (except = null) => {
            panelRegistry.forEach((entry) => {
                if (entry !== except) closePanel(entry, false);
            });
        };

        const triggerIsVisible = (trigger) => {
            const rect = trigger.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
        };

        const positionPanel = (panel, trigger, preferredWidth = 320) => {
            if (!panel || !trigger || panel.hidden) return;

            const anchor = trigger.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const width = Math.min(preferredWidth, Math.max(220, viewportWidth - 24));

            panel.style.position = 'fixed';
            panel.style.width = `${width}px`;
            panel.style.maxWidth = `calc(100vw - 24px)`;
            panel.style.maxHeight = `${Math.max(180, viewportHeight - 24)}px`;
            panel.style.overflowY = 'auto';
            panel.style.zIndex = '20000';

            const measuredHeight = Math.min(panel.scrollHeight || 240, viewportHeight - 24);

            let left = anchor.right + 8;
            if (left + width > viewportWidth - 8) left = anchor.left - width - 8;
            left = Math.max(8, Math.min(left, viewportWidth - width - 8));

            let top = anchor.bottom + 6;
            if (top + measuredHeight > viewportHeight - 8) top = anchor.top - measuredHeight - 6;
            top = Math.max(8, Math.min(top, viewportHeight - measuredHeight - 8));

            panel.style.left = `${Math.round(left)}px`;
            panel.style.top = `${Math.round(top)}px`;
        };

        const repositionActivePanel = () => {
            if (!activePanel) return;
            if (!triggerIsVisible(activePanel.trigger)) {
                closePanel(activePanel, false);
                return;
            }
            positionPanel(activePanel.panel, activePanel.trigger, activePanel.width);
        };

        const schedulePanelReposition = () => {
            if (scrollFrame) return;
            scrollFrame = window.requestAnimationFrame(() => {
                scrollFrame = null;
                repositionActivePanel();
            });
        };

        const registerPanel = (className, icon, label, title, position, panelId, buildPanel, width = 320) => {
            const Control = L.Control.extend({
                options: { position },
                onAdd() {
                    const container = L.DomUtil.create('div', `leaflet-control ${className}`);
                    const trigger = L.DomUtil.create('button', 'layers-toggle-btn', container);
                    trigger.type = 'button';
                    trigger.title = title;
                    trigger.setAttribute('aria-label', label);
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.setAttribute('aria-controls', panelId);
                    trigger.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;

                    // Portal the panel to <body> so it is never clipped by the Leaflet map container.
                    const panel = document.createElement('section');
                    panel.id = panelId;
                    panel.className = `leaflet-control-layers-toggle-panel ${className.replace('-toggle', '-panel')}`;
                    panel.hidden = true;
                    panel.setAttribute('role', 'region');
                    panel.setAttribute('aria-label', label);
                    panel.setAttribute('aria-hidden', 'true');
                    document.body.appendChild(panel);

                    const entry = { container, trigger, panel, width };
                    panelRegistry.push(entry);
                    buildPanel(panel, { trigger, container, entry });

                    L.DomEvent.disableClickPropagation(panel);
                    L.DomEvent.disableScrollPropagation(panel);

                    trigger.addEventListener('click', () => {
                        if (panel.hidden) {
                            openPanel(entry);
                        } else {
                            closePanel(entry, true);
                        }
                    });

                    return container;
                }
            });

            const instance = new Control();
            map.addControl(instance);
            return instance;
        };

        const openPanel = (entry) => {
            closeAllPanels(entry);
            entry.panel.hidden = false;
            entry.panel.setAttribute('aria-hidden', 'false');
            entry.trigger.setAttribute('aria-expanded', 'true');
            activePanel = entry;
            positionPanel(entry.panel, entry.trigger, entry.width);
        };

        const updateLayersPanel = () => {
            const entry = panelRegistry.find((item) => item.panel.id === 'map-layers-panel');
            if (!entry) return;

            const list = entry.panel.querySelector('.layers-list');
            const status = entry.panel.querySelector('.map-data-status');
            if (!list) return;

            list.innerHTML = '';

            const names = Object.keys(overlays);
            if (!names.length) {
                const li = document.createElement('li');
                li.className = 'layer-empty';
                li.textContent = 'Loading live layers…';
                list.appendChild(li);
                return;
            }

            names.forEach((name) => {
                const li = document.createElement('li');
                li.className = 'layer-row';

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'layer-eye-btn';
                button.setAttribute('aria-pressed', String(Boolean(overlayVisibility[name])));
                button.setAttribute('aria-label', overlayVisibility[name] ? `Hide ${name}` : `Show ${name}`);
                button.innerHTML = `<i class="fa-regular ${overlayVisibility[name] ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i>`;

                button.addEventListener('click', () => {
                    const visible = !overlayVisibility[name];
                    overlayVisibility[name] = visible;
                    if (visible) overlays[name].addTo(map);
                    else if (map.hasLayer(overlays[name])) map.removeLayer(overlays[name]);
                    updateLayersPanel();
                    updateLegend();
                    updateFiltersPanelState();
                });

                const label = document.createElement('span');
                label.className = 'layer-name';
                label.textContent = name;

                li.append(button, label);
                list.appendChild(li);
            });

            if (status) status.textContent = status.dataset.message || '';
        };

        const updateLegend = () => {
            const content = document.getElementById('legend-content');
            if (!content) return;
            content.innerHTML = '';

            const visible = Object.keys(overlays).filter((name) => overlayVisibility[name]);
            if (!visible.length) {
                const empty = document.createElement('div');
                empty.className = 'legend-empty';
                empty.textContent = 'No visible layers.';
                content.appendChild(empty);
                return;
            }

            visible.forEach((name) => {
                const section = document.createElement('div');
                section.className = 'legend-section';

                const header = document.createElement('div');
                header.className = 'legend-section-header';

                const title = document.createElement('span');
                title.className = 'legend-section-title';
                title.textContent = name;

                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'legend-section-toggle';
                toggle.setAttribute('aria-expanded', 'true');
                toggle.setAttribute('aria-label', `Collapse ${name} legend`);
                toggle.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';

                const body = document.createElement('div');
                body.className = 'legend-section-body';

                if (name === 'Significant Earthquakes') {
                    const label = document.createElement('div');
                    label.className = 'legend-subtitle';
                    label.textContent = 'Magnitude';
                    body.appendChild(label);

                    const grades = [0, 3, 4, 5, 6, 7];
                    grades.forEach((grade, index) => {
                        const row = document.createElement('div');
                        row.className = 'legend-row';

                        const swatch = document.createElement('span');
                        swatch.className = 'legend-dot';
                        swatch.style.background = earthquakeColor(grade);

                        const text = document.createElement('span');
                        text.textContent = `${grade}${grades[index + 1] ? `–${grades[index + 1]}` : '+'}`;
                        row.append(swatch, text);
                        body.appendChild(row);
                    });
                } else if (name === 'Air Quality (PM)') {
                    const label = document.createElement('div');
                    label.className = 'legend-subtitle';
                    label.textContent = 'Relative PM severity';
                    body.appendChild(label);

                    [
                        ['Low', '#fdd49e'],
                        ['Moderate', '#fc8d59'],
                        ['Unhealthy (sensitive)', '#e34a33'],
                        ['Unhealthy', '#b30000'],
                        ['Very Unhealthy / Hazardous', '#7f0000']
                    ].forEach(([nameText, color]) => {
                        const row = document.createElement('div');
                        row.className = 'legend-row';
                        const swatch = document.createElement('span');
                        swatch.className = 'legend-dot legend-dot-small';
                        swatch.style.background = color;
                        const text = document.createElement('span');
                        text.textContent = nameText;
                        row.append(swatch, text);
                        body.appendChild(row);
                    });
                } else {
                    const note = document.createElement('div');
                    note.className = 'legend-note';
                    note.textContent = 'No specialized legend available for this layer.';
                    body.appendChild(note);
                }

                toggle.addEventListener('click', () => {
                    const collapsed = body.classList.toggle('is-collapsed');
                    toggle.setAttribute('aria-expanded', String(!collapsed));
                    toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${name} legend`);
                    toggle.innerHTML = `<i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}" aria-hidden="true"></i>`;
                });

                header.append(title, toggle);
                section.append(header, body);
                content.appendChild(section);
            });
        };

        const getAirQualityValue = (feature) => {
            const p = feature?.properties || {};
            return safeNumber(p.value ?? p.value_2);
        };

        const getAirQualityUnit = (feature) => {
            const p = feature?.properties || {};
            return String(p.unit ?? p.unit_2 ?? '').trim();
        };

        const updateTimeStatus = (mode, year) => {
            const badge = document.getElementById(`${TIME_PREFIX}timeStatusBadge`);
            if (!badge) return;
            badge.textContent = mode === 'all'
                ? 'Showing: All years'
                : mode === 'exact'
                    ? `Showing: ${year}`
                    : `Showing: Up to ${year}`;
        };

        const updateAirQualityStatus = (min, max, visibleCount = null) => {
            const status = document.getElementById(`${TIME_PREFIX}airQualityStatus`);
            if (!status) return;

            const unit = airQualityUnit ? ` ${airQualityUnit}` : '';
            if (min === null && max === null) {
                status.textContent = visibleCount === null
                    ? 'Showing: All available readings'
                    : `Showing: All ${visibleCount.toLocaleString()} available readings`;
                return;
            }

            const minText = min === null ? 'Any' : `${Number(min).toLocaleString()}${unit}`;
            const maxText = max === null ? 'Any' : `${Number(max).toLocaleString()}${unit}`;
            const countText = visibleCount === null ? '' : ` · ${visibleCount.toLocaleString()} readings`;
            status.textContent = `Range: ${minText} – ${maxText}${countText}`;
        };

        const setFilterSectionAvailability = (section, available, message) => {
            if (!section) return;
            const controls = section.querySelectorAll('select, input, button');
            controls.forEach((control) => {
                control.disabled = !available;
            });
            const note = section.querySelector('.filter-availability');
            if (note) {
                note.hidden = available;
                note.textContent = available ? '' : message;
            }
        };

        const updateFiltersPanelState = () => {
            const panel = document.getElementById('map-filters-panel');
            if (!panel) return;

            const earthquakeSection = panel.querySelector('.filter-earthquakes');
            const airSection = panel.querySelector('.filter-air-quality');

            const earthquakesAvailable = Boolean(earthquakeLayer && earthquakeFeatures.length);
            const earthquakesVisible = earthquakesAvailable && Boolean(overlayVisibility['Significant Earthquakes']);
            setFilterSectionAvailability(
                earthquakeSection,
                earthquakesVisible,
                earthquakesAvailable
                    ? 'Enable Significant Earthquakes in Map Layers to use this filter.'
                    : 'Earthquake data is not currently available.'
            );

            const airAvailable = Boolean(airQualityLayer && airQualityFeatures.length && airQualityFilter.min !== null && airQualityFilter.max !== null);
            const airVisible = airAvailable && Boolean(overlayVisibility['Air Quality (PM)']);
            setFilterSectionAvailability(
                airSection,
                airVisible,
                airAvailable
                    ? 'Enable Air Quality (PM) in Map Layers to use this filter.'
                    : 'No numeric PM filter is currently available for this layer.'
            );

            const mode = document.getElementById(`${TIME_PREFIX}timeModeSelect`);
            const slider = document.getElementById(`${TIME_PREFIX}yearSlider`);
            const yearValue = document.getElementById(`${TIME_PREFIX}yearValue`);
            const airMin = document.getElementById(`${TIME_PREFIX}airQualityMin`);
            const airMax = document.getElementById(`${TIME_PREFIX}airQualityMax`);
            const airMinValue = document.getElementById(`${TIME_PREFIX}airQualityMinValue`);
            const airMaxValue = document.getElementById(`${TIME_PREFIX}airQualityMaxValue`);

            if (yearValue && slider) yearValue.textContent = slider.value;
            if (mode && slider && mode.value === 'all') slider.disabled = true;

            if (airMin && airQualityFilter.min !== null) airMin.value = String(airQualityFilter.min);
            if (airMax && airQualityFilter.max !== null) airMax.value = String(airQualityFilter.max);
            if (airMinValue && airQualityFilter.min !== null) airMinValue.textContent = Number(airQualityFilter.min).toLocaleString();
            if (airMaxValue && airQualityFilter.max !== null) airMaxValue.textContent = Number(airQualityFilter.max).toLocaleString();
        };

        const updateTimeSliderBounds = () => {
            const slider = document.getElementById(`${TIME_PREFIX}yearSlider`);
            const yearValue = document.getElementById(`${TIME_PREFIX}yearValue`);
            if (!slider || !earthquakeFeatures.length) return;

            const years = earthquakeFeatures.map(getFeatureYear).filter((year) => year !== null);
            if (!years.length) return;

            const minYear = Math.max(1900, Math.min(...years));
            const maxYear = Math.max(...years);
            slider.min = String(minYear);
            slider.max = String(maxYear);
            slider.value = String(maxYear);
            if (yearValue) yearValue.textContent = String(maxYear);
            updateFiltersPanelState();
        };

        const filterEarthquakes = (mode, year) => {
            if (!earthquakeLayer || !overlayVisibility['Significant Earthquakes']) return;

            const filtered = mode === 'all'
                ? earthquakeFeatures
                : earthquakeFeatures.filter((feature) => {
                    const featureYear = getFeatureYear(feature);
                    if (featureYear === null) return false;
                    return mode === 'exact'
                        ? featureYear === Number(year)
                        : featureYear <= Number(year);
                });

            earthquakeLayer.clearLayers();
            earthquakeLayer.addData(filtered);
            updateLegend();

            const existing = mapElement.querySelector('.map-no-results-earthquakes');
            if (!filtered.length && mode !== 'all') {
                const message = existing || document.createElement('div');
                message.className = 'map-no-results map-no-results-earthquakes';
                message.setAttribute('role', 'status');
                message.setAttribute('aria-live', 'polite');
                message.textContent = mode === 'exact'
                    ? `No earthquakes in ${year}`
                    : `No earthquakes up to ${year}`;
                if (!message.parentNode) mapElement.appendChild(message);
                window.clearTimeout(message._hideTimer);
                message._hideTimer = window.setTimeout(() => message.remove(), 2500);
            } else if (existing) {
                existing.remove();
            }
        };

        const filterAirQuality = (min, max) => {
            if (!airQualityLayer || !airQualityFeatures.length || !overlayVisibility['Air Quality (PM)']) return;

            const hasMin = min !== null && Number.isFinite(Number(min));
            const hasMax = max !== null && Number.isFinite(Number(max));

            const filtered = airQualityFeatures.filter((feature) => {
                const value = getAirQualityValue(feature);
                if (value === null) return false;
                if (hasMin && value < Number(min)) return false;
                if (hasMax && value > Number(max)) return false;
                return true;
            });

            airQualityLayer.clearLayers();
            airQualityLayer.addData(filtered);
            updateAirQualityStatus(min, max, filtered.length);

            const existing = mapElement.querySelector('.map-no-results-air-quality');
            if (!filtered.length) {
                const message = existing || document.createElement('div');
                message.className = 'map-no-results map-no-results-air-quality';
                message.setAttribute('role', 'status');
                message.setAttribute('aria-live', 'polite');
                message.textContent = 'No air-quality readings match the current filter.';
                if (!message.parentNode) mapElement.appendChild(message);
                window.clearTimeout(message._hideTimer);
                message._hideTimer = window.setTimeout(() => message.remove(), 2500);
            } else if (existing) {
                existing.remove();
            }

            updateLegend();
        };

        const getEarthquakeMagnitude = (feature) => {
            const p = feature?.properties || {};
            return p.EQ_MAGNITUDE ?? p.EQ_MAG_MW ?? 0;
        };

        const earthquakePointToLayer = (feature, latlng) => L.circleMarker(latlng, {
            radius: earthquakeRadius(getEarthquakeMagnitude(feature)),
            fillColor: earthquakeColor(getEarthquakeMagnitude(feature)),
            color: '#333',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
        });

        const bindEarthquakePopup = (feature, layer) => {
            const p = feature?.properties || {};
            const magnitude = escapeHtml(p.EQ_MAGNITUDE ?? p.EQ_MAG_MW ?? 'n/a');
            const location = escapeHtml(p.LOCATION_NAME ?? p.LOCATION ?? 'Unknown location');
            const country = escapeHtml(p.COUNTRY ?? '');
            const date = escapeHtml(p.DATE_STRING ?? (p.YEAR ? String(p.YEAR) : 'Unknown date'));
            const depth = p.EQ_DEPTH ?? p.DEPTH ?? null;
            const injuries = escapeHtml(p.INJURIES ?? 0);
            const housesDestroyed = escapeHtml(p.HOUSES_DESTROYED ?? 0);
            const source = safeExternalUrl(p.URL);

            layer.bindPopup(`
        <div class="map-popup">
          <div class="map-popup-title">${location}</div>
          <div><strong>Country:</strong> ${country || 'n/a'}</div>
          <div><strong>Magnitude:</strong> ${magnitude}</div>
          <div><strong>Depth:</strong> ${depth !== null ? `${escapeHtml(depth)} km` : 'n/a'}</div>
          <div><strong>Date:</strong> ${date}</div>
          <hr>
          <div><strong>Injuries:</strong> ${injuries}</div>
          <div><strong>Houses destroyed:</strong> ${housesDestroyed}</div>
          ${source ? `<div class="map-popup-link"><a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">More info →</a></div>` : ''}
        </div>
      `);
        };

        registerPanel('layers-toggle', 'fa-layer-group', 'Show layers', 'Layers', 'topleft', 'map-layers-panel', (panel) => {
            const heading = document.createElement('div');
            heading.className = 'layers-panel-header';
            heading.textContent = 'Map Layers';

            const status = document.createElement('div');
            status.className = 'map-data-status';
            status.dataset.message = 'Loading live layers…';
            status.dataset.type = 'loading';
            status.textContent = 'Loading live layers…';

            const list = document.createElement('ul');
            list.className = 'layers-list';

            panel.append(heading, status, list);
        }, 320);

        registerPanel('filters-toggle', 'fa-filter', 'Show map filters', 'Filters', 'topleft', 'map-filters-panel', (panel) => {
            const heading = document.createElement('div');
            heading.className = 'panel-heading';
            heading.textContent = 'Map Filters';

            const earthquakeSection = document.createElement('section');
            earthquakeSection.className = 'filter-section filter-earthquakes';

            const earthquakeHeading = document.createElement('h3');
            earthquakeHeading.className = 'filter-section-title';
            earthquakeHeading.textContent = 'Significant Earthquakes';

            const earthquakeNote = document.createElement('p');
            earthquakeNote.className = 'filter-availability';
            earthquakeNote.hidden = true;

            const mode = document.createElement('select');
            mode.id = `${TIME_PREFIX}timeModeSelect`;
            mode.setAttribute('aria-label', 'Earthquake time filter mode');
            mode.innerHTML = '<option value="all">All years</option><option value="exact">Exact year</option><option value="upto">Up to year</option>';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.id = `${TIME_PREFIX}yearSlider`;
            slider.min = '1900';
            slider.max = String(new Date().getFullYear());
            slider.value = String(new Date().getFullYear());
            slider.disabled = true;
            slider.setAttribute('aria-label', 'Earthquake year');

            const yearLabel = document.createElement('div');
            yearLabel.className = 'filter-value-line';
            yearLabel.innerHTML = `<span>Year</span><strong id="${TIME_PREFIX}yearValue">${slider.value}</strong>`;

            const timeBadge = document.createElement('div');
            timeBadge.className = 'filter-status';
            timeBadge.id = `${TIME_PREFIX}timeStatusBadge`;
            timeBadge.textContent = 'Showing: All years';

            const showAll = document.createElement('button');
            showAll.type = 'button';
            showAll.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
            showAll.id = `${TIME_PREFIX}showAllBtn`;
            showAll.textContent = 'Show All Years';

            earthquakeSection.append(earthquakeHeading, earthquakeNote, mode, slider, yearLabel, timeBadge, showAll);

            const divider = document.createElement('div');
            divider.className = 'filter-section-divider';

            const airSection = document.createElement('section');
            airSection.className = 'filter-section filter-air-quality';

            const airHeading = document.createElement('h3');
            airHeading.className = 'filter-section-title';
            airHeading.textContent = 'Air Quality (PM)';

            const airNote = document.createElement('p');
            airNote.className = 'filter-availability';
            airNote.hidden = true;

            const airIntro = document.createElement('p');
            airIntro.className = 'filter-description';
            airIntro.textContent = 'Limit visible readings by PM value.';

            const airMinLabel = document.createElement('label');
            airMinLabel.className = 'filter-value-line';
            airMinLabel.htmlFor = `${TIME_PREFIX}airQualityMin`;
            airMinLabel.innerHTML = `<span>Minimum</span><strong id="${TIME_PREFIX}airQualityMinValue">—</strong>`;

            const airMin = document.createElement('input');
            airMin.type = 'range';
            airMin.id = `${TIME_PREFIX}airQualityMin`;
            airMin.disabled = true;
            airMin.setAttribute('aria-label', 'Minimum air quality PM value');

            const airMaxLabel = document.createElement('label');
            airMaxLabel.className = 'filter-value-line';
            airMaxLabel.htmlFor = `${TIME_PREFIX}airQualityMax`;
            airMaxLabel.innerHTML = `<span>Maximum</span><strong id="${TIME_PREFIX}airQualityMaxValue">—</strong>`;

            const airMax = document.createElement('input');
            airMax.type = 'range';
            airMax.id = `${TIME_PREFIX}airQualityMax`;
            airMax.disabled = true;
            airMax.setAttribute('aria-label', 'Maximum air quality PM value');

            const airStatus = document.createElement('div');
            airStatus.id = `${TIME_PREFIX}airQualityStatus`;
            airStatus.className = 'filter-status';
            airStatus.textContent = 'Showing: All available readings';

            const resetAir = document.createElement('button');
            resetAir.type = 'button';
            resetAir.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
            resetAir.id = `${TIME_PREFIX}airQualityResetBtn`;
            resetAir.textContent = 'Show All PM Readings';

            airSection.append(airHeading, airNote, airIntro, airMinLabel, airMin, airMaxLabel, airMax, airStatus, resetAir);

            panel.append(heading, earthquakeSection, divider, airSection);
        }, 360);

        registerPanel('basemap-toggle', 'fa-map', 'Show basemap selector', 'Basemap', 'topleft', 'map-basemap-panel', (panel) => {
            const heading = document.createElement('div');
            heading.className = 'panel-heading';
            heading.textContent = 'Basemap';

            const grid = document.createElement('div');
            grid.className = 'basemap-grid';

            Object.keys(baseLayers).forEach((name) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'basemap-card';
                card.dataset.basemap = name;
                card.setAttribute('aria-pressed', String(name === currentBaseName));

                const thumb = document.createElement('span');
                thumb.className = 'basemap-thumb';
                thumb.style.backgroundImage = `url("${basemapThumbs[name]}")`;
                thumb.setAttribute('aria-hidden', 'true');

                const label = document.createElement('span');
                label.className = 'basemap-label';
                label.textContent = name;

                card.append(thumb, label);
                card.addEventListener('click', () => {
                    setBaseLayer(name);
                    const entry = panelRegistry.find((item) => item.panel === panel);
                    if (entry) closePanel(entry, true);
                });
                grid.appendChild(card);
            });

            panel.append(heading, grid);
        }, 360);

        registerPanel('legend-toggle', 'fa-list', 'Show map legend', 'Legend', 'bottomright', 'map-legend-panel', (panel) => {
            const header = document.createElement('div');
            header.className = 'legend-header';

            const title = document.createElement('span');
            title.className = 'legend-title';
            title.textContent = 'Map Legend';

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'legend-toggle-btn';
            toggle.setAttribute('aria-controls', 'legend-content');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Collapse map legend');
            toggle.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';

            header.append(title, toggle);

            const content = document.createElement('div');
            content.id = 'legend-content';
            content.setAttribute('aria-live', 'polite');

            toggle.addEventListener('click', (event) => {
                event.stopPropagation();
                const collapsed = content.classList.toggle('is-collapsed');
                toggle.setAttribute('aria-expanded', String(!collapsed));
                toggle.setAttribute('aria-label', collapsed ? 'Expand map legend' : 'Collapse map legend');
                toggle.innerHTML = `<i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}" aria-hidden="true"></i>`;
            });

            panel.append(header, content);
        }, 340);

        const infoControl = registerPanel('info-toggle', 'fa-circle-info', 'Show map information', 'Map Information', 'topleft', 'map-info-panel', (panel) => {
            const heading = document.createElement('div');
            heading.className = 'panel-heading';
            heading.textContent = 'Using the Map';

            const body = document.createElement('div');
            body.className = 'info-panel-copy';
            body.innerHTML = `
        <p><strong>Pan:</strong> drag the map or use touch gestures.</p>
        <p><strong>Zoom:</strong> use the Leaflet controls, wheel, or pinch.</p>
        <p><strong>Orientation:</strong> rotate with right-drag or Shift + scroll on desktop, or with a two-finger gesture on touch devices. Click the compass to return to north-up.</p>
        <p><strong>Layers:</strong> toggle earthquake and air-quality overlays.</p>
        <p><strong>Filters:</strong> filter earthquakes by year and air-quality readings by PM value.</p>
        <p><strong>Legend:</strong> inspect the symbology for the visible overlays.</p>
        <p><strong>Home:</strong> restore the starting map state.</p>
        <p class="mb-0"><strong>Popups:</strong> click a feature to inspect its attributes.</p>
      `;
            panel.append(heading, body);
        }, 340);

        // Remove unused local reference warning without changing Leaflet behavior.
        void infoControl;

        const setBaseLayer = (name) => {
            const next = baseLayers[name];
            if (!next) return;
            if (baseLayers[currentBaseName] && map.hasLayer(baseLayers[currentBaseName])) {
                map.removeLayer(baseLayers[currentBaseName]);
            }
            next.addTo(map);
            currentBaseName = name;
            document.querySelectorAll('.basemap-card').forEach((card) => {
                const active = card.dataset.basemap === name;
                card.classList.toggle('is-active', active);
                card.setAttribute('aria-pressed', String(active));
            });
        };

        const HomeControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd() {
                const container = L.DomUtil.create('div', 'leaflet-control home-toggle');
                const button = L.DomUtil.create('button', 'layers-toggle-btn', container);
                button.type = 'button';
                button.title = 'Home';
                button.setAttribute('aria-label', 'Return to initial map state');
                button.innerHTML = '<i class="fa-solid fa-house" aria-hidden="true"></i>';

                button.addEventListener('click', () => {
                    if (!initialMapState) {
                        map.setView([20, 0], 2, { animate: false });
                        return;
                    }

                    setBaseLayer(initialMapState.base);
                    if (typeof map.setBearing === 'function') map.setBearing(initialMapState.bearing || 0);
                    map.setView(initialMapState.center, initialMapState.zoom, { animate: false });

                    Object.entries(initialMapState.overlays).forEach(([name, visible]) => {
                        overlayVisibility[name] = visible;
                        const layer = overlays[name];
                        if (!layer) return;
                        if (visible && !map.hasLayer(layer)) layer.addTo(map);
                        if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
                    });

                    const mode = document.getElementById(`${TIME_PREFIX}timeModeSelect`);
                    const slider = document.getElementById(`${TIME_PREFIX}yearSlider`);
                    if (mode) mode.value = initialMapState.timeMode;
                    if (slider) {
                        slider.value = String(initialMapState.timeYear);
                        slider.disabled = initialMapState.timeMode === 'all';
                    }
                    const yearValue = document.getElementById(`${TIME_PREFIX}yearValue`);
                    if (yearValue) yearValue.textContent = String(initialMapState.timeYear);
                    updateTimeStatus(initialMapState.timeMode, initialMapState.timeYear);

                    if (earthquakeLayer && overlayVisibility['Significant Earthquakes']) {
                        earthquakeLayer.clearLayers();
                        if (initialMapState.timeMode === 'all') earthquakeLayer.addData(earthquakeFeatures);
                        else filterEarthquakes(initialMapState.timeMode, initialMapState.timeYear);
                    }

                    if (airQualityLayer && airQualityFeatures.length) {
                        airQualityFilter = {
                            min: initialMapState.airQualityMin ?? airQualityFilter.min,
                            max: initialMapState.airQualityMax ?? airQualityFilter.max
                        };
                        const airMin = airMinSlider();
                        const airMax = airMaxSlider();
                        if (airMin && airQualityFilter.min !== null) airMin.value = String(airQualityFilter.min);
                        if (airMax && airQualityFilter.max !== null) airMax.value = String(airQualityFilter.max);
                        if (overlayVisibility['Air Quality (PM)']) filterAirQuality(airQualityFilter.min, airQualityFilter.max);
                        else updateAirQualityStatus(airQualityFilter.min, airQualityFilter.max, null);
                    }

                    updateLayersPanel();
                    updateLegend();
                    updateFiltersPanelState();
                });

                return container;
            }
        });
        map.addControl(new HomeControl());

        const timeMode = () => document.getElementById(`${TIME_PREFIX}timeModeSelect`);
        const timeSlider = () => document.getElementById(`${TIME_PREFIX}yearSlider`);
        const airMinSlider = () => document.getElementById(`${TIME_PREFIX}airQualityMin`);
        const airMaxSlider = () => document.getElementById(`${TIME_PREFIX}airQualityMax`);

        document.addEventListener('change', (event) => {
            if (event.target?.id !== `${TIME_PREFIX}timeModeSelect`) return;
            if (!overlayVisibility['Significant Earthquakes']) return;

            const mode = event.target.value;
            const slider = timeSlider();
            const year = Number(slider?.value || new Date().getFullYear());
            if (slider) slider.disabled = mode === 'all';
            updateTimeStatus(mode, year);
            filterEarthquakes(mode, year);
            updateFiltersPanelState();
        });

        document.addEventListener('input', (event) => {
            if (event.target?.id === `${TIME_PREFIX}yearSlider`) {
                if (!overlayVisibility['Significant Earthquakes']) return;
                const year = Number(event.target.value);
                const yearValue = document.getElementById(`${TIME_PREFIX}yearValue`);
                if (yearValue) yearValue.textContent = String(year);
                const mode = timeMode()?.value || 'exact';
                updateTimeStatus(mode, year);
                if (mode !== 'all') filterEarthquakes(mode, year);
                return;
            }

            if (event.target?.id === `${TIME_PREFIX}airQualityMin` || event.target?.id === `${TIME_PREFIX}airQualityMax`) {
                if (!overlayVisibility['Air Quality (PM)']) return;

                let min = Number(airMinSlider()?.value);
                let max = Number(airMaxSlider()?.value);
                if (!Number.isFinite(min) || !Number.isFinite(max)) return;

                if (min > max) {
                    if (event.target.id === `${TIME_PREFIX}airQualityMin`) {
                        max = min;
                        const maxSlider = airMaxSlider();
                        if (maxSlider) maxSlider.value = String(max);
                    } else {
                        min = max;
                        const minSlider = airMinSlider();
                        if (minSlider) minSlider.value = String(min);
                    }
                }

                airQualityFilter = { min, max };
                const minValue = document.getElementById(`${TIME_PREFIX}airQualityMinValue`);
                const maxValue = document.getElementById(`${TIME_PREFIX}airQualityMaxValue`);
                if (minValue) minValue.textContent = Number(min).toLocaleString();
                if (maxValue) maxValue.textContent = Number(max).toLocaleString();
                filterAirQuality(min, max);
                return;
            }
        });

        document.addEventListener('click', (event) => {
            if (event.target?.id === `${TIME_PREFIX}showAllBtn`) {
                if (!overlayVisibility['Significant Earthquakes']) {
                    updateFiltersPanelState();
                    return;
                }
                const mode = timeMode();
                const slider = timeSlider();
                if (mode) mode.value = 'all';
                if (slider) slider.disabled = true;
                updateTimeStatus('all', null);
                filterEarthquakes('all');
                updateFiltersPanelState();
                return;
            }

            if (event.target?.id === `${TIME_PREFIX}airQualityResetBtn`) {
                if (!overlayVisibility['Air Quality (PM)'] || !airQualityFeatures.length) {
                    updateFiltersPanelState();
                    return;
                }

                const numericValues = airQualityFeatures.map(getAirQualityValue).filter((value) => value !== null);
                if (!numericValues.length) return;
                airQualityFilter = {
                    min: Math.min(...numericValues),
                    max: Math.max(...numericValues)
                };

                const airMin = airMinSlider();
                const airMax = airMaxSlider();
                if (airMin) airMin.value = String(airQualityFilter.min);
                if (airMax) airMax.value = String(airQualityFilter.max);
                updateAirQualityStatus(airQualityFilter.min, airQualityFilter.max, airQualityFeatures.length);
                updateFiltersPanelState();
                filterAirQuality(airQualityFilter.min, airQualityFilter.max);
            }
        });

        // ------------------------------------------------------------
        // Bottom-left map utility controls
        // Coordinate display + scale bar
        // ------------------------------------------------------------

        const coordinateControl = L.control({
            position: 'bottomleft'
        });

        coordinateControl.onAdd = function () {

            const div = L.DomUtil.create(
                'div',
                'coord-display'
            );

            div.setAttribute(
                'aria-label',
                'Current map coordinates'
            );

            div.setAttribute(
                'aria-live',
                'polite'
            );

            div.textContent =
                'Lat: -- | Lon: --';

            this._div = div;

            return div;
        };

        coordinateControl.addTo(map);

        // Update coordinates as the pointer moves.
        map.on('mousemove', (event) => {

            if (!coordinateControl._div) {
                return;
            }

            coordinateControl._div.textContent =
                `Lat: ${event.latlng.lat.toFixed(4)} | Lon: ${event.latlng.lng.toFixed(4)}`;
        });

        // Scale bar. It shares the bottom-left utility group with coordinates.
        const scaleControl = L.control.scale({
            position: 'bottomleft',
            metric: true,
            imperial: false,
            maxWidth: 90
        });

        scaleControl.addTo(map);

        // Keep the attribution compact while preserving provider credits.
        const attributionControl = map.attributionControl;
        if (attributionControl && typeof attributionControl.setPrefix === 'function') {
            attributionControl.setPrefix(false);
        }

        // ------------------------------------------------------------
        // Map orientation / compass
        // ------------------------------------------------------------
        // The rotation plugin provides one compact compass control in the
        // top-right. It resets the map to north-up when clicked, while
        // right-drag / Shift+wheel / touch rotation provide the actual
        // bearing interaction.
        if (rotationAvailable) {
            const compassControl = document.querySelector('.leaflet-control-rotate');
            const compassButton = compassControl?.querySelector('a, button');

            if (compassButton) {
                compassButton.setAttribute('aria-label', 'Reset map orientation to north');
                compassButton.setAttribute('title', 'Map orientation — click to reset north');
            }

            const updateCompassState = () => {
                if (!compassButton || typeof map.getBearing !== 'function') return;

                const bearing = ((map.getBearing() % 360) + 360) % 360;
                const isNorth = bearing < 0.5 || bearing > 359.5;
                compassButton.setAttribute(
                    'aria-label',
                    isNorth ? 'Map is north up' : `Reset map orientation to north (${Math.round(bearing)} degrees)`
                );
            };

            map.on('rotate', updateCompassState);
            updateCompassState();
        }

        if (!rotationAvailable) {
            console.info('Leaflet rotation plugin not available; map remains north-up.');
        }

        const captureInitialMapState = () => {
            const center = map.getCenter();
            const slider = timeSlider();
            const mode = timeMode();
            initialMapState = {
                center: [center.lat, center.lng],
                zoom: map.getZoom(),
                bearing: typeof map.getBearing === 'function' ? map.getBearing() : 0,
                base: currentBaseName,
                overlays: Object.fromEntries(Object.keys(overlays).map((name) => [name, Boolean(overlayVisibility[name])])),
                timeMode: mode?.value || 'all',
                timeYear: Number(slider?.value || new Date().getFullYear()),
                airQualityMin: airQualityFilter.min,
                airQualityMax: airQualityFilter.max
            };
            window._initialMapState = initialMapState;
        };

        const setLayerStatus = (message, type = 'loading') => {
            const status = document.querySelector('#map-layers-panel .map-data-status');
            if (!status) return;
            status.dataset.message = message;
            status.dataset.type = type;
            status.textContent = message;
        };

        const loadEarthquakes = async () => {
            const data = await queryArcGISLayer(EARTHQUAKE_LAYER_URL);
            earthquakeFeatures = data.features || [];
            earthquakeLayer = L.geoJSON(data, {
                pointToLayer: earthquakePointToLayer,
                onEachFeature: bindEarthquakePopup
            });
            addOverlay('Significant Earthquakes', earthquakeLayer, true);
            updateTimeSliderBounds();

            if (earthquakeFeatures.length) {
                const bounds = earthquakeLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5, animate: false });
                }
            }

            return earthquakeFeatures.length;
        };

        const loadAirQuality = async () => {
            const data = await queryArcGISLayer(AIR_QUALITY_LAYER_URL);
            airQualityFeatures = data.features || [];
            airQualityUnit = airQualityFeatures.map(getAirQualityUnit).find(Boolean) || '';

            const numericValues = airQualityFeatures.map(getAirQualityValue).filter((value) => value !== null);
            if (numericValues.length) {
                const minValue = Math.min(...numericValues);
                const maxValue = Math.max(...numericValues);
                airQualityFilter = { min: minValue, max: maxValue };

                const airMin = document.getElementById(`${TIME_PREFIX}airQualityMin`);
                const airMax = document.getElementById(`${TIME_PREFIX}airQualityMax`);
                const step = maxValue - minValue > 100 ? 1 : maxValue - minValue > 10 ? 0.5 : 0.1;
                if (airMin) { airMin.min = String(minValue); airMin.max = String(maxValue); airMin.step = String(step); airMin.value = String(minValue); }
                if (airMax) { airMax.min = String(minValue); airMax.max = String(maxValue); airMax.step = String(step); airMax.value = String(maxValue); }
            }

            airQualityLayer = L.geoJSON(data, {
                pointToLayer(feature, latlng) {
                    const p = feature?.properties || {};
                    const value = p.value ?? p.value_2 ?? null;
                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: airQualityColor(value),
                        color: '#222',
                        weight: 0.8,
                        opacity: 1,
                        fillOpacity: 0.9
                    });
                },
                onEachFeature(feature, layer) {
                    const p = feature?.properties || {};
                    const value = p.value ?? p.value_2 ?? 'n/a';
                    const unit = p.unit ?? p.unit_2 ?? '';
                    const location = escapeHtml(p.location ?? p.owner_name ?? p.city ?? 'Unknown');
                    const country = escapeHtml(p.country_name ?? p.country ?? '');
                    const date = escapeHtml(p.lastUpdated ?? '');
                    const provider = escapeHtml(p.provider_name ?? '');
                    const source = safeExternalUrl(p.url);

                    layer.bindPopup(`
            <div class="map-popup">
              <div class="map-popup-title">${location}${country ? `, ${country}` : ''}</div>
              <div><strong>Value:</strong> ${escapeHtml(value)} ${escapeHtml(unit)}</div>
              ${provider ? `<div><strong>Source:</strong> ${provider}</div>` : ''}
              ${date ? `<div><strong>Last updated:</strong> ${date}</div>` : ''}
              ${source ? `<div class="map-popup-link"><a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Station details →</a></div>` : ''}
            </div>
          `);
                }
            });
            addOverlay('Air Quality (PM)', airQualityLayer, true);
            updateAirQualityStatus(airQualityFilter.min, airQualityFilter.max, airQualityFeatures.length);
            updateFiltersPanelState();
            return airQualityFeatures.length;
        };

        // Allow panels to follow their controls while the page scrolls.
        window.addEventListener('scroll', schedulePanelReposition, { passive: true });
        window.addEventListener('resize', schedulePanelReposition, { passive: true });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activePanel) closePanel(activePanel, true);
        });
        document.addEventListener('click', (event) => {
            if (!activePanel) return;
            if (activePanel.container.contains(event.target) || activePanel.panel.contains(event.target)) return;
            closePanel(activePanel, false);
        });

        window.addEventListener('load', () => {
            map.invalidateSize({ pan: false });
        }, { passive: true });
        window.addEventListener('pageshow', () => {
            map.invalidateSize({ pan: false });
        }, { passive: true });

        try {
            const [earthquakeResult, airResult] = await Promise.allSettled([
                loadEarthquakes(),
                loadAirQuality()
            ]);

            const earthquakeOk = earthquakeResult.status === 'fulfilled';
            const airOk = airResult.status === 'fulfilled';

            if (!earthquakeOk) console.error('Earthquake layer failed to load:', earthquakeResult.reason);
            if (!airOk) console.error('Air-quality layer failed to load:', airResult.reason);

            if (earthquakeOk && airOk) setLayerStatus('2 live layers loaded', 'success');
            else if (earthquakeOk) setLayerStatus('Earthquakes loaded · Air quality unavailable', 'warning');
            else if (airOk) setLayerStatus('Air quality loaded · Earthquakes unavailable', 'warning');
            else setLayerStatus('Live layers unavailable — see browser console', 'error');

            captureInitialMapState();
            updateLayersPanel();
            updateLegend();
            updateFiltersPanelState();

            if (activePanel) positionPanel(activePanel.panel, activePanel.trigger, activePanel.width);
        } catch (error) {
            console.error('Live Map initialization error:', error);
            setLayerStatus('Live layers unavailable — see browser console', 'error');
            updateLayersPanel();
            updateLegend();
        }

        window.portfolioMap = map;
        window.portfolioOverlays = overlays;
        window.portfolioBaseLayers = baseLayers;
        window.setBaseLayer = setBaseLayer;
        window.updateLegend = updateLegend;
        window.registerOverlay = addOverlay;

        window.registerArcGISLayer = async (name, featureServerUrl, visible = false) => {
            try {
                const data = await queryArcGISLayer(featureServerUrl);
                const layer = L.geoJSON(data, {
                    pointToLayer: earthquakePointToLayer,
                    onEachFeature: bindEarthquakePopup
                });
                addOverlay(name, layer, visible);
                return layer;
            } catch (error) {
                console.warn(`Could not register ArcGIS layer "${name}":`, error);
                return null;
            }
        };

        // Used only to keep old debug integrations compatible.
        window.portfolioEarthquakeLayer = () => earthquakeLayer;
        window.portfolioAirQualityLayer = () => airQualityLayer;
        window.portfolioMapData = () => ({ earthquakeFeatures, earthquakeLayer, airQualityLayer });
    });
})();
