const map = new maplibregl.Map({
    container: 'map',
    // Grayscale map styles - uncomment the one you prefer:

    // Option 1: Light grayscale (recommended for colored points)
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',

    // Option 2: Dark style (good contrast)
    // style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',

    // Option 3: Voyager (muted colors, good middle ground)
    // style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',

    // Option 4: Original colored style
    // style: 'https://api.maptiler.com/maps/streets/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL',

    center: [0, 0], // Will adjust to data extent
    zoom: 2
});

map.on('load', async () => {
    try {
        // Fetch country codes lookup
        const countryCodesResponse = await fetch('./country_codes.json?v=' + Date.now());
        if (!countryCodesResponse.ok) {
            throw new Error(`Failed to load country codes: ${countryCodesResponse.status}`);
        }
        const countryNames = await countryCodesResponse.json();

        // Fetch the local GeoJSON file with cache-busting
        const response = await fetch('./points.geojson?v=' + Date.now());
        if (!response.ok) {
            throw new Error(`Failed to load GeoJSON: ${response.status} ${response.statusText}`);
        }
        const geojsonData = await response.json();

        // Calculate bounds from all points to center the map
        let initialBounds = null;
        if (geojsonData.features && geojsonData.features.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            geojsonData.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    bounds.extend(feature.geometry.coordinates);
                }
            });
            initialBounds = bounds;
            map.fitBounds(bounds, { padding: 50 });
        }

        // Add source with clustering enabled - modify clustering parameters here
        map.addSource('points', {
            type: 'geojson',
            data: geojsonData,
            cluster: true,
            clusterMaxZoom: 14,     // Max zoom to cluster points on
            clusterRadius: 40,      // Reduced radius for smaller clusters
            clusterProperties: {     // Optional: store additional properties in clusters
                sum_points: ['+', ['get', 'point_count']]
            }
        });

        // Add cluster circles layer
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'points',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    '#51bbd6',  // Blue for smaller clusters
                    10,
                    '#f1f075',  // Yellow for medium clusters
                    30,
                    '#f28cb1'   // Pink for large clusters
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    20,  // 20px radius for count < 10
                    10,
                    30,  // 30px radius for count >= 10 and < 30
                    30,
                    40   // 40px radius for count >= 30
                ]
            }
        });

        // Add cluster count labels
        map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'points',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-size': 12
            }
        });

        // Add unclustered point circles
        map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'points',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': '#11b4da',
                'circle-radius': 9,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });

        // IMPROVED: Handle cluster click to expand clusters more aggressively
        map.on('click', 'clusters', async (e) => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: ['clusters']
            });
            const clusterId = features[0].properties.cluster_id;
            const pointCount = features[0].properties.point_count;

            // Get current zoom level
            const currentZoom = map.getZoom();

            try {
                // Get children of this cluster
                const children = await map.getSource('points')
                    .getClusterChildren(clusterId);

                // If there are many points, or if we're zoomed in far enough,
                // skip directly to leaves (individual points)
                if (pointCount > 30 || currentZoom > 10) {
                    const leaves = await map.getSource('points')
                        .getClusterLeaves(clusterId, Math.min(pointCount, 50), 0);

                    // Create a bounds object to fit all the points
                    const bounds = new maplibregl.LngLatBounds();
                    leaves.forEach(leaf => {
                        bounds.extend(leaf.geometry.coordinates);
                    });

                    // Fit the map to show all these points
                    map.fitBounds(bounds, {
                        padding: 50,
                        maxZoom: 15
                    });
                }
                // If it's a smaller cluster, just get the expansion zoom and go one level deeper
                else if (children.length <= 4) {
                    // Get expansion zoom plus 1 to break them apart faster
                    const zoom = await map.getSource('points')
                        .getClusterExpansionZoom(clusterId);

                    map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: Math.min(zoom + 1.5, 16)  // Zoom a bit more aggressively, with a max limit
                    });
                }
                // For medium clusters, expand and show their bounds
                else {
                    const bounds = new maplibregl.LngLatBounds();
                    children.forEach(child => {
                        bounds.extend(child.geometry.coordinates);
                    });

                    map.fitBounds(bounds, {
                        padding: 50,
                        maxZoom: 15
                    });
                }
            } catch (err) {
                console.error("Error expanding cluster:", err);

                // Fallback to the default expansion method
                const zoom = await map.getSource('points')
                    .getClusterExpansionZoom(clusterId);

                map.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom + 0.5  // Add a bit more zoom to break apart faster
                });
            }
        });

        // Show popup for individual points on hover
        let popup = null;
        let isPinned = false;

        function createPopupContent(props) {
            let popupContent = '';

            if (props.name) {
                popupContent += `<h3>${props.name}</h3>`;
            }

            if (props.loc) {
                popupContent += `<div>${props.loc}</div>`;
            }

            if (props.date) {
                popupContent += `<div>Date: ${props.date}</div>`;
            }

            if (props.local_url) {
                popupContent += `<img src="${props.local_url}" class="popup-image" alt="${props.name || 'Image'}">`;
            }

            return popupContent;
        }

        function showPopup(coordinates, props, pinned = false) {
            // Remove existing popup if any
            if (popup) {
                popup.remove();
            }

            const popupContent = createPopupContent(props);

            // Create and display new popup
            popup = new maplibregl.Popup({
                closeButton: pinned,
                closeOnClick: false
            })
                .setLngLat(coordinates)
                .setHTML(popupContent)
                .addTo(map);

            isPinned = pinned;

            // If pinned, set up close event
            if (pinned) {
                popup.on('close', () => {
                    popup = null;
                    isPinned = false;
                });
            }
        }

        map.on('mouseenter', 'unclustered-point', (e) => {
            // Don't show hover popup if there's a pinned popup
            if (isPinned) return;

            const coordinates = e.features[0].geometry.coordinates.slice();
            const props = e.features[0].properties;

            // Ensure that if the map is zoomed out such that
            // multiple copies of the feature are visible, the
            // popup appears over the copy being pointed to.
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }

            showPopup(coordinates, props, false);
        });

        // Close popup when mouse leaves the point (only if not pinned)
        map.on('mouseleave', 'unclustered-point', () => {
            if (popup && !isPinned) {
                popup.remove();
                popup = null;
            }
        });

        // Click to pin the popup
        map.on('click', 'unclustered-point', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const props = e.features[0].properties;

            // Ensure that if the map is zoomed out such that
            // multiple copies of the feature are visible, the
            // popup appears over the copy being pointed to.
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }

            showPopup(coordinates, props, true);
        });

        // Change cursor when hovering over clusters and points
        map.on('mouseenter', 'clusters', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'clusters', () => {
            map.getCanvas().style.cursor = '';
        });

        map.on('mouseenter', 'unclustered-point', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'unclustered-point', () => {
            map.getCanvas().style.cursor = '';
        });

        // Add zoom controls to the map (no compass).
        map.addControl(new maplibregl.NavigationControl({
            visualizePitch: false,
            visualizeRoll: false,
            showZoom: true,
            showCompass: false
        }));

        // Add custom home button control
        class HomeControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
                this._container.innerHTML = `
                    <button type="button" title="Reset to home view" aria-label="Reset to home view">
                        <svg width="29" height="29" viewBox="0 0 29 29" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14.5 3L3 11.5h3v11h6v-6h5v6h6v-11h3L14.5 3z" fill="currentColor"/>
                        </svg>
                    </button>
                `;
                this._container.addEventListener('click', () => {
                    if (initialBounds) {
                        map.fitBounds(initialBounds, { padding: 50 });
                    }
                });
                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }

        map.addControl(new HomeControl(), 'top-right');

        // Set up time slider
        const allFeatures = geojsonData.features;

        // Initialize country filter (needed by time slider)
        const selectedCountries = new Set();
        allFeatures.forEach(feature => {
            const country = feature.properties.iso_3166 || 'XX';
            selectedCountries.add(country);
        });

        const dates = allFeatures
            .map(f => f.properties.dtstr)
            .filter(d => d) // Remove undefined dates
            .map(d => new Date(d))
            .sort((a, b) => a - b);

        if (dates.length > 0) {
            const minDate = dates[0];
            const maxDate = dates[dates.length - 1];

            const sliderStart = document.getElementById('slider-start');
            const sliderEnd = document.getElementById('slider-end');
            const timeDisplay = document.getElementById('time-display');
            const startDateEl = document.getElementById('start-date');
            const endDateEl = document.getElementById('end-date');
            const sliderRange = document.getElementById('slider-range');

            // Display full date range
            startDateEl.textContent = minDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            endDateEl.textContent = maxDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

            function formatDate(date) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }

            function getDateFromPercentage(percentage) {
                const timeRange = maxDate.getTime() - minDate.getTime();
                const dateTime = minDate.getTime() + (timeRange * percentage / 100);
                return new Date(dateTime);
            }

            function updateSliderVisual() {
                const startPercent = parseInt(sliderStart.value);
                const endPercent = parseInt(sliderEnd.value);

                sliderRange.style.left = startPercent + '%';
                sliderRange.style.width = (endPercent - startPercent) + '%';
            }

            function updateMapByDateRange() {
                let startPercent = parseInt(sliderStart.value);
                let endPercent = parseInt(sliderEnd.value);

                // Ensure start is always before or equal to end
                if (startPercent > endPercent) {
                    [startPercent, endPercent] = [endPercent, startPercent];
                    sliderStart.value = startPercent;
                    sliderEnd.value = endPercent;
                }

                updateSliderVisual();

                if (startPercent === 0 && endPercent === 100) {
                    // Filter only by country
                    const filteredFeatures = allFeatures.filter(f => {
                        const country = f.properties.iso_3166 || 'XX';
                        return selectedCountries.has(country);
                    });

                    timeDisplay.textContent = 'All dates';
                    map.getSource('points').setData({
                        type: 'FeatureCollection',
                        features: filteredFeatures
                    });
                } else {
                    // Calculate start and end dates
                    const startDate = getDateFromPercentage(startPercent);
                    const endDate = getDateFromPercentage(endPercent);

                    // Filter features by both date range AND country
                    const filteredFeatures = allFeatures.filter(f => {
                        const country = f.properties.iso_3166 || 'XX';
                        if (!selectedCountries.has(country)) return false;

                        if (!f.properties.dtstr) return false;
                        const featureDate = new Date(f.properties.dtstr);
                        return featureDate >= startDate && featureDate <= endDate;
                    });

                    timeDisplay.textContent = `${formatDate(startDate)} - ${formatDate(endDate)} (${filteredFeatures.length} points)`;

                    map.getSource('points').setData({
                        type: 'FeatureCollection',
                        features: filteredFeatures
                    });
                }
            }

            // Drag the range bar to slide the time window
            let isDraggingRange = false;
            let dragStartX = 0;
            let dragStartPercent = 0;
            let dragEndPercent = 0;
            let playPauseBtnRef = null; // Will be set later
            let isPlayingRef = { value: false }; // Will be updated by animation code
            let stopAnimationRef = null; // Will be set later

            sliderRange.addEventListener('mousedown', (e) => {
                isDraggingRange = true;
                dragStartX = e.clientX;
                dragStartPercent = parseInt(sliderStart.value);
                dragEndPercent = parseInt(sliderEnd.value);

                // Pause animation if playing
                if (isPlayingRef.value && stopAnimationRef) {
                    isPlayingRef.value = false;
                    playPauseBtnRef.textContent = '▶';
                    playPauseBtnRef.title = 'Play time animation';
                    stopAnimationRef();
                }

                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDraggingRange) return;

                const sliderTrack = document.getElementById('slider-track');
                const trackWidth = sliderTrack.offsetWidth;
                const deltaX = e.clientX - dragStartX;
                const deltaPercent = (deltaX / trackWidth) * 100;

                let newStartPercent = Math.round(dragStartPercent + deltaPercent);
                let newEndPercent = Math.round(dragEndPercent + deltaPercent);

                // Keep within bounds
                if (newStartPercent < 0) {
                    newEndPercent -= newStartPercent;
                    newStartPercent = 0;
                }
                if (newEndPercent > 100) {
                    newStartPercent -= (newEndPercent - 100);
                    newEndPercent = 100;
                }

                sliderStart.value = newStartPercent;
                sliderEnd.value = newEndPercent;
                updateMapByDateRange();
            });

            document.addEventListener('mouseup', () => {
                if (isDraggingRange) {
                    isDraggingRange = false;
                }
            });

            // Play/Pause animation
            const playPauseBtn = document.getElementById('play-pause-btn');
            playPauseBtnRef = playPauseBtn; // Set reference for drag handler
            let isPlaying = false;
            let animationInterval = null;
            const ANIMATION_SPEED = 200; // milliseconds per step
            const STEP_SIZE = 1; // percentage to advance per step

            function startAnimation() {
                if (animationInterval) return; // Already playing

                animationInterval = setInterval(() => {
                    let startPercent = parseInt(sliderStart.value);
                    let endPercent = parseInt(sliderEnd.value);
                    const windowSize = endPercent - startPercent;

                    // Advance the window
                    startPercent += STEP_SIZE;
                    endPercent += STEP_SIZE;

                    // Loop back to beginning if we've reached the end
                    if (endPercent > 100) {
                        startPercent = 0;
                        endPercent = windowSize;
                    }

                    sliderStart.value = startPercent;
                    sliderEnd.value = endPercent;
                    updateMapByDateRange();
                }, ANIMATION_SPEED);
            }

            function stopAnimation() {
                if (animationInterval) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                }
            }

            // Set references for drag handler
            stopAnimationRef = stopAnimation;

            playPauseBtn.addEventListener('click', () => {
                isPlaying = !isPlaying;
                isPlayingRef.value = isPlaying; // Update reference
                if (isPlaying) {
                    playPauseBtn.textContent = '⏸';
                    playPauseBtn.title = 'Pause time animation';
                    startAnimation();
                } else {
                    playPauseBtn.textContent = '▶';
                    playPauseBtn.title = 'Play time animation';
                    stopAnimation();
                }
            });

            // Pause animation when user manually adjusts sliders
            const originalSliderStartListener = () => {
                if (isPlaying) {
                    isPlaying = false;
                    isPlayingRef.value = false; // Update reference
                    playPauseBtn.textContent = '▶';
                    playPauseBtn.title = 'Play time animation';
                    stopAnimation();
                }
                updateMapByDateRange();
            };

            const originalSliderEndListener = () => {
                if (isPlaying) {
                    isPlaying = false;
                    isPlayingRef.value = false; // Update reference
                    playPauseBtn.textContent = '▶';
                    playPauseBtn.title = 'Play time animation';
                    stopAnimation();
                }
                updateMapByDateRange();
            };

            // Set up slider event listeners with pause functionality
            sliderStart.addEventListener('input', originalSliderStartListener);
            sliderEnd.addEventListener('input', originalSliderEndListener);

            // Reset time button
            const resetTimeBtn = document.getElementById('reset-time-btn');
            resetTimeBtn.addEventListener('click', () => {
                // Stop animation if playing
                if (isPlaying) {
                    isPlaying = false;
                    isPlayingRef.value = false;
                    playPauseBtn.textContent = '▶';
                    playPauseBtn.title = 'Play time animation';
                    stopAnimation();
                }

                // Reset sliders to full range
                sliderStart.value = 0;
                sliderEnd.value = 100;

                // Update the map
                updateMapByDateRange();
            });

            // Initialize with all dates
            updateMapByDateRange();
        }

        // Detect mobile devices
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        // Toggle time slider drawer
        const toggleBtn = document.getElementById('toggle-slider-btn');
        const sliderTab = document.getElementById('slider-tab');
        const sliderContainer = document.getElementById('time-slider-container');
        let isCollapsed = isMobile; // Start collapsed on mobile

        // Initialize drawer state
        if (isCollapsed) {
            sliderContainer.classList.add('collapsed');
            toggleBtn.textContent = '▲';
            toggleBtn.title = 'Show time slider';
        }

        // Make the entire tab clickable
        sliderTab.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                sliderContainer.classList.add('collapsed');
                toggleBtn.textContent = '▲';
                toggleBtn.title = 'Show time slider';
            } else {
                sliderContainer.classList.remove('collapsed');
                toggleBtn.textContent = '▼';
                toggleBtn.title = 'Hide time slider';
            }
        });

        // Country Filter functionality
        const filterTab = document.getElementById('filter-tab');
        const filterContainer = document.getElementById('country-filter-container');
        const toggleFilterBtn = document.getElementById('toggle-filter-btn');
        let isFilterCollapsed = isMobile; // Start collapsed on mobile

        // Initialize filter drawer state
        if (isFilterCollapsed) {
            filterContainer.classList.add('collapsed');
            toggleFilterBtn.textContent = '▶';
            toggleFilterBtn.title = 'Show location filter';
        }

        // Extract unique countries with counts
        const countryMap = {};

        allFeatures.forEach(feature => {
            const country = feature.properties.iso_3166 || 'XX';
            countryMap[country] = (countryMap[country] || 0) + 1;
        });

        // Populate country checkboxes
        const checkboxContainer = document.getElementById('country-checkboxes');

        Object.keys(countryMap).sort().forEach(countryCode => {
            const count = countryMap[countryCode];
            const countryName = countryNames[countryCode] || countryCode;

            const div = document.createElement('div');
            div.className = 'country-checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `country-${countryCode}`;
            checkbox.value = countryCode;
            checkbox.checked = true;

            const label = document.createElement('label');
            label.htmlFor = `country-${countryCode}`;
            label.innerHTML = `${countryName} <span class="country-count">(${count})</span>`;

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedCountries.add(countryCode);
                } else {
                    selectedCountries.delete(countryCode);
                }
                updateMapByDateRange();
            });

            div.appendChild(checkbox);
            div.appendChild(label);
            checkboxContainer.appendChild(div);
        });

        // Select/Deselect all buttons
        document.getElementById('select-all-btn').addEventListener('click', () => {
            document.querySelectorAll('#country-checkboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
                selectedCountries.add(cb.value);
            });
            updateMapByDateRange();
        });

        document.getElementById('deselect-all-btn').addEventListener('click', () => {
            document.querySelectorAll('#country-checkboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
                selectedCountries.delete(cb.value);
            });
            updateMapByDateRange();
        });

        // Toggle filter drawer - clicking the entire tab
        filterTab.addEventListener('click', () => {
            isFilterCollapsed = !isFilterCollapsed;
            if (isFilterCollapsed) {
                filterContainer.classList.add('collapsed');
                toggleFilterBtn.textContent = '▶';
                toggleFilterBtn.title = 'Show location filter';
            } else {
                filterContainer.classList.remove('collapsed');
                toggleFilterBtn.textContent = '◀';
                toggleFilterBtn.title = 'Hide location filter';
            }
        });

        // Mobile optimization: Prevent double-tap zoom on buttons and controls
        if (isMobile) {
            const noZoomElements = [
                playPauseBtn,
                resetTimeBtn,
                sliderTab,
                filterTab,
                toggleFilterBtn,
                ...document.querySelectorAll('.filter-control-btn')
            ];

            noZoomElements.forEach(element => {
                if (element) {
                    element.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        element.click();
                    }, { passive: false });
                }
            });
        }

    } catch (error) {
        console.error("Error loading GeoJSON:", error);
        alert("Failed to load map data. See console for details.");
    }
});
