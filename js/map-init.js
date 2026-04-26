/* map-init.js
   Loads an ArcGIS FeatureServer (geojson), draws it on a Leaflet map,
   and creates UI: Layers button, collapsible dynamic legend, scale bar,
   coordinate display, a time toggle control for filtering earthquakes,
   and a basemap switcher. Buttons are sized/hover-synced to the Leaflet
   zoom anchors so they look uniform.
   - Requires Leaflet + FontAwesome to be loaded before this script.
*/
let _timeUIInitialized = false;
(function () {
    // --------- Config ---------
    const ARC_URL = 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Significant_Earthquakes/FeatureServer/0';
    const ARC_QUERY_SUFFIX = '/query?where=1=1&outFields=*&outSR=4326&f=geojson';
    const GEOJSON_URL = ARC_URL + ARC_QUERY_SUFFIX;

    // Color & size helpers (explicit numeric coercion)
    function colorForMagnitude(m) {
        const n = Number(m);
        if (!Number.isFinite(n)) return '#fdd49e';
        return n >= 7 ? '#7f0000' :
            n >= 6 ? '#b30000' :
                n >= 5 ? '#e34a33' :
                    n >= 4 ? '#fc8d59' :
                        n >= 3 ? '#fdbb84' :
                            '#fdd49e';
    }
    function radiusForMagnitude(m) {
        const n = Number(m);
        if (!Number.isFinite(n)) return 4;
        return Math.max(4, Math.min(24, Math.round(n * 2)));
    }

    // Robust year extractor (outer scope)
    function getFeatureYear(feature) {
        if (!feature || !feature.properties) return null;
        const p = feature.properties;
        if (p.YEAR && !isNaN(Number(p.YEAR))) return Number(p.YEAR);
        if (p.year && !isNaN(Number(p.year))) return Number(p.year);
        if (p.DATE_STRING && typeof p.DATE_STRING === 'string') {
            const m = p.DATE_STRING.match(/(\d{4})/);
            if (m) return Number(m[1]);
        }
        if (p.time && !isNaN(Number(p.time))) {
            const d = new Date(Number(p.time));
            if (!isNaN(d.getTime())) return d.getFullYear();
        }
        if (p.DATE) {
            const d = new Date(p.DATE);
            if (!isNaN(d.getTime())) return d.getFullYear();
        }
        for (const k of Object.keys(p)) {
            if (/date|time|day/i.test(k) && typeof p[k] === 'string') {
                const mm = String(p[k]).match(/(\d{4})/);
                if (mm) return Number(mm[1]);
            }
        }
        return null;
    }

    // small helper to escape HTML (layer names into attributes & popup values)
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --------- Inject CSS (uses CSS variables set at runtime) ---------
    (function injectStyles() {
        const css = `
/* control panels and layout */
.leaflet-control.layers-toggle,
.leaflet-control.time-toggle,
.leaflet-control.basemap-toggle,
.leaflet-control.legend-toggle { position: relative; z-index: 700; }
.leaflet-control.layers-toggle { margin-top: 8px; }
.leaflet-control.time-toggle   { margin-top: 8px; }
.leaflet-control.basemap-toggle { margin-top: 8px; }

/* panels and small UI */
.leaflet-control-layers-toggle-panel,
.time-panel,
.legend-panel,
.basemap-panel,
.legend {
  z-index: 900 !important;
  background: #fff;
  padding: 8px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  max-width: 320px;
  font-size: 14px;
}

/* layers list */
.layers-panel-header { font-weight:600; margin-bottom:6px; }
.layers-list { list-style:none; padding:0; margin:0; }
.layers-list li { margin:6px 0; display:flex; align-items:center; gap:8px; }

/* common button surface: uses CSS variables set by JS to match zoom visuals */
.leaflet-control .layers-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-sizing: border-box;
  background: var(--leaflet-zoom-bg, #fff);
  border: var(--leaflet-zoom-border, 1px solid rgba(0,0,0,0.08));
  box-shadow: var(--leaflet-zoom-boxshadow, 0 1px 2px rgba(0,0,0,0.06));
  color: var(--leaflet-zoom-color, #323232);
  text-decoration: none;
  transition: background 120ms ease, box-shadow 120ms ease, color 120ms ease, transform 80ms ease;
  outline: none;
}

/* hover / focus / active states use variables (populated by JS). fallback values given */
.leaflet-control .layers-toggle-btn:hover,
.leaflet-control .layers-toggle-btn:focus {
  background: var(--leaflet-zoom-hover-bg, #f4f4f4);
  border: var(--leaflet-zoom-hover-border, var(--leaflet-zoom-border, 1px solid rgba(0,0,0,0.08)));
  box-shadow: var(--leaflet-zoom-hover-boxshadow, 0 2px 6px rgba(0,0,0,0.08));
  color: var(--leaflet-zoom-hover-color, var(--leaflet-zoom-color, #323232));
}

.leaflet-control .layers-toggle-btn:active {
  background: var(--leaflet-zoom-active-bg, #e9e9e9);
  transform: translateY(1px);
}

/* icon inside */
.leaflet-control .layers-toggle-btn i { font-size: var(--leaflet-zoom-icon-size, 18px); line-height: 1; vertical-align: middle; display:inline-block; }

/* legend small visuals */
.legend { font-size:13px; padding:10px; border-radius:8px; }
.legend-header{ display:flex; justify-content:space-between; font-weight:600; margin-bottom:6px; }
.legend button{ border:none; background:none; cursor:pointer; font-size:16px; }

/* basemap grid */
.basemap-grid { display:grid; gap:8px; }
.basemap-card { display:flex; flex-direction:column; align-items:stretch; border-radius:6px; overflow:hidden; }

/* coord display & time slider surface */
.coord-display { background:#fff; padding:6px 10px; border-radius:6px; box-shadow:0 0 10px rgba(0,0,0,0.12); font-size:13px; }
.time-slider { background:#fff; padding:8px; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.12); font-size:13px; }
.time-slider input[type="range"] { width:160px; }

/* legend toggle enhancements (fallbacks) */
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header { display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; padding:4px 2px; user-select:none; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header .legend-title { font-weight:600; font-size:14px; }
.leaflet-control .leaflet-control-layers-toggle-panel #legend-content { overflow:hidden; transition: max-height 220ms ease, padding 180ms ease; }
.leaflet-control .leaflet-control-layers-toggle-panel #legend-content.collapsed { max-height:0 !important; padding-top:0 !important; padding-bottom:0 !important; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header button#legend-toggle { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; padding:0; margin:0; border-radius:6px; border:none; background:transparent; cursor:pointer; line-height:1; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-toggle-chevron { display:inline-block; transition: transform 220ms ease; transform-origin:50% 50%; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-toggle-chevron.rotated { transform: rotate(180deg); }

/* small accessibility: focus ring fallback */
.leaflet-control .layers-toggle-btn:focus {
  box-shadow: 0 0 0 3px rgba(50,115,220,0.12);
}
`;
        const s = document.createElement('style');
        s.appendChild(document.createTextNode(css));
        document.head.appendChild(s);
    })();

    // --------- Map init (only if #map exists) ---------
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof L === 'undefined') {
            console.warn('Leaflet not found. Load Leaflet before map-init.js');
            return;
        }
        const mapEl = document.getElementById('map');
        if (!mapEl) return;

        // TIME ID prefix per-map (prevents collisions)
        const TIME_PREFIX = 'map_' + mapEl.id + '_';

        // Base map (start with a neutral OSM - basemap switcher will allow swapping)
        // Do NOT add to map here; setBaseLayer will add the chosen layer
        const initialBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        });
        const map = L.map('map', { zoomControl: true }).setView([20, 0], 2);

        // Overlays & state
        const overlays = {};
        const overlayVisibility = {};
        window.portfolioOverlays = overlays; // debug

        // UI refs
        let layersControlInstance = null;
        let legendControlInstance = null;

        // Data
        let earthquakeFeatures = [];
        let earthquakeLayer = null;

        // Helper: add overlay + update panel/legend
        function addOverlay(name, layer, visible) {
            overlays[name] = layer;
            overlayVisibility[name] = !!visible;
            if (visible) {
                layer.addTo(map);
                updateLegend(name);
            }
            updateLayersPanel();
        }

        // Fetch helper
        async function loadArcGISGeoJSON(url) {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error('ArcGIS fetch error: ' + res.status);
            return await res.json();
        }

        // Styling + popup helpers (escape content)
        function pointToLayerFn(feature, latlng) {
            const mag = (feature.properties && (feature.properties.EQ_MAGNITUDE ?? feature.properties.EQ_MAG_MW)) || 0;
            return L.circleMarker(latlng, {
                radius: radiusForMagnitude(mag),
                fillColor: colorForMagnitude(mag),
                color: '#333',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.9
            });
        }
        function onEachFeatureFn(feature, layer) {
            const p = feature.properties || {};
            const magnitude = escapeHtml(p.EQ_MAGNITUDE ?? p.EQ_MAG_MW ?? 'n/a');
            const location = escapeHtml(p.LOCATION_NAME ?? p.LOCATION ?? 'Unknown location');
            const country = escapeHtml(p.COUNTRY ?? '');
            const date = escapeHtml(p.DATE_STRING ?? (p.YEAR ? String(p.YEAR) : 'Unknown date'));
            const depth = (p.EQ_DEPTH ?? p.DEPTH ?? null);
            const injuries = escapeHtml(p.INJURIES ?? 0);
            const housesDestroyed = escapeHtml(p.HOUSES_DESTROYED ?? 0);
            const moreInfo = p.URL ?? null;
            let dateStr = date;
            if (typeof date === 'number' && !isNaN(date)) {
                const d = new Date(date);
                if (!isNaN(d)) dateStr = d.toLocaleString();
            }
            const html = `
        <div style="min-width:240px">
          <div style="font-size:16px;font-weight:700;margin-bottom:4px">${location}</div>
          <div><strong>Country:</strong> ${country}</div>
          <div><strong>Magnitude:</strong> ${magnitude}</div>
          <div><strong>Depth:</strong> ${depth !== null ? escapeHtml(depth + ' km') : 'n/a'}</div>
          <div><strong>Date:</strong> ${dateStr}</div>
          <hr style="margin:6px 0">
          <div><strong>Injuries:</strong> ${injuries}</div>
          <div><strong>Houses destroyed:</strong> ${housesDestroyed}</div>
          ${moreInfo ? `<div style="margin-top:6px"><a href="${escapeHtml(moreInfo)}" target="_blank" rel="noopener">More info →</a></div>` : ''}
        </div>
      `;
            layer.bindPopup(html);
        }

        // ----------------- Panel fit helper (improved) -----------------
        function bringPanelIntoViewport(panel, anchorEl, preferredWidth = 280) {
            if (!panel || !anchorEl) return;

            panel.style.position = 'fixed';
            panel.style.zIndex = 10000;
            panel.style.overflowY = 'auto';
            panel.style.boxSizing = 'border-box';

            const a = anchorEl.getBoundingClientRect();
            const vw = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
            const vh = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);

            // width: respect preferredWidth but never overflow viewport
            const targetW = Math.min(preferredWidth, Math.max(180, Math.min(vw - 16, panel.offsetWidth || preferredWidth)));
            panel.style.width = targetW + 'px';

            // horizontal placement (prefer right of anchor, else left), then clamp
            let left = Math.round(a.right + 8);
            if (left + targetW > vw - 8) {
                left = Math.round(a.left - targetW - 8);
            }
            left = Math.max(8, Math.min(left, vw - targetW - 8));
            panel.style.left = left + 'px';

            // compute usable panel height and clamp to viewport
            const maxAvailableHeight = Math.max(120, vh - 32);
            const natural = panel.scrollHeight || Math.round(vh * 0.5);
            const desiredHeight = Math.min(natural, maxAvailableHeight);
            panel.style.maxHeight = desiredHeight + 'px';
            const panelH = desiredHeight;

            // vertical placement: prefer below anchor; if not enough room, place above; final clamp
            let top = Math.round(a.bottom + 6);
            if (top + panelH > vh - 8) {
                top = Math.round(a.top - panelH - 6);
            }
            top = Math.max(8, Math.min(top, vh - panelH - 8));
            panel.style.top = top + 'px';
            panel.style.bottom = 'auto';
        }

        // ---------- Panel-sibling helper: close other open panels ----------
        function closeSiblingPanels(exceptPanel) {
            // find all panels created with class .leaflet-control-layers-toggle-panel
            const panels = document.querySelectorAll('.leaflet-control-layers-toggle-panel');
            panels.forEach(p => {
                if (p === exceptPanel) return;
                try {
                    if (p.style.display === 'block') {
                        p.style.display = 'none';
                        p.setAttribute('aria-hidden', 'true');
                        // reset any inline positioning applied by bringPanelIntoViewport
                        p.style.position = '';
                        p.style.left = '';
                        p.style.top = '';
                        p.style.bottom = '';
                        p.style.maxHeight = '';
                        // if the panel has a legend header/toggle update ARIA
                        const tb = p.querySelector('#legend-toggle');
                        const header = p.querySelector('.legend-header') || p.querySelector('.layers-panel-header');
                        if (tb) tb.setAttribute('aria-expanded', 'false');
                        if (header) header.setAttribute('aria-expanded', 'false');
                    }
                } catch (e) { /* ignore DOM anomalies */ }
            });
        }

        // ---------- Layers control factory ----------
        function createLayersControl() {
            const LayersControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                    const container = L.DomUtil.create('div', 'leaflet-control layers-toggle');
                    container.style.background = 'transparent';
                    container.style.padding = '0';

                    const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                    button.href = '#';
                    button.title = 'Layers';
                    button.innerHTML = '<i class="fas fa-layer-group" aria-hidden="true"></i>';
                    button.setAttribute('aria-label', 'Show layers');

                    const panel = L.DomUtil.create('div', 'leaflet-control-layers-toggle-panel', container);
                    panel.style.display = 'none';
                    panel.setAttribute('role', 'dialog');
                    panel.setAttribute('aria-hidden', 'true');

                    const header = L.DomUtil.create('div', 'layers-panel-header', panel);
                    header.textContent = 'Layers';
                    const list = L.DomUtil.create('ul', 'layers-list', panel);

                    L.DomEvent.disableClickPropagation(panel);
                    L.DomEvent.disableScrollPropagation(panel);

                    L.DomEvent.on(button, 'click', L.DomEvent.stop)
                        .on(button, 'click', function () {
                            const vis = panel.style.display === 'block';

                            if (!vis) {
                                // Close other panels then open this one
                                closeSiblingPanels(panel);
                                panel.style.display = 'block';
                                panel.setAttribute('aria-hidden', 'false');
                                try { bringPanelIntoViewport(panel, button, 320); } catch (e) { /* non-fatal */ }
                            } else {
                                // Close this panel and reset inline positioning
                                panel.style.display = 'none';
                                panel.setAttribute('aria-hidden', 'true');
                                panel.style.position = '';
                                panel.style.left = '';
                                panel.style.top = '';
                                panel.style.bottom = '';
                                panel.style.maxHeight = '';
                            }
                        });

                    this._panel = panel;
                    this._list = list;
                    this._container = container;

                    // close on outside click
                    document.addEventListener('click', function (ev) {
                        const target = ev.target;
                        if (!container.contains(target) && panel.style.display === 'block') {
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';
                        }
                    });

                    return container;
                }
            });

            return new LayersControl();
        }

        // ---------- Time control factory (toggle button + panel) ----------
        function createTimeControl() {
            const TimeControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                    const container = L.DomUtil.create('div', 'leaflet-control time-toggle');
                    container.style.background = 'transparent';
                    container.style.padding = '0';

                    const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                    button.href = '#';
                    button.title = 'Time filter';
                    button.innerHTML = '<i class="fas fa-clock" aria-hidden="true"></i>';
                    button.setAttribute('aria-label', 'Show time filter');

                    const panel = L.DomUtil.create('div', 'leaflet-control-layers-toggle-panel time-panel', container);
                    panel.style.display = 'none';
                    panel.style.minWidth = '220px';
                    panel.setAttribute('role', 'dialog');
                    panel.setAttribute('aria-hidden', 'true');

                    // Use TIME_PREFIX to avoid global ID collisions
                    const curYear = new Date().getFullYear();
                    panel.innerHTML = `
            <div style="font-weight:600;margin-bottom:6px">Time Filter</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
              <select id="${TIME_PREFIX}timeModeSelect" aria-label="Time filter mode" style="flex:1;padding:6px;border-radius:6px;">
                <option value="exact">Exact year</option>
                <option value="upto">Up to year</option>
                <option value="all">All years</option>
              </select>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:8px;">
              <input class="time-range" type="range" id="${TIME_PREFIX}yearSlider" min="1900" max="${curYear}" value="${curYear}" step="1" style="width:100%;" />
              <div style="display:flex;gap:8px;align-items:center;">
                <span id="${TIME_PREFIX}yearValue" style="min-width:56px;text-align:center;font-weight:600;">${curYear}</span>
                <span id="${TIME_PREFIX}timeStatusBadge" style="background:#f1f1f1;padding:6px 8px;border-radius:999px;font-size:12px;font-weight:600;">Showing: All years</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
              <button id="${TIME_PREFIX}showAllBtn" class="btn btn-sm btn-outline-secondary" type="button">Show All</button>
            </div>
          `;

                    L.DomEvent.disableClickPropagation(panel);
                    L.DomEvent.disableScrollPropagation(panel);

                    L.DomEvent.on(button, 'click', L.DomEvent.stop)
                        .on(button, 'click', () => {
                            const visible = panel.style.display === 'block';

                            if (!visible) {
                                closeSiblingPanels(panel);
                                panel.style.display = 'block';
                                panel.setAttribute('aria-hidden', 'false');
                                try { bringPanelIntoViewport(panel, button, 280); } catch (e) { /* non-fatal */ }
                            } else {
                                panel.style.display = 'none';
                                panel.setAttribute('aria-hidden', 'true');
                                panel.style.position = '';
                                panel.style.left = '';
                                panel.style.top = '';
                                panel.style.bottom = '';
                                panel.style.maxHeight = '';
                            }
                        });

                    // close on outside click
                    document.addEventListener('click', (ev) => {
                        if (!container.contains(ev.target) && panel.style.display === 'block') {
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';
                        }
                    });

                    this._panel = panel;
                    this._button = button;
                    return container;
                }
            });

            return new TimeControl();
        }

        // Create controls, add to map
        layersControlInstance = createLayersControl();
        map.addControl(layersControlInstance);

        const timeControlInstance = createTimeControl();
        map.addControl(timeControlInstance);

        // ---------- match control sizes & visuals to Zoom anchor ----------
        function matchControlSizes() {
            try {
                const zoomA = document.querySelector('.leaflet-control-zoom a');
                if (!zoomA) return;

                const zCS = getComputedStyle(zoomA);

                // geometry — use measured zoom anchor size (fallback to 34x34)
                const rect = zoomA.getBoundingClientRect();
                const w = Math.round(rect.width) || 34;
                const h = Math.round(rect.height) || 34;

                // visual properties for CSS variables
                const bg = zCS.backgroundColor || zCS.background || '#fff';
                const border = zCS.border || (zCS.borderWidth ? `${zCS.borderWidth} ${zCS.borderStyle} ${zCS.borderColor}` : '');
                const boxShadow = zCS.boxShadow || '0 1px 2px rgba(0,0,0,0.06)';
                const color = zCS.color || '#323232';

                // hover / active fallbacks (these are reasonable defaults)
                const hoverBg = '#f4f4f4';
                const hoverBox = '0 2px 6px rgba(0,0,0,0.08)';
                const activeBg = '#e9e9e9';

                // set CSS variables on :root so our stylesheet uses them
                const root = document.documentElement;
                root.style.setProperty('--leaflet-zoom-bg', bg);
                if (border) root.style.setProperty('--leaflet-zoom-border', border);
                root.style.setProperty('--leaflet-zoom-boxshadow', boxShadow);
                root.style.setProperty('--leaflet-zoom-color', color);
                root.style.setProperty('--leaflet-zoom-hover-bg', hoverBg);
                root.style.setProperty('--leaflet-zoom-hover-boxshadow', hoverBox);
                root.style.setProperty('--leaflet-zoom-active-bg', activeBg);

                // compute an icon font size proportional to button height
                const iconFontSize = Math.max(12, Math.round(h * 0.5));
                root.style.setProperty('--leaflet-zoom-icon-size', iconFontSize + 'px');

                // target anchors inside our controls (including home & info)
                const layerBtn = document.querySelector('.leaflet-control.layers-toggle .layers-toggle-btn');
                const timeBtn = document.querySelector('.leaflet-control.time-toggle .layers-toggle-btn');
                const baseBtn = document.querySelector('.leaflet-control.basemap-toggle .layers-toggle-btn');
                const legendBtn = document.querySelector('.leaflet-control.legend-toggle .layers-toggle-btn');
                const homeBtn = document.querySelector('.leaflet-control.home-toggle .layers-toggle-btn');
                const infoBtn = document.querySelector('.leaflet-control.info-toggle .layers-toggle-btn');

                const buttons = [layerBtn, timeBtn, baseBtn, legendBtn, homeBtn, infoBtn];

                // apply pixel geometry to our anchors
                buttons.forEach(btn => {
                    if (!btn) return;
                    btn.style.width = w + 'px';
                    btn.style.height = h + 'px';
                    btn.style.minWidth = w + 'px';
                    btn.style.minHeight = h + 'px';
                    btn.style.padding = '0';
                    btn.style.display = 'inline-flex';
                    btn.style.alignItems = 'center';
                    btn.style.justifyContent = 'center';
                    // keep visual parity with default leaflet zoom buttons
                    btn.style.background = bg;
                    if (border) btn.style.border = border;
                    btn.style.boxShadow = boxShadow;
                    btn.style.borderRadius = '6px';
                });

                // set icon size and sync color
                buttons.forEach(btn => {
                    if (!btn) return;
                    const icon = btn.querySelector('i');
                    if (!icon) return;
                    icon.style.fontSize = iconFontSize + 'px';
                    icon.style.lineHeight = '1';
                    icon.style.display = 'inline-block';
                    icon.style.color = color;
                });

                // keyboard & accessibility wiring
                buttons.forEach(btn => {
                    if (!btn) return;
                    if (btn.dataset.uiBound === 'true') return;
                    btn.dataset.uiBound = 'true';
                    btn.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            btn.click && btn.click();
                        }
                    });
                });

            } catch (err) {
                // non-fatal — leave defaults if anything goes wrong
            }
        }

        // --- copy-zoom-hover.js ---
        // Try to copy the zoom anchor :hover styles to our custom buttons.
        (function syncZoomHoverToCustomButtons() {
            const baseSelectorFragment = '.leaflet-control-zoom a';
            const targetButtonsSelector = [
                '.leaflet-control.layers-toggle .layers-toggle-btn',
                '.leaflet-control.time-toggle .layers-toggle-btn',
                '.leaflet-control.basemap-toggle .layers-toggle-btn',
                '.leaflet-control.legend-toggle .layers-toggle-btn',
                '.leaflet-control.home-toggle .layers-toggle-btn',
                '.leaflet-control.info-toggle .layers-toggle-btn'
            ];

            // find :hover style rule for zoom anchor if available
            function findHoverRuleFor(selectorFragment) {
                for (let i = 0; i < document.styleSheets.length; i++) {
                    const sheet = document.styleSheets[i];
                    let cssRules;
                    try {
                        cssRules = sheet.cssRules;
                    } catch (err) {
                        continue; // inaccessible due to CORS
                    }
                    if (!cssRules) continue;
                    for (let j = 0; j < cssRules.length; j++) {
                        const rule = cssRules[j];
                        if (rule.type !== CSSRule.STYLE_RULE) continue;
                        const sel = (rule.selectorText || '').toLowerCase();
                        if (!sel) continue;
                        if (sel.indexOf(':hover') !== -1 && sel.indexOf(selectorFragment) !== -1) {
                            return rule;
                        }
                    }
                }
                return null;
            }

            function cssStyleToObject(styleDecl) {
                const obj = {};
                for (let k = 0; k < styleDecl.length; k++) {
                    const prop = styleDecl[k];
                    obj[prop] = styleDecl.getPropertyValue(prop);
                }
                return obj;
            }

            function applyHoverStylesTo(elem, styles) {
                if (!elem || !styles) return;
                if (!elem._origInline) elem._origInline = {};
                Object.keys(styles).forEach(prop => {
                    if (typeof elem._origInline[prop] === 'undefined') {
                        elem._origInline[prop] = elem.style.getPropertyValue(prop) || '';
                    }
                    try {
                        elem.style.setProperty(prop, styles[prop], 'important');
                    } catch (e) { /* ignore invalid props */ }
                });
            }
            function restoreOriginalInline(elem) {
                if (!elem || !elem._origInline) return;
                Object.keys(elem._origInline).forEach(prop => {
                    const val = elem._origInline[prop];
                    if (val) elem.style.setProperty(prop, val);
                    else elem.style.removeProperty(prop);
                });
                elem._origInline = null;
            }

            function wireHoverHandlers(hoverStyles) {
                targetButtonsSelector.forEach(sel => {
                    const btn = document.querySelector(sel);
                    if (!btn) return;
                    if (btn.dataset.uiHoverBound === 'true') return;
                    btn.dataset.uiHoverBound = 'true';
                    btn.addEventListener('mouseenter', () => applyHoverStylesTo(btn, hoverStyles));
                    btn.addEventListener('mouseleave', () => restoreOriginalInline(btn));
                    btn.addEventListener('focus', () => applyHoverStylesTo(btn, hoverStyles));
                    btn.addEventListener('blur', () => restoreOriginalInline(btn));
                });
            }

            let hoverRule = null;
            try { hoverRule = findHoverRuleFor(baseSelectorFragment); } catch (e) { hoverRule = null; }

            if (hoverRule) {
                const hoverStyles = cssStyleToObject(hoverRule.style);
                const allowed = {};
                ['background-color', 'background', 'color', 'box-shadow', 'border', 'border-color', 'border-radius', 'border-width', 'border-style', 'outline'].forEach(k => {
                    if (hoverStyles[k]) allowed[k] = hoverStyles[k];
                });
                wireHoverHandlers(allowed);
                return;
            }

            // fallback: capture computed values from zoom anchor (or defaults)
            const zoomA = document.querySelector('.leaflet-control-zoom a');
            if (!zoomA) {
                wireHoverHandlers({
                    'background-color': '#f4f4f4',
                    'color': '#323232',
                    'box-shadow': ''
                });
                return;
            }

            function snapshotComputedHoverStyles(el) {
                const cs = getComputedStyle(el);
                const out = {};
                ['backgroundColor', 'background', 'color', 'boxShadow', 'border', 'borderRadius', 'borderWidth', 'borderStyle', 'borderColor', 'outline'].forEach(k => {
                    let cssProp = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                    const v = cs[k] || cs.getPropertyValue(cssProp);
                    if (v) out[cssProp] = v;
                });
                return out;
            }

            // capture baseline and capture again on hover of zoom anchor
            const baseline = snapshotComputedHoverStyles(zoomA);
            wireHoverHandlers(baseline);
            zoomA.addEventListener('mouseenter', () => {
                const hovered = snapshotComputedHoverStyles(zoomA);
                wireHoverHandlers(hovered);
            }, { once: false });

            // re-run detection on load in case stylesheets are added late
            window.addEventListener('load', () => {
                try {
                    const r = findHoverRuleFor(baseSelectorFragment);
                    if (r) {
                        const hoverStyles = cssStyleToObject(r.style);
                        const allowed = {};
                        ['background-color', 'background', 'color', 'box-shadow', 'border', 'border-color', 'border-radius', 'border-width', 'border-style'].forEach(k => {
                            if (hoverStyles[k]) allowed[k] = hoverStyles[k];
                        });
                        wireHoverHandlers(allowed);
                    }
                } catch (e) { /* ignore */ }
            });
        })();

        // ---------- Basemap switcher (add after other controls are created) ----------
        (function addBasemapSwitcher() {
            // --- Base layers (tile URLs & attributions) ---
            const baseLayers = {
                'Street': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap contributors'
                }),
                'Topographic': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                    maxZoom: 17,
                    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
                }),
                'Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; CARTO'
                }),
                'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; CARTO'
                }),
                'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19,
                    attribution: 'Tiles &copy; Esri'
                }),
                'Natural Earth': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; CARTO'
                }),
            };

            // --- Thumbnails (direct URLs) ---
            const thumbs = {
                'Street': 'https://www.senditur.com/multimedia/uploads/images/Noticias/España/Material/OpenStreetMap%20mapas%20gratis%20para%20dispositivos%20Garmin/openstreetmap.jpg',
                'Topographic': 'https://public-files.gumroad.com/9q61jy6qnuafs4i6u7ly231qt7th',
                'Light': 'https://upload.wikimedia.org/wikipedia/commons/a/ad/BlankMap-World_gray.svg',
                'Dark': 'https://static.vecteezy.com/system/resources/thumbnails/006/875/342/small/grey-map-of-the-world-high-detail-world-map-vector.jpg',
                'Satellite': 'https://cdn.prod.website-files.com/62eb870036357a73104e20ad/67bc41f4aaff328484411ec6_2025_02_PlanetSAT_Global_2024.jpg',
                'Natural Earth': 'https://media.maptiler.com/img/landscape_v4_world_d271d92b02.webp'
            };

            // --- Create control UI ---
            const BasemapControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                    const container = L.DomUtil.create('div', 'leaflet-control basemap-toggle');
                    container.style.background = 'transparent';
                    container.style.padding = '0';

                    const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                    button.href = '#';
                    button.title = 'Basemap';
                    button.innerHTML = '<i class="fas fa-map" aria-hidden="true"></i>';
                    button.setAttribute('aria-label', 'Basemap selector');

                    const panel = L.DomUtil.create('div', 'leaflet-control-layers-toggle-panel basemap-panel', container);
                    panel.style.display = 'none';
                    panel.style.minWidth = '240px';
                    panel.setAttribute('role', 'dialog');
                    panel.setAttribute('aria-hidden', 'true');

                    const header = L.DomUtil.create('div', 'layers-panel-header', panel);
                    header.textContent = 'Basemap';

                    const grid = L.DomUtil.create('div', 'basemap-grid', panel);
                    grid.style.display = 'grid';
                    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                    grid.style.gap = '8px';

                    Object.keys(baseLayers).forEach(name => {
                        const card = L.DomUtil.create('button', 'basemap-card', grid);
                        card.type = 'button';
                        card.setAttribute('data-basemap', name);
                        card.style.display = 'flex';
                        card.style.flexDirection = 'column';
                        card.style.alignItems = 'stretch';
                        card.style.border = '1px solid rgba(0,0,0,0.06)';
                        card.style.borderRadius = '6px';
                        card.style.padding = '6px';
                        card.style.background = 'white';
                        card.style.cursor = 'pointer';
                        card.style.outline = 'none';
                        card.style.textAlign = 'left';

                        const thumb = L.DomUtil.create('div', 'basemap-thumb', card);
                        thumb.style.backgroundImage = `url("${thumbs[name]}")`;
                        thumb.style.backgroundSize = 'cover';
                        thumb.style.backgroundPosition = 'center';
                        thumb.style.height = '56px';
                        thumb.style.borderRadius = '4px';
                        thumb.style.marginBottom = '6px';
                        thumb.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.02)';

                        const label = L.DomUtil.create('div', 'basemap-label', card);
                        label.textContent = name;
                        label.style.fontSize = '13px';
                        label.style.fontWeight = '600';
                        label.style.color = '#222';

                        // inside the forEach(...) replacing the incorrect handler
                        L.DomEvent.on(card, 'click', L.DomEvent.stop)
                            .on(card, 'click', () => {
                                // set the chosen basemap
                                setBaseLayer(name);
                                // highlight selected card, clear others
                                Array.from(grid.querySelectorAll('.basemap-card')).forEach(c => c.style.boxShadow = '');
                                card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                                // close the panel and reset inline positioning
                                panel.style.display = 'none';
                                panel.setAttribute('aria-hidden', 'true');
                                panel.style.position = '';
                                panel.style.left = '';
                                panel.style.top = '';
                                panel.style.bottom = '';
                                panel.style.maxHeight = '';
                            });
                    });

                    L.DomEvent.disableClickPropagation(panel);
                    L.DomEvent.disableScrollPropagation(panel);

                    L.DomEvent.on(button, 'click', L.DomEvent.stop)
                        .on(button, 'click', () => {
                            const vis = panel.style.display === 'block';

                            if (!vis) {
                                // Opening: close siblings then show and position
                                closeSiblingPanels(panel);
                                panel.style.display = 'block';
                                panel.setAttribute('aria-hidden', 'false');
                                try { bringPanelIntoViewport(panel, button, 360); } catch (e) { /* non-fatal */ }
                            } else {
                                // Closing: hide & reset inline styles
                                panel.style.display = 'none';
                                panel.setAttribute('aria-hidden', 'true');
                                panel.style.position = '';
                                panel.style.left = '';
                                panel.style.top = '';
                                panel.style.bottom = '';
                                panel.style.maxHeight = '';
                            }
                        });

                    // keep the existing document click (outside click) listener you already have below this
                    // close on outside click (and reset inline positioning)
                    document.addEventListener('click', function (ev) {
                        if (!container.contains(ev.target) && panel.style.display === 'block') {
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';
                        }
                    });

                    this._panel = panel;
                    this._button = button;
                    return container;
                }
            });

            const basemapControlInstance = new BasemapControl();
            map.addControl(basemapControlInstance);

            // internal state
            let currentBase = null;

            // set a base layer by name
            function setBaseLayer(name) {
                if (!baseLayers[name]) return;
                if (currentBase && map.hasLayer(currentBase)) map.removeLayer(currentBase);
                currentBase = baseLayers[name];
                currentBase.addTo(map);
            }

            // initial base (choose Street by default)
            try { setBaseLayer('Street'); } catch (e) { /* ignore */ }

            // expose for debugging
            window.portfolioBaseLayers = baseLayers;
            window.setBaseLayer = setBaseLayer;
        })();

        // ---------- Legend (toggle control with rotating chevron + smooth animation) ----------
        (function createLegendToggleControl() {
            // Create the control (positioned bottomright)
            const LegendControl = L.Control.extend({
                options: { position: 'bottomright' },
                onAdd: function () {
                    const container = L.DomUtil.create('div', 'leaflet-control legend-toggle');
                    container.style.background = 'transparent';
                    container.style.padding = '0';

                    const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                    button.href = '#';
                    button.title = 'Legend';
                    button.innerHTML = '<i class="fas fa-list" aria-hidden="true"></i>';
                    button.setAttribute('aria-label', 'Open legend');

                    const panel = L.DomUtil.create('div', 'leaflet-control-layers-toggle-panel legend-panel', container);
                    panel.style.display = 'none';
                    panel.style.minWidth = '240px';
                    panel.setAttribute('role', 'dialog');
                    panel.setAttribute('aria-hidden', 'true');

                    // header + content skeleton
                    panel.innerHTML = `
        <div class="legend-header" role="button" tabindex="0" aria-expanded="true">
          <span class="legend-title">Legend</span>
          <button id="legend-toggle" aria-label="Toggle legend" type="button" aria-expanded="true" title="Collapse legend">
            <svg class="legend-toggle-chevron" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div id="legend-content" aria-live="polite" style="padding-top:6px;"></div>
      `;

                    L.DomEvent.disableClickPropagation(panel);
                    L.DomEvent.disableScrollPropagation(panel);

                    // clicking the top-level control button toggles panel open/close
                    // Replace the existing legend button click handler with this block:
                    L.DomEvent.on(button, 'click', L.DomEvent.stop).on(button, 'click', function () {
                        const vis = panel.style.display === 'block';

                        if (!vis) {
                            // opening: close other panels, make panel visible so we can measure content
                            closeSiblingPanels(panel);
                            panel.style.display = 'block';
                            panel.setAttribute('aria-hidden', 'false');

                            // ensure legend content exists BEFORE measuring
                            try {
                                if (typeof window.updateLegend === 'function') {
                                    window.updateLegend();
                                }
                            } catch (e) { /* ignore */ }

                            // make sure inner content is expanded (so scrollHeight reflects real content)
                            const contentEl = panel.querySelector('#legend-content');
                            const toggleBtn = panel.querySelector('#legend-toggle');
                            const header = panel.querySelector('.legend-header');
                            if (contentEl) {
                                contentEl.classList.remove('collapsed');
                                // temporarily allow natural height to measure correctly
                                contentEl.style.maxHeight = 'none';
                            }
                            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
                            if (header) header.setAttribute('aria-expanded', 'true');

                            // position/fit the panel now that content exists
                            try { bringPanelIntoViewport(panel, button, 300); } catch (e) { /* non-fatal */ }

                            // set a measured maxHeight for smooth animation & proper overflow handling
                            if (contentEl) {
                                // measure after layout
                                requestAnimationFrame(() => {
                                    if (!contentEl.classList.contains('collapsed')) {
                                        contentEl.style.maxHeight = contentEl.scrollHeight + 'px';
                                        const cleanup = () => {
                                            if (!contentEl.classList.contains('collapsed')) contentEl.style.maxHeight = 'none';
                                            contentEl.removeEventListener('transitionend', cleanup);
                                        };
                                        contentEl.addEventListener('transitionend', cleanup);
                                    }
                                });
                            }

                        } else {
                            // closing: hide and reset inline positioning
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';

                            // also update ARIA states on header/toggle if present
                            const toggleBtn = panel.querySelector('#legend-toggle');
                            const header = panel.querySelector('.legend-header');
                            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
                            if (header) header.setAttribute('aria-expanded', 'false');
                        }
                    });

                    // close on outside click (and reset inline positioning)
                    document.addEventListener('click', function (ev) {
                        if (!container.contains(ev.target) && panel.style.display === 'block') {
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';
                        }
                    });

                    // ---- make legend sit above the attribution control (dynamic) ----
                    (function ensureLegendAboveAttribution() {
                        // adjust function
                        function adjust() {
                            try {
                                const attr = document.querySelector('.leaflet-control-attribution');
                                // default fallback if attribution not present yet
                                let extra = 48;
                                if (attr) {
                                    const r = attr.getBoundingClientRect();
                                    // add a small gap so there's breathing room (8px)
                                    extra = Math.ceil(r.height) + 8;
                                }
                                // apply margin-bottom so Leaflet's control column places legend above attribution
                                container.style.marginBottom = extra + 'px';
                            } catch (e) {
                                // fallback: a reasonable margin
                                container.style.marginBottom = '48px';
                            }
                        }

                        // debounce helper
                        let to = null;
                        function debouncedAdjust() {
                            clearTimeout(to);
                            to = setTimeout(adjust, 80);
                        }

                        // run once after a short delay (DOM may still be laying out)
                        setTimeout(adjust, 60);

                        // keep in sync on resize, and when map controls might change
                        window.addEventListener('resize', debouncedAdjust);
                        // also observe mutations under the map attribution area (handles toggles or dynamic attribution text)
                        try {
                            const target = document.querySelector('.leaflet-control-attribution');
                            if (target && window.MutationObserver) {
                                const mo = new MutationObserver(debouncedAdjust);
                                mo.observe(target, { childList: true, subtree: true, characterData: true });
                            }
                        } catch (e) { /* ignore */ }
                    })();

                    this._panel = panel;
                    this._button = button;
                    return container;
                }
            });

            legendControlInstance = new LegendControl();
            map.addControl(legendControlInstance);

            // --- Enhancement: animation, chevron rotation, header-click, persistence ---
            (function enhanceLegendToggle() {
                const KEY = 'leaflet_legend_collapsed_v2';
                const STYLE_ID = 'legend-toggle-enhancements';

                // inject styles if not present (already partly covered by earlier CSS, but keep safety)
                if (!document.getElementById(STYLE_ID)) {
                    const style = document.createElement('style');
                    style.id = STYLE_ID;
                    style.textContent = `
/* animated collapse for legend content using measured height */
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header { display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; padding:4px 2px; user-select:none; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header .legend-title { font-weight:600; font-size:14px; }
.leaflet-control .leaflet-control-layers-toggle-panel #legend-content { overflow:hidden; transition: max-height 220ms ease, padding 180ms ease; }
.leaflet-control .leaflet-control-layers-toggle-panel #legend-content.collapsed { max-height:0 !important; padding-top:0 !important; padding-bottom:0 !important; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-header button#legend-toggle { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; padding:0; margin:0; border-radius:6px; border:none; background:transparent; cursor:pointer; line-height:1; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-toggle-chevron { display:inline-block; transition: transform 220ms ease; transform-origin:50% 50%; }
.leaflet-control .leaflet-control-layers-toggle-panel .legend-toggle-chevron.rotated { transform: rotate(180deg); }
                    `;
                    document.head.appendChild(style);
                }

                // DOM refs
                const panel = document.querySelector('.leaflet-control.legend-toggle .leaflet-control-layers-toggle-panel');
                if (!panel) return;
                const header = panel.querySelector('.legend-header');
                const toggleBtn = panel.querySelector('#legend-toggle');
                const content = panel.querySelector('#legend-content');
                if (!header || !toggleBtn || !content) return;

                // Helper to set collapsed/expanded state with measured animation
                function setLegendCollapsed(collapsed, skipPersist) {
                    const chevron = toggleBtn.querySelector('.legend-toggle-chevron');
                    if (!content) return;

                    if (!collapsed) {
                        content.classList.remove('collapsed');
                        const measured = content.scrollHeight;
                        content.style.maxHeight = measured + 'px';
                        if (chevron) chevron.classList.remove('rotated');
                        toggleBtn.setAttribute('aria-expanded', 'true');
                        header.setAttribute('aria-expanded', 'true');

                        const onEnd = () => {
                            if (!content.classList.contains('collapsed')) content.style.maxHeight = 'none';
                            content.removeEventListener('transitionend', onEnd);
                        };
                        content.addEventListener('transitionend', onEnd);
                    } else {
                        const measured = content.scrollHeight;
                        content.style.maxHeight = measured + 'px';
                        requestAnimationFrame(() => {
                            content.classList.add('collapsed');
                            content.style.maxHeight = '0px';
                        });
                        if (chevron) chevron.classList.add('rotated');
                        toggleBtn.setAttribute('aria-expanded', 'false');
                        header.setAttribute('aria-expanded', 'false');
                    }

                    if (!skipPersist) {
                        try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
                    }
                }

                // Toggle handler
                function toggleLegend(ev) {
                    if (ev) { ev.stopPropagation(); ev.preventDefault && ev.preventDefault(); }
                    const isCollapsed = content.classList.contains('collapsed');
                    setLegendCollapsed(!isCollapsed);
                }

                // Wire events: header click toggles (button click also toggles)
                header.addEventListener('click', toggleLegend);
                toggleBtn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleLegend(ev); });
                header.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleLegend(ev); }
                });

                // Persisted state restore
                let persisted = null;
                try { persisted = localStorage.getItem(KEY); } catch (e) { persisted = null; }
                const shouldCollapse = persisted === '1';
                if (shouldCollapse) {
                    content.classList.add('collapsed');
                    content.style.maxHeight = '0px';
                    const chevron = toggleBtn.querySelector('.legend-toggle-chevron');
                    if (chevron) chevron.classList.add('rotated');
                    toggleBtn.setAttribute('aria-expanded', 'false');
                    header.setAttribute('aria-expanded', 'false');
                } else {
                    content.classList.remove('collapsed');
                    content.style.maxHeight = content.scrollHeight + 'px';
                    content.addEventListener('transitionend', function once() {
                        if (!content.classList.contains('collapsed')) content.style.maxHeight = 'none';
                        content.removeEventListener('transitionend', once);
                    });
                    const chevron = toggleBtn.querySelector('.legend-toggle-chevron');
                    if (chevron) chevron.classList.remove('rotated');
                    toggleBtn.setAttribute('aria-expanded', 'true');
                    header.setAttribute('aria-expanded', 'true');
                }

                // Patch updateLegend to keep measured height in sync when content changes dynamically
                if (typeof window.updateLegend === 'function') {
                    const originalUpdateLegend = window.updateLegend;
                    window.updateLegend = function patchedUpdateLegend() {
                        const ret = originalUpdateLegend.apply(this, arguments);
                        if (content && !content.classList.contains('collapsed')) {
                            content.style.maxHeight = content.scrollHeight + 'px';
                            const cleanup = () => {
                                if (!content.classList.contains('collapsed')) content.style.maxHeight = 'none';
                                content.removeEventListener('transitionend', cleanup);
                            };
                            content.addEventListener('transitionend', cleanup);
                        }
                        return ret;
                    };
                }
            })(); // end enhanceLegendToggle
        })();

        // ---------- initial-state + Home & Info controls ----------
        // hold an initial snapshot of the map state so Home can restore it
        let _initialMapState = null;
        // ---------- idempotent initial-state capture ----------
        function setInitialMapState() {
            try {
                // don't overwrite if already captured
                if (_initialMapState) return;

                const center = map.getCenter();
                const zoom = map.getZoom();

                // detect current base (if portfolioBaseLayers exists)
                let base = 'Street';
                try {
                    if (window.portfolioBaseLayers) {
                        for (const name of Object.keys(window.portfolioBaseLayers)) {
                            const layer = window.portfolioBaseLayers[name];
                            if (layer && map.hasLayer(layer)) { base = name; break; }
                        }
                    }
                } catch (e) { /* ignore */ }

                // overlays snapshot (shallow copy)
                const overlaysSnapshot = {};
                try { Object.keys(overlayVisibility || {}).forEach(k => overlaysSnapshot[k] = !!overlayVisibility[k]); } catch (e) { }

                // time UI snapshot
                const timeModeEl = document.getElementById(TIME_PREFIX + 'timeModeSelect');
                const timeSliderEl = document.getElementById(TIME_PREFIX + 'yearSlider');
                const timeMode = timeModeEl ? timeModeEl.value : 'all';
                const timeYear = timeSliderEl ? Number(timeSliderEl.value) : (new Date()).getFullYear();

                _initialMapState = { center: center && [center.lat, center.lng], zoom, base, overlays: overlaysSnapshot, timeMode, timeYear };
                // expose for debugging
                window._initialMapState = _initialMapState;
                console.info('Initial map state captured', _initialMapState);
            } catch (e) {
                // non-fatal
            }
        }

        // change restoreInitialMapState signature to accept options
        async function restoreInitialMapState(options = {}) {
            const restoreBase = options.restoreBase !== false;     // default true
            const restoreOverlays = options.restoreOverlays !== false; // default true
            const restoreTime = options.restoreTime !== false;     // default true
            if (!_initialMapState) return;
            try {
                const { center, zoom, base, overlays: overlaysSnapshot, timeMode, timeYear } = _initialMapState;

                // restore base only if requested
                if (restoreBase) {
                    try {
                        if (typeof window.setBaseLayer === 'function' && base) {
                            window.setBaseLayer(base);
                        }
                    } catch (e) { /* ignore */ }
                }

                // restore view
                if (Array.isArray(center) && !isNaN(Number(zoom))) {
                    try { map.setView(center, zoom); } catch (e) { /* ignore */ }
                }

                // restore overlays (only if requested)
                if (restoreOverlays && overlaysSnapshot) {
                    Object.keys(overlaysSnapshot).forEach(name => {
                        const shouldVisible = !!overlaysSnapshot[name];
                        overlayVisibility[name] = shouldVisible;
                        try {
                            if (shouldVisible && overlays[name] && !map.hasLayer(overlays[name])) overlays[name].addTo(map);
                            if (!shouldVisible && overlays[name] && map.hasLayer(overlays[name])) map.removeLayer(overlays[name]);
                        } catch (e) { /* ignore */ }
                    });
                    try { updateLegend(); updateLayersPanel(); } catch (e) { /* ignore */ }
                }

                // restore time UI (unchanged)...
                try {
                    const tm = document.getElementById(TIME_PREFIX + 'timeModeSelect');
                    const ts = document.getElementById(TIME_PREFIX + 'yearSlider');
                    if (tm) tm.value = timeMode || 'all';
                    if (ts) ts.value = timeYear || ts.max || new Date().getFullYear();
                    updateTimeBadge(tm ? tm.value : 'all', ts ? Number(ts.value) : null);

                    // IMPORTANT: only apply the time filter now if caller requested it.
                    // Home action will call restoreInitialMapState({restoreTime:false}) and then
                    // apply the time filter itself once after overlays/UI are restored to avoid
                    // competing map operations.
                    if (restoreTime) {
                        applyTimeFilter(tm ? tm.value : 'all', ts ? Number(ts.value) : null);
                    }
                } catch (e) { /* ignore */ }

                // flash home button UX (unchanged)...
                try {
                    const hb = document.querySelector('.leaflet-control.home-toggle .layers-toggle-btn');
                    if (hb) {
                        hb.style.transform = 'scale(0.96)';
                        setTimeout(() => { hb.style.transform = ''; }, 150);
                    }
                } catch (e) { /* ignore */ }

            } catch (e) { /* ignore */ }
        }

        // HOME control (returns to initial map state)
        const HomeControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function () {
                const container = L.DomUtil.create('div', 'leaflet-control home-toggle');
                container.style.background = 'transparent';
                container.style.padding = '0';

                const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                button.href = '#';
                button.title = 'Home';
                button.innerHTML = '<i class="fas fa-home" aria-hidden="true"></i>';
                button.setAttribute('aria-label', 'Return to home extent');

                // replace the existing click handler with this block
                L.DomEvent.on(button, 'click', L.DomEvent.stop)
                    .on(button, 'click', function () {
                        try {
                            // Snapshot logical overlay visibility (UI state)
                            const visSnapshot = Object.assign({}, overlayVisibility || {});
                            // defensive snapshot of overlays present if needed
                            const overlaysPresent = {};
                            try {
                                Object.keys(overlays || {}).forEach(k => {
                                    overlaysPresent[k] = !!(overlays[k] && map.hasLayer(overlays[k]));
                                });
                            } catch (e) { /* ignore */ }

                            // ensure initial state exists
                            if (!_initialMapState) {
                                console.info('Home: initial state not present — capturing now');
                                setInitialMapState();
                            }

                            // Temporarily suppress UI updates / auto-fitting while we do the restore
                            window._suppressLayerUI = true;
                            window._suppressAutoFit = true;

                            // DEFER LIST: data-heavy layers that we will restore only once at the end.
                            // Add/remove layer names here if you have other heavy layers.
                            const deferredLayers = new Set(['Significant Earthquakes', 'Air Quality (PM)']);
                            const deferredState = {}; // store desired visible state for deferred layers

                            // Perform the Home behaviour but ask it not to touch overlays or time
                            restoreInitialMapState({ restoreBase: false, restoreOverlays: false, restoreTime: false });

                            // apply snapshot for *non-deferred* layers only (idempotent)
                            function applyOverlaySnapshotLight() {
                                if (!overlays || typeof overlays !== 'object') return;

                                Object.keys(visSnapshot).forEach(name => {
                                    const shouldBeVisible = !!visSnapshot[name];
                                    // keep UI state authoritative
                                    overlayVisibility[name] = shouldBeVisible;

                                    // if this layer is deferred, just remember desired state and skip toggling now
                                    if (deferredLayers.has(name)) {
                                        deferredState[name] = shouldBeVisible;
                                        return;
                                    }

                                    const layer = overlays[name];
                                    if (!layer) return;

                                    if (shouldBeVisible) {
                                        if (!map.hasLayer(layer)) map.addLayer(layer);
                                    } else {
                                        if (map.hasLayer(layer)) map.removeLayer(layer);
                                    }
                                });
                            }

                            // finalize: restore deferred layers once, lift suppression and sync UI,
                            // then apply the time filter exactly once
                            let finished = false;
                            const retryTimers = [];

                            function finalizeRestore() {
                                if (finished) return;
                                finished = true;

                                try {
                                    // Apply deferred layers now (one final time)
                                    try {
                                        Object.keys(visSnapshot).forEach(name => {
                                            if (!deferredLayers.has(name)) return;
                                            const should = !!(deferredState[name]);
                                            overlayVisibility[name] = should;
                                            const layer = overlays && overlays[name];
                                            if (!layer) return;
                                            if (should) {
                                                if (!map.hasLayer(layer)) map.addLayer(layer);
                                            } else {
                                                if (map.hasLayer(layer)) map.removeLayer(layer);
                                            }
                                        });
                                    } catch (e) { /* ignore per-layer issues */ }

                                    // Re-enable UI updates & auto-fit
                                    window._suppressLayerUI = false;
                                    window._suppressAutoFit = false;

                                    // Sync legend / layers panel once
                                    try { updateLegend(); } catch (e) { /* ignore */ }
                                    try { updateLayersPanel(); } catch (e) { /* ignore */ }

                                    // Finally: apply the time filter once using the captured initial state
                                    try {
                                        if (_initialMapState) {
                                            const tm = _initialMapState.timeMode || 'all';
                                            const ty = (typeof _initialMapState.timeYear !== 'undefined') ? _initialMapState.timeYear : null;
                                            // applyTimeFilter will modify only the earthquakeLayer (clear/add) once
                                            applyTimeFilter(tm, ty);
                                        }
                                    } catch (e) { /* ignore */ }
                                } finally {
                                    // clear timers
                                    retryTimers.forEach(t => clearTimeout(t));
                                    retryTimers.length = 0;
                                }
                            }

                            // Primary: when the move finishes, apply the "light" snapshot then schedule finalization
                            map.once('moveend', () => {
                                applyOverlaySnapshotLight();

                                // schedule retries (light) to cover racey async code that might run shortly after
                                retryTimers.push(setTimeout(applyOverlaySnapshotLight, 120));
                                retryTimers.push(setTimeout(applyOverlaySnapshotLight, 420));

                                // schedule the finalization a bit later to allow competing async tasks to finish
                                retryTimers.push(setTimeout(finalizeRestore, 700));
                            });

                            // Fallback sequences in case moveend never fires
                            retryTimers.push(setTimeout(() => { applyOverlaySnapshotLight(); }, 200));
                            retryTimers.push(setTimeout(() => { applyOverlaySnapshotLight(); }, 500));
                            retryTimers.push(setTimeout(finalizeRestore, 1100));

                        } catch (err) {
                            // ensure suppression removed on unexpected failure
                            window._suppressLayerUI = false;
                            window._suppressAutoFit = false;
                            console.error('Home restoreInitialMapState failed:', err);
                        }
                    });

                // keyboard accessibility
                button.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); button.click(); }
                });

                return container;
            }
        });
        map.addControl(new HomeControl());


        // INFO control (panel listing map controls and quick tips)
        const InfoControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function () {
                const container = L.DomUtil.create('div', 'leaflet-control info-toggle');
                container.style.background = 'transparent';
                container.style.padding = '0';

                const button = L.DomUtil.create('a', 'layers-toggle-btn leaflet-bar', container);
                button.href = '#';
                button.title = 'Info';
                button.innerHTML = '<i class="fas fa-info" aria-hidden="true"></i>';
                button.setAttribute('aria-label', 'Map information');

                const panel = L.DomUtil.create('div', 'leaflet-control-layers-toggle-panel info-panel', container);
                panel.style.display = 'none';
                panel.style.minWidth = '240px';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-hidden', 'true');

                panel.innerHTML = `
          <div style="font-weight:700;margin-bottom:6px">Map Controls</div>
          <div style="font-size:13px;line-height:1.45;">
            <div><strong>Pan:</strong> click+drag or use arrow keys</div>
            <div><strong>Zoom:</strong> mouse wheel, pinch, or zoom buttons</div>
            <div><strong>Home:</strong> return to the starting extent</div>
            <div><strong>Layers:</strong> toggle overlays (earthquakes, air quality)</div>
            <div><strong>Time filter:</strong> filter earthquakes by year</div>
            <div style="margin-top:8px"><em>Tip:</em> click features for details in the popup.</div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button type="button" class="btn btn-sm" id="closeInfoBtn">Close</button>
          </div>
        `;

                L.DomEvent.disableClickPropagation(panel);
                L.DomEvent.disableScrollPropagation(panel);

                L.DomEvent.on(button, 'click', L.DomEvent.stop)
                    .on(button, 'click', () => {
                        const vis = panel.style.display === 'block';

                        if (!vis) {
                            // Opening: close other panels first, then show this panel and place it
                            try { closeSiblingPanels(panel); } catch (e) { /* ignore */ }

                            panel.style.display = 'block';
                            panel.setAttribute('aria-hidden', 'false');

                            try { bringPanelIntoViewport(panel, button, 340); } catch (e) { /* ignore */ }
                        } else {
                            // Closing: hide and reset inline positioning/ARIA
                            panel.style.display = 'none';
                            panel.setAttribute('aria-hidden', 'true');
                            panel.style.position = '';
                            panel.style.left = '';
                            panel.style.top = '';
                            panel.style.bottom = '';
                            panel.style.maxHeight = '';
                        }
                    });

                // close button inside panel
                panel.querySelector && panel.querySelector('#closeInfoBtn') && panel.querySelector('#closeInfoBtn').addEventListener('click', function () {
                    panel.style.display = 'none';
                    panel.setAttribute('aria-hidden', 'true');
                    panel.style.position = '';
                    panel.style.left = '';
                    panel.style.top = '';
                    panel.style.bottom = '';
                    panel.style.maxHeight = '';
                });

                // keyboard access for button
                button.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); button.click(); }
                });

                // close on outside click
                document.addEventListener('click', (ev) => {
                    if (!container.contains(ev.target) && panel.style.display === 'block') {
                        panel.style.display = 'none';
                        panel.setAttribute('aria-hidden', 'true');
                        panel.style.position = '';
                        panel.style.left = '';
                        panel.style.top = '';
                        panel.style.bottom = '';
                        panel.style.maxHeight = '';
                    }
                });

                this._panel = panel;
                this._button = button;
                return container;
            }
        });
        map.addControl(new InfoControl());

        // ---------- updateLegend (fills legend-content) ----------
        // Exposed on window so legend enhancements can patch it
        // updateLegend: build stacked, per-layer collapsible legend sections for all visible overlays
        function updateLegend(layerName) {
            if (window._suppressLayerUI) return;
            const content = document.getElementById('legend-content');
            if (!content) return;

            // ensure small legend section CSS exists (only once)
            const LS_ID = 'legend-section-styles';
            if (!document.getElementById(LS_ID)) {
                const s = document.createElement('style');
                s.id = LS_ID;
                s.textContent = `
 /* scrollable legend area */
 #legend-content { max-height: 260px; overflow-y: auto; padding-right: 6px; }
 .legend-section { margin-bottom:8px; }
 .legend-section-header { display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; user-select:none; padding:4px 0; }
 .legend-section-title { font-weight:600; font-size:13px; color:#111; }
 .legend-section-toggle { background:transparent; border:none; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; cursor:pointer; }
 .legend-section-body { overflow:hidden; transition: max-height 220ms ease, padding 180ms ease; max-height:1000px; }
 .legend-section-body.collapsed { max-height:0 !important; padding-top:0 !important; padding-bottom:0 !important; }
 .legend-section hr { border:0; border-top:1px solid rgba(0,0,0,0.06); margin:8px 0; }
`;
                document.head.appendChild(s);
            }

            // gather visible overlays
            let visible = Object.keys(overlays).filter(n => !!overlayVisibility[n] && overlays[n]);

            // If layerName explicitly requested but not visible, ignore it
            if (layerName && overlayVisibility[layerName] && !visible.includes(layerName) && overlays[layerName]) {
                visible.push(layerName);
            }

            if (!visible.length) {
                content.innerHTML = '<div>No legend available</div>';
                return;
            }

            // preferred ordering
            const preferred = ['Significant Earthquakes', 'Air Quality (PM)'];
            visible.sort((a, b) => {
                const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
                const va = ai === -1 ? 99 : ai, vb = bi === -1 ? 99 : bi;
                return va - vb;
            });

            // Build HTML with per-layer sections
            let out = '';
            visible.forEach((name, idx) => {
                const key = 'legend_section_collapsed_' + encodeURIComponent(name);
                const persisted = (function () { try { return localStorage.getItem(key); } catch (e) { return null; } })();
                const collapsed = persisted === '1';

                out += `<div class="legend-section" data-layer="${escapeHtml(name)}">`;
                out += `<div class="legend-section-header" role="button" tabindex="0" aria-expanded="${collapsed ? 'false' : 'true'}">`;
                out += `<span class="legend-section-title">${escapeHtml(name)}</span>`;
                // chevron (using simple triangle down char as fallback)
                out += `<button class="legend-section-toggle" aria-label="Toggle ${escapeHtml(name)} legend">${collapsed ? '&#9654;' : '&#9660;'}</button>`;
                out += `</div>`; // header

                out += `<div class="legend-section-body ${collapsed ? 'collapsed' : ''}">`;

                // Per-layer specialized content
                if (name === 'Significant Earthquakes' || name === 'Significant Earthquakes (USGS/Service)' || name === 'Earthquakes') {
                    const grades = [0, 3, 4, 5, 6, 7];
                    out += `<div style="font-size:13px;margin-bottom:6px">Magnitude</div>`;
                    grades.forEach((g, i) => {
                        out += `<div style="display:flex;align-items:center;margin-bottom:4px;">
 <span style="background:${colorForMagnitude(g)};width:16px;height:16px;display:inline-block;border-radius:50%;margin-right:8px;border:1px solid #333;"></span>
 ${g}${grades[i + 1] ? '&ndash;' + grades[i + 1] : '+'}
 </div>`;
                    });
                } else if (name === 'Air Quality (PM)') {
                    out += `<div style="font-size:13px;margin-bottom:6px">Air Quality (PM)</div>
 <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
 <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#fdd49e;margin-right:8px;border:1px solid #333;"></span> Low</div>
 <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#fc8d59;margin-right:8px;border:1px solid #333;"></span> Moderate</div>
 <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#e34a33;margin-right:8px;border:1px solid #333;"></span> Unhealthy (sensitive)</div>
 <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#b30000;margin-right:8px;border:1px solid #333;"></span> Unhealthy</div>
 <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#7f0000;margin-right:8px;border:1px solid #333;"></span> Very Unhealthy / Hazardous</div>
 </div>`;
                } else {
                    out += `<div style="font-size:13px;color:#555;padding-bottom:6px">No specialized legend available for this layer.</div>`;
                }

                out += `</div>`; // body
                out += `</div>`; // section
                if (idx < visible.length - 1) out += `<hr style="margin:8px 0;border:0;border-top:1px solid rgba(0,0,0,0.06)">`;
            });

            content.innerHTML = out;

            // Attach interactive handlers for each section (toggle & keyboard)
            Array.from(content.querySelectorAll('.legend-section')).forEach(section => {
                const name = section.getAttribute('data-layer');
                const header = section.querySelector('.legend-section-header');
                const body = section.querySelector('.legend-section-body');
                const btn = section.querySelector('.legend-section-toggle');
                const key = 'legend_section_collapsed_' + encodeURIComponent(name);

                function setCollapsed(state, skipPersist) {
                    if (!body) return;
                    if (state) {
                        body.classList.add('collapsed');
                        btn && (btn.innerHTML = '&#9654;');
                        header && header.setAttribute('aria-expanded', 'false');
                    } else {
                        body.classList.remove('collapsed');
                        btn && (btn.innerHTML = '&#9660;');
                        header && header.setAttribute('aria-expanded', 'true');
                    }
                    if (!skipPersist) {
                        try { localStorage.setItem(key, state ? '1' : '0'); } catch (e) { /* ignore */ }
                    }
                }

                header && header.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const isCollapsed = body.classList.contains('collapsed');
                    setCollapsed(!isCollapsed);
                });
                header && header.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        header.click();
                    }
                });
                btn && btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const isCollapsed = body.classList.contains('collapsed');
                    setCollapsed(!isCollapsed);
                });
            });
        }

        // Ensure measured-height sync wrapper is applied after updateLegend exists
        (function patchUpdateLegendForLegendPanelHeight() {
            const panel = document.querySelector('.leaflet-control.legend-toggle .leaflet-control-layers-toggle-panel');
            const content = panel && panel.querySelector('#legend-content');
            if (!content || typeof window.updateLegend !== 'function') return;

            const original = window.updateLegend;
            window.updateLegend = function patchedUpdateLegend() {
                const ret = original.apply(this, arguments);
                // If expanded, temporarily set maxHeight to the new scrollHeight so animation/overflow stays correct
                if (content && !content.classList.contains('collapsed')) {
                    content.style.maxHeight = content.scrollHeight + 'px';
                    const cleanup = () => {
                        if (!content.classList.contains('collapsed')) content.style.maxHeight = 'none';
                        content.removeEventListener('transitionend', cleanup);
                    };
                    content.addEventListener('transitionend', cleanup);
                }
                return ret;
            };
        })();

        // ---------- Scale bar ----------
        L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

        // ---------- Coordinate display ----------
        const coordControl = L.control({ position: 'bottomleft' });
        coordControl.onAdd = function () {
            this._div = L.DomUtil.create('div', 'coord-display');
            this.update();
            return this._div;
        };
        coordControl.update = function (latlng) {
            this._div.innerHTML = latlng ? `Lat: ${latlng.lat.toFixed(4)} | Lon: ${latlng.lng.toFixed(4)}` : 'Move cursor over map';
        };
        coordControl.addTo(map);
        map.on('mousemove', function (e) { coordControl.update(e.latlng); });

        // ---------- TIME UI logic (single set of handlers) ----------
        function setSliderBoundsFromData() {
            const slider = document.getElementById(TIME_PREFIX + 'yearSlider');
            const yearValueEl = document.getElementById(TIME_PREFIX + 'yearValue');
            if (!slider || !Array.isArray(earthquakeFeatures) || !earthquakeFeatures.length) return;
            const years = earthquakeFeatures.map(f => getFeatureYear(f)).filter(Boolean).map(Number);
            if (!years.length) return;
            const minY = Math.min(...years);
            const maxY = Math.max(...years);
            slider.min = Math.max(1900, minY);
            slider.max = maxY;
            slider.value = maxY;
            if (yearValueEl) yearValueEl.innerText = slider.value;
        }

        function updateTimeBadge(mode, year) {
            const badge = document.getElementById(TIME_PREFIX + 'timeStatusBadge');
            if (!badge) return;
            if (mode === 'all') badge.innerText = 'Showing: All years';
            else if (mode === 'exact') badge.innerText = `Showing: ${year}`;
            else if (mode === 'upto') badge.innerText = `Showing: Up to ${year}`;
        }

        function applyTimeFilter(mode, year) {
            if (!earthquakeLayer || !Array.isArray(earthquakeFeatures)) return;
            if (mode === 'all') {
                earthquakeLayer.clearLayers();
                earthquakeLayer.addData(earthquakeFeatures);
                updateLegend('Significant Earthquakes');
                updateLayersPanel();
                try {
                    const b = L.geoJSON( /* earthquakeFeatures or filtered */).getBounds();
                    if (b && typeof b.isValid === 'function' && b.isValid() && !window._suppressAutoFit) {
                        map.fitBounds(b, { padding: [30, 30] });
                    }
                } catch (e) { /* ignore */ }
                return;
            }
            const filtered = earthquakeFeatures.filter(f => {
                const fy = getFeatureYear(f);
                if (fy === null || isNaN(Number(fy))) return false;
                return mode === 'exact' ? Number(fy) === Number(year) : Number(fy) <= Number(year);
            });
            earthquakeLayer.clearLayers();
            earthquakeLayer.addData(filtered);
            updateLegend('Significant Earthquakes');
            if (filtered.length) {
                try {
                    const b = L.geoJSON( /* earthquakeFeatures or filtered */).getBounds();
                    if (b && typeof b.isValid === 'function' && b.isValid() && !window._suppressAutoFit) {
                        map.fitBounds(b, { padding: [30, 30] });
                    }
                } catch (e) { /* ignore */ }
            } else {
                const id = 'no-results-msg';
                let msg = document.getElementById(id);
                if (!msg) {
                    msg = document.createElement('div');
                    msg.id = id;
                    msg.className = 'alert alert-info';
                    msg.style.position = 'absolute';
                    msg.style.top = '90px';
                    msg.style.right = '12px';
                    msg.style.zIndex = 900;
                    msg.style.padding = '6px 10px';
                    msg.style.fontSize = '13px';
                    document.body.appendChild(msg);
                }
                msg.innerText = mode === 'exact' ? `No earthquakes in ${year}` : `No earthquakes up to ${year}`;
                setTimeout(() => { if (msg && msg.parentNode) msg.parentNode.removeChild(msg); }, 2000);
            }
        }

        // Wire time UI events (single listeners) - using TIME_PREFIX to scope IDs
        document.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t) return;
            if (t.id === (TIME_PREFIX + 'timeModeSelect')) {
                const mode = t.value;
                const slider = document.getElementById(TIME_PREFIX + 'yearSlider');
                const curYear = slider ? Number(slider.value) : (new Date()).getFullYear();
                if (slider) slider.disabled = (mode === 'all');
                updateTimeBadge(mode, curYear);
                applyTimeFilter(mode, curYear);
            }
        });

        document.addEventListener('input', (ev) => {
            const t = ev.target;
            if (!t) return;
            if (t.id === (TIME_PREFIX + 'yearSlider')) {
                const year = Number(t.value);
                const yearValue = document.getElementById(TIME_PREFIX + 'yearValue');
                if (yearValue) yearValue.innerText = year;
                const modeSelect = document.getElementById(TIME_PREFIX + 'timeModeSelect');
                const mode = modeSelect ? modeSelect.value : 'exact';
                if (mode === 'all') updateTimeBadge('all', year);
                else { updateTimeBadge(mode, year); applyTimeFilter(mode, year); }
            }
        });

        document.addEventListener('click', (ev) => {
            const t = ev.target;
            if (!t) return;
            if (t.id === (TIME_PREFIX + 'showAllBtn')) {
                const slider = document.getElementById(TIME_PREFIX + 'yearSlider');
                if (slider) slider.disabled = false;
                const modeSelect = document.getElementById(TIME_PREFIX + 'timeModeSelect');
                if (modeSelect) modeSelect.value = 'all';
                updateTimeBadge('all', null);
                applyTimeFilter('all');
            }
        });

        // ---------- Utility: applyYearFilterExact (compact) ----------
        function applyYearFilterExact(year) {
            if (!earthquakeLayer || !Array.isArray(earthquakeFeatures)) return;
            const filtered = earthquakeFeatures.filter(f => {
                const fy = getFeatureYear(f);
                return fy !== null && fy === year;
            });
            earthquakeLayer.clearLayers();
            earthquakeLayer.addData(filtered);
            if (filtered.length) {
                try {
                    const tempLayer = L.geoJSON(filtered);
                    const b = tempLayer.getBounds();
                    if (b && typeof b.isValid === 'function' && b.isValid() && !window._suppressAutoFit) {
                        map.fitBounds(b, { padding: [20, 20] });
                    }
                } catch (e) { /* ignore */ }
            } else {
                const msgId = 'no-results-msg';
                let msg = document.getElementById(msgId);
                if (!msg) {
                    msg = document.createElement('div');
                    msg.id = msgId;
                    msg.className = 'alert alert-info';
                    msg.style.position = 'absolute';
                    msg.style.top = '90px';
                    msg.style.right = '12px';
                    msg.style.zIndex = 800;
                    msg.style.padding = '6px 10px';
                    msg.style.fontSize = '13px';
                    document.body.appendChild(msg);
                }
                msg.innerText = `No earthquakes found for ${year}`;
                setTimeout(() => { if (msg && msg.parentNode) msg.parentNode.removeChild(msg); }, 3000);
            }
        }

        // ---------- Load ArcGIS data and create layer (ordered) ----------
        (async () => {
            try {
                const geojson = await loadArcGISGeoJSON(GEOJSON_URL);
                earthquakeFeatures = geojson.features || [];
                earthquakeLayer = L.geoJSON(earthquakeFeatures, { pointToLayer: pointToLayerFn, onEachFeature: onEachFeatureFn }).addTo(map);
                addOverlay('Significant Earthquakes', earthquakeLayer, true);
                try {
                    const bounds = earthquakeLayer.getBounds();
                    if (bounds && typeof bounds.isValid === 'function' && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
                } catch (e) { map.setView([20, 0], 2); }

                // set slider min/max from data
                const years = earthquakeFeatures.map(f => getFeatureYear(f)).filter(Boolean).map(Number);
                if (years.length) {
                    const minY = Math.min(...years);
                    const maxY = Math.max(...years);
                    const slider = document.getElementById(TIME_PREFIX + 'yearSlider');
                    const yearValueEl = document.getElementById(TIME_PREFIX + 'yearValue');
                    if (slider) {
                        slider.min = Math.max(1900, minY);
                        slider.max = maxY;

                        // ✅ ONLY set default once (first load)
                        if (!_timeUIInitialized) {
                            slider.value = maxY;
                            _timeUIInitialized = true;
                        }

                        if (yearValueEl) yearValueEl.innerHTML = slider.value;
                    }
                } else {
                    // ensure year slider uses current year max
                    const slider = document.getElementById(TIME_PREFIX + 'yearSlider');
                    if (slider) slider.max = new Date().getFullYear();
                }

                /* --- Add Air Quality layer (PM) --- */
                (async function addAirQualityPM() {
                    const baseUrl = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Air_Quality_PM25_Latest_Results/FeatureServer/1';
                    const queryUrl = baseUrl + '/query?where=1=1&outFields=*&outSR=4326&f=geojson';

                    try {
                        const geojson = await loadArcGISGeoJSON(queryUrl);
                        const aqLayer = L.geoJSON(geojson, {
                            pointToLayer: function (feature, latlng) {
                                const props = feature.properties || {};
                                const v = (typeof props.value !== 'undefined' && props.value !== null) ? Number(props.value)
                                    : (typeof props.value_2 !== 'undefined' && props.value_2 !== null) ? Number(props.value_2)
                                        : null;

                                const color = v === null ? '#999999' :
                                    v > 150 ? '#7f0000' :
                                        v > 55 ? '#b30000' :
                                            v > 35 ? '#e34a33' :
                                                v > 12 ? '#fc8d59' :
                                                    '#fdd49e';

                                return L.circleMarker(latlng, {
                                    radius: 6,
                                    fillColor: color,
                                    color: '#222',
                                    weight: 0.8,
                                    opacity: 1,
                                    fillOpacity: 0.9
                                });
                            },
                            onEachFeature: function (feature, layer) {
                                const p = feature.properties || {};
                                const val = (typeof p.value !== 'undefined' && p.value !== null) ? p.value : (p.value_2 ?? 'n/a');
                                const unit = p.unit || p.unit_2 || '';
                                const loc = escapeHtml(p.location || p.owner_name || p.city || 'Unknown');
                                const country = escapeHtml(p.country_name || p.country || '');
                                const dt = escapeHtml(p.lastUpdated || '');
                                const provider = escapeHtml(p.provider_name || '');
                                const html = `
          <div style="min-width:220px">
            <div style="font-weight:700;margin-bottom:4px">${loc}${country ? ', ' + country : ''}</div>
            <div><strong>Value:</strong> ${escapeHtml(val)} ${unit}</div>
            ${provider ? `<div><strong>Source:</strong> ${provider}</div>` : ''}
            ${dt ? `<div><strong>Last updated:</strong> ${dt}</div>` : ''}
          </div>
        `;
                                layer.bindPopup(html);
                            }
                        });

                        // Add as overlay (visible by default = true)
                        addOverlay('Air Quality (PM)', aqLayer, true);


                    } catch (err) {
                        console.warn('Could not load Air Quality layer:', err);
                    }
                })();

                // update control sizes once dataset is loaded (ensures zoom control exists & sizes stable)
                matchControlSizes();
                applyZoomBoxStyleToCustomControls();

                // copy-zoom-box-style.js — call after controls are created and after matchControlSizes()
                function applyZoomBoxStyleToCustomControls() {
                    const zoomContainer = document.querySelector('.leaflet-control-zoom');
                    if (!zoomContainer) return;

                    const cs = getComputedStyle(zoomContainer);

                    // Build a small map of properties to copy
                    const styleToCopy = {
                        background: cs.backgroundColor || cs.background,
                        boxShadow: cs.boxShadow || '',
                        borderRadius: cs.borderRadius || '',
                        border: (cs.borderWidth ? (cs.borderWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor) : ''),
                        padding: cs.padding || '2px'
                    };

                    // Target the outer control containers — we style the container so the control looks like zoom box
                    const selectors = [
                        '.leaflet-control.layers-toggle',
                        '.leaflet-control.time-toggle',
                        '.leaflet-control.basemap-toggle',
                        '.leaflet-control.legend-toggle',
                        '.leaflet-control.home-toggle',
                        '.leaflet-control.info-toggle'
                    ];

                    selectors.forEach(sel => {
                        document.querySelectorAll(sel).forEach(container => {
                            // Apply copied styles to each control container
                            if (styleToCopy.background) container.style.background = styleToCopy.background;
                            if (styleToCopy.boxShadow) container.style.boxShadow = styleToCopy.boxShadow;
                            if (styleToCopy.borderRadius) container.style.borderRadius = styleToCopy.borderRadius;
                            if (styleToCopy.border) container.style.border = styleToCopy.border;
                            if (styleToCopy.padding) container.style.padding = styleToCopy.padding;

                            // Ensure inner anchor (the clickable square) is visually aligned
                            const a = container.querySelector('.layers-toggle-btn');
                            if (a) {
                                a.style.background = 'transparent';
                                a.style.border = 'none';
                                a.style.boxShadow = 'none';
                                // the pixel geometry (width/height) should be handled by matchControlSizes(); keep anchor centered
                                a.style.display = 'inline-flex';
                                a.style.alignItems = 'center';
                                a.style.justifyContent = 'center';
                                a.style.padding = '0';
                            }
                        });
                    });
                }

                // copy zoom anchor size to custom control buttons so they match exactly
                function matchCustomButtonsToZoom() {
                    const zoomAnchor = document.querySelector('.leaflet-control-zoom a');
                    if (!zoomAnchor) return;

                    const rect = zoomAnchor.getBoundingClientRect();
                    // fallbacks if boundingRect returns fractional values
                    const w = Math.max(20, Math.round(rect.width || 34));
                    const h = Math.max(20, Math.round(rect.height || 34));

                    const selectors = [
                        '.leaflet-control.layers-toggle .layers-toggle-btn',
                        '.leaflet-control.time-toggle .layers-toggle-btn',
                        '.leaflet-control.basemap-toggle .layers-toggle-btn',
                        '.leaflet-control.legend-toggle .layers-toggle-btn',
                        '.leaflet-control.home-toggle .layers-toggle-btn',
                        '.leaflet-control.info-toggle .layers-toggle-btn'
                    ];

                    selectors.forEach(sel => {
                        const btn = document.querySelector(sel);
                        if (!btn) return;
                        btn.style.width = w + 'px';
                        btn.style.height = h + 'px';
                        btn.style.minWidth = w + 'px';
                        btn.style.minHeight = h + 'px';
                        btn.style.padding = '0';
                        btn.style.display = 'inline-flex';
                        btn.style.alignItems = 'center';
                        btn.style.justifyContent = 'center';

                        // scale icon proportionally (works for <i> font icons or <svg>)
                        const icon = btn.querySelector('i') || btn.querySelector('svg');
                        if (icon) {
                            const iconSize = Math.max(10, Math.round(h * 0.52)); // ~52% of button height
                            if (icon.tagName && icon.tagName.toLowerCase() === 'svg') {
                                icon.setAttribute('width', Math.round(iconSize * 1.2));
                                icon.setAttribute('height', Math.round(iconSize * 1.2));
                            } else {
                                icon.style.fontSize = iconSize + 'px';
                            }
                            icon.style.lineHeight = '1';
                            icon.style.display = 'inline-block';
                        }
                    });
                }

                // call it once after controls added
                matchControlSizes && typeof matchControlSizes === 'function' ? (matchControlSizes(), matchCustomButtonsToZoom()) : matchCustomButtonsToZoom();

                // copy zoom button visual outline / hover / focus styles to our custom buttons
                function copyZoomVisualStyleToCustomButtons() {
                    const zoomA = document.querySelector('.leaflet-control-zoom a');
                    if (!zoomA) return;

                    const cs = getComputedStyle(zoomA);

                    // properties to copy for normal state
                    const normalProps = [
                        'background-color', 'background-image', 'background-size', 'background-position',
                        'border', 'border-radius', 'box-shadow', 'color', 'padding', 'outline', 'outline-color',
                        'outline-style', 'outline-width'
                    ];

                    // properties to copy for hover/focus state (attempt to mirror)
                    const hoverProps = ['box-shadow', 'outline', 'outline-color', 'outline-style', 'outline-width'];

                    // build CSS text for normal state
                    const normalRules = normalProps.map(p => {
                        const v = cs.getPropertyValue(p);
                        return v ? `${p}: ${v} !important;` : '';
                    }).filter(Boolean).join(' ');

                    // build CSS text for hover/focus state: try to pick computed style while zoomA is focused/hovered if possible.
                    // We'll capture the current computed values (best-effort) and use them for :hover and :focus.
                    const hoverRules = hoverProps.map(p => {
                        const v = cs.getPropertyValue(p);
                        return v ? `${p}: ${v} !important;` : '';
                    }).filter(Boolean).join(' ');

                    // target selectors for our custom buttons
                    const selectors = [
                        '.leaflet-control.layers-toggle .layers-toggle-btn',
                        '.leaflet-control.time-toggle .layers-toggle-btn',
                        '.leaflet-control.basemap-toggle .layers-toggle-btn',
                        '.leaflet-control.legend-toggle .layers-toggle-btn',
                        '.leaflet-control.home-toggle .layers-toggle-btn',
                        '.leaflet-control.info-toggle .layers-toggle-btn'
                    ];
                    const sel = selectors.join(',');

                    const STYLE_ID = 'copy-zoom-visual-style';

                    // ensure we replace previous rule if exists
                    let styleEl = document.getElementById(STYLE_ID);
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = STYLE_ID;
                        document.head.appendChild(styleEl);
                    }

                    // produce final CSS: base + hover/focus (also keyboard focus via :focus-visible)
                    styleEl.textContent = `
/* copied from zoom anchor to keep controls visually uniform */
${sel} {
  ${normalRules}
  cursor: pointer;
  box-sizing: border-box;
}
${sel}:hover,
${sel}:focus,
${sel}:focus-visible {
  ${hoverRules}
  outline-offset: 0; /* keep same as zoom anchor where possible */
}
`;

                    // Also ensure icon color matches
                    const iconColor = cs.getPropertyValue('color') || '';
                    if (iconColor) {
                        selectors.forEach(s => {
                            const btn = document.querySelector(s);
                            if (!btn) return;
                            const icon = btn.querySelector('i') || btn.querySelector('svg');
                            if (icon) {
                                if (icon.tagName && icon.tagName.toLowerCase() === 'svg') {
                                    icon.style.color = iconColor;
                                } else {
                                    icon.style.color = iconColor;
                                }
                            }
                        });
                    }
                }

                // call it after sizing so computed styles reflect final zoom anchor geometry
                matchCustomButtonsToZoom && typeof matchCustomButtonsToZoom === 'function' && matchCustomButtonsToZoom();
                copyZoomVisualStyleToCustomButtons();

                // keep synced on resize (debounced)
                (function () {
                    let t = null;
                    window.addEventListener('resize', () => {
                        clearTimeout(t);
                        t = setTimeout(() => {
                            matchCustomButtonsToZoom && matchCustomButtonsToZoom();
                            copyZoomVisualStyleToCustomButtons();
                        }, 140);
                    });
                })();

                // keep them matched on resize
                (function () {
                    function debounce(fn, wait = 120) {
                        let t = null;
                        return function () { clearTimeout(t); t = setTimeout(fn, wait); };
                    }
                    window.addEventListener('resize', debounce(matchCustomButtonsToZoom, 150));
                })();

                //setInitialMapState();

            } catch (err) {
                console.error('Could not load earthquake layer (fetch error):', err);

                // Only show the UI warning if we truly don't have any earthquake features loaded.
                // This prevents a leftover warning if the catch ran early but data later arrived.
                const hasData = Array.isArray(earthquakeFeatures) && earthquakeFeatures.length > 0;
                if (!hasData) {
                    // remove any existing warning control we may have added previously
                    try {
                        const existing = document.querySelector('.leaflet-control .alert.alert-warning[data-qa="eq-warning"]');
                        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                    } catch (e) { /* ignore */ }

                    const warn = L.control({ position: 'topright' });
                    warn.onAdd = function () {
                        const el = L.DomUtil.create('div', 'alert alert-warning p-2');
                        el.setAttribute('data-qa', 'eq-warning');
                        el.style.zIndex = 650;
                        el.innerText = 'Earthquake data not available';
                        return el;
                    };
                    warn.addTo(map);
                } else {
                    // If we have data but a transient error happened, just log it quietly.
                    console.info('Caught error while loading earthquakes but features are present; skipping visible warning.');
                }
            }
        })();

        // ensure layers panel renders after small delay
        setTimeout(updateLayersPanel, 800);

        // expose for debugging
        window.portfolioMap = map;
        window.portfolioEarthquakeLayer = () => earthquakeLayer;

        // sync leaflet control icon hover color with navbar link :hover color (if available)
        (function syncNavbarHoverColor() {
            const hoverSelector = '#mainNav .navbar-nav li.nav-item a.nav-link:hover';

            function findHoverColor() {
                for (let i = 0; i < document.styleSheets.length; i++) {
                    let sheet = document.styleSheets[i];
                    let rules;
                    try { rules = sheet.cssRules; } catch (e) { continue; } // skip CORS sheets
                    if (!rules) continue;
                    for (let j = 0; j < rules.length; j++) {
                        const r = rules[j];
                        if (r.type === CSSRule.STYLE_RULE && r.selectorText && r.selectorText.toLowerCase().indexOf(hoverSelector.toLowerCase()) !== -1) {
                            const c = r.style.getPropertyValue('color');
                            if (c) return c.trim();
                        }
                    }
                }
                return null;
            }

            function applyColor(col) {
                if (!col) return;
                document.documentElement.style.setProperty('--nav-hover-color', col);
                // ensure CSS uses the variable
                const style = document.createElement('style');
                style.id = 'leaflet-nav-hover-sync';
                style.textContent = `
                    .leaflet-control .layers-toggle-btn:hover i,
                    .leaflet-control .layers-toggle-btn:focus i,
                    .leaflet-control.time-toggle .layers-toggle-btn:hover i,
                    .leaflet-control.time-toggle .layers-toggle-btn:focus i,
                    .leaflet-control.basemap-toggle .layers-toggle-btn:hover i,
                    .leaflet-control.basemap-toggle .layers-toggle-btn:focus i,
                    .leaflet-control.legend-toggle .layers-toggle-btn:hover i,
                    .leaflet-control.legend-toggle .layers-toggle-btn:focus i {
                        color: var(--nav-hover-color) !important;
                    }
                `;
                const old = document.getElementById('leaflet-nav-hover-sync');
                if (old) old.remove();
                document.head.appendChild(style);
            }

            const colorFromRule = findHoverColor();
            if (colorFromRule) {
                applyColor(colorFromRule);
                return;
            }

            const navLink = document.querySelector('#mainNav .navbar-nav li.nav-item a.nav-link');
            if (!navLink) return;

            const capture = () => {
                const cs = getComputedStyle(navLink);
                const fallback = cs.color || '#1abc9c';
                applyColor(fallback);
                navLink.addEventListener('mouseenter', () => {
                    const hovered = getComputedStyle(navLink);
                    applyColor(hovered.color || fallback);
                });
                navLink.removeEventListener('mouseenter', capture);
            };
            navLink.addEventListener('mouseenter', capture, { once: true });

            window.addEventListener('load', () => {
                const c = findHoverColor();
                if (c) applyColor(c);
            });
        })();

        // Debounce helper for resize - run once & on resize
        function debounce(fn, wait = 150) {
            let t = null;
            return function () {
                clearTimeout(t);
                t = setTimeout(fn, wait);
            };
        }
        matchControlSizes();
        window.addEventListener('resize', debounce(() => {
            matchControlSizes();
        }, 120));


        // function to rebuild the layers list UI
        function updateLayersPanel() {
            if (window._suppressLayerUI) return; // skip UI updates while restoring
            const panel = layersControlInstance && layersControlInstance._panel;
            const list = layersControlInstance && layersControlInstance._list;
            if (!panel || !list) return;
            list.innerHTML = '';

            // Ensure style for layer rows exists (only once)
            const LAYER_STYLE_ID = 'map-layer-eye-styles';
            if (!document.getElementById(LAYER_STYLE_ID)) {
                const style = document.createElement('style');
                style.id = LAYER_STYLE_ID;
                style.textContent = `
      .layer-row { display:flex; align-items:center; gap:8px; padding:6px 4px; }
      .layer-row + .layer-row { border-top: 1px solid rgba(0,0,0,0.04); }
      .layer-eye-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        width: var(--leaflet-zoom-size, 34px);
        height: var(--leaflet-zoom-size, 34px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border-radius:6px;
        box-sizing:border-box;
        padding:0;
      }
      .layer-eye-btn i, .layer-eye-btn svg { font-size: 16px; line-height:1; display:inline-block; }
      .layer-eye-btn:hover,
      .layer-eye-btn:focus {
        background: var(--leaflet-zoom-hover-bg, #f4f4f4);
        box-shadow: var(--leaflet-zoom-hover-boxshadow, 0 2px 6px rgba(0,0,0,0.08));
        outline: none;
      }
      .layer-name { flex:1; font-size:13px; cursor:pointer; color:inherit; user-select:none; }
    `;
                document.head.appendChild(style);
            }

            Object.keys(overlays).forEach(name => {
                const li = document.createElement('li');
                li.className = 'layer-row';

                // Eye toggle button
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'layer-eye-btn';
                btn.setAttribute('data-layer-name', name);

                const visibleNow = !!overlayVisibility[name];
                btn.setAttribute('aria-pressed', visibleNow ? 'true' : 'false');
                btn.setAttribute('aria-label', visibleNow ? `Hide ${name}` : `Show ${name}`);

                // Icon (FontAwesome). If you don't have FA, this will still render an empty <i>.
                const icon = document.createElement('i');
                icon.className = visibleNow ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
                btn.appendChild(icon);

                // Toggle handler
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    const nm = this.dataset.layerName;
                    const now = !overlayVisibility[nm];
                    overlayVisibility[nm] = !!now;

                    if (now) {
                        // show layer
                        try { if (overlays[nm] && !map.hasLayer(overlays[nm])) overlays[nm].addTo(map); } catch (e) { /* ignore */ }
                        this.setAttribute('aria-label', `Hide ${nm}`);
                        this.setAttribute('aria-pressed', 'true');
                        icon.className = 'fa-regular fa-eye';
                    } else {
                        // hide layer
                        try { if (overlays[nm] && map.hasLayer(overlays[nm])) map.removeLayer(overlays[nm]); } catch (e) { /* ignore */ }
                        this.setAttribute('aria-label', `Show ${nm}`);
                        this.setAttribute('aria-pressed', 'false');
                        icon.className = 'fa-regular fa-eye-slash';
                    }

                    // update legend / panels
                    try { updateLegend(); } catch (e) { /* ignore */ }
                    try { updateLayersPanel(); } catch (e) { /* ignore */ } // refresh list if you want visuals rebuilt
                });

                // Layer label (clicking label toggles visibility too)
                const label = document.createElement('div');
                label.className = 'layer-name';
                label.textContent = name;
                label.setAttribute('role', 'button');
                label.setAttribute('tabindex', '0');
                label.addEventListener('click', () => btn.click());
                label.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        btn.click();
                    }
                });

                li.appendChild(btn);
                li.appendChild(label);
                list.appendChild(li);
            });
        }

        window.registerOverlay = addOverlay;
        async function registerArcGISLayer(name, featureServerUrl, visible = false) {
            try {
                const querySuffix = '/query?where=1=1&outFields=*&outSR=4326&f=geojson';
                const data = await loadArcGISGeoJSON(featureServerUrl + querySuffix);
                const layer = L.geoJSON(data, { pointToLayer: pointToLayerFn, onEachFeature: onEachFeatureFn });
                addOverlay(name, layer, visible);
            } catch (err) {
                console.warn('registerArcGISLayer error:', err);
            }
        }
        window.registerArcGISLayer = registerArcGISLayer;

    }); // DOMContentLoaded end
})(); // IIFE end
