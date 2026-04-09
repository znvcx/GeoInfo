document.addEventListener('DOMContentLoaded', () => {
    // Canton Vaud roughly centered
    const INITIAL_COORDS = [46.5197, 6.6323]; // Lausanne
    const INITIAL_ZOOM = 13;

    // Bounds for Switzerland approx, to restrict the map 
    // bounding box: 45.8, 5.9, 47.8, 10.5
    // Extended bounds to allow centering the Swiss borders even when zoomed out (acting as an offset)
    const SWISS_BOUNDS = [
        [43.0, 4.0],
        [50.0, 12.0]
    ];

    const map = L.map('map', {
        zoomControl: false,
        maxBounds: SWISS_BOUNDS,
        maxBoundsViscosity: 0.7,
        minZoom: 9
    }).setView(INITIAL_COORDS, INITIAL_ZOOM);

    // Map Styles
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const mapStyles = {
        plan: isDarkMode ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    };

    let currentMapStyle = 'plan';
    const tileLayer = L.tileLayer(mapStyles.plan, {
        attribution: '&copy; Carto & OSM | Esri',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    const btnMapStyle = document.getElementById('btn-map-style');
    if (btnMapStyle) {
        btnMapStyle.addEventListener('click', () => {
            if (currentMapStyle === 'plan') {
                currentMapStyle = 'satellite';
                tileLayer.setUrl(mapStyles.satellite);
                btnMapStyle.querySelector('span').textContent = 'map';
                btnMapStyle.classList.add('primary');
                btnMapStyle.classList.remove('secondary');
            } else {
                currentMapStyle = 'plan';
                tileLayer.setUrl(mapStyles.plan);
                btnMapStyle.querySelector('span').textContent = 'satellite_alt';
                btnMapStyle.classList.remove('primary');
                btnMapStyle.classList.add('secondary');
            }
        });
    }

    // UI Elements
    const crosshair = document.querySelector('.map-crosshair');
    const bottomSheet = document.getElementById('bottom-sheet');
    const fabContainer = document.querySelector('.fab-container');
    const infoCommune = document.getElementById('info-commune');
    const infoDistrict = document.getElementById('info-district');
    const infoCanton = document.getElementById('info-canton');
    const infoCoords = document.getElementById('info-coords');
    const cardJustice = document.getElementById('card-justice');
    const infoJustice = document.getElementById('info-justice');
    const cardPolice = document.getElementById('card-police');
    const infoPolice = document.getElementById('info-police');
    const cardPatrouille = document.getElementById('card-patrouille');
    const infoPatrouille = document.getElementById('info-patrouille');
    const infoAddress = document.getElementById('info-address');
    const infoLieudit = document.getElementById('info-lieudit');
    const cardCommune = document.getElementById('card-commune');
    const cardDistrict = document.getElementById('card-district');
    const cardCanton = document.getElementById('card-canton');
    const cardCoords = document.getElementById('card-coords');
    const cardAddress = document.getElementById('card-address');
    const cardLieudit = document.getElementById('card-lieudit');
    const locationTitle = document.getElementById('location-title');
    const locationSubtitle = document.getElementById('location-subtitle');
    const searchContainer = document.querySelector('.search-container');
    const btnToggleData = document.getElementById('btn-toggle-data');

    let isFetching = false;
    let dataEnabled = true;
    let sheetState = 'expanded';
    let userMarker = null;
    let searchMarker = null;
    let activeBoundaryLayer = null;

    // Nominatim headers per usage policy (User-Agent required)
    const NOMINATIM_HEADERS = {
        'Accept-Language': 'fr-CH, fr',
        'User-Agent': 'GeoInfo/1.0 (https://github.com/znvcx/GeoInfo)'
    };

    const urlParams = new URLSearchParams(window.location.search);
    const IS_MAX_INFO = urlParams.get('info') === 'max';
    
    // Show hidden elements if debug/max mode
    if (IS_MAX_INFO) {
        const item = document.getElementById('layer-item-patrouille');
        if (item) item.style.display = 'flex';
    }

    // Simple in-memory cache for reverse geocode results
    const geocodeCache = new Map();

    // Functions
    function wgs84ToLV95(lat, lng) {
        // Precise conversion using Swisstopo formula
        const phi_aux = (lat * 3600 - 169028.66) / 10000;
        const lambda_aux = (lng * 3600 - 26782.5) / 10000;

        const e = 2600072.37
            + 211455.93 * lambda_aux
            - 10938.51 * lambda_aux * phi_aux
            - 0.36 * lambda_aux * Math.pow(phi_aux, 2)
            - 44.54 * Math.pow(lambda_aux, 3);

        const n = 1200147.07
            + 308807.95 * phi_aux
            + 3745.25 * Math.pow(lambda_aux, 2)
            + 76.63 * Math.pow(phi_aux, 2)
            - 194.56 * Math.pow(lambda_aux, 2) * phi_aux
            + 119.79 * Math.pow(phi_aux, 3);

        return { e: e, n: n };
    }

    async function reverseGeocode(lat, lng) {
        if (isFetching) return;
        isFetching = true;

        const lv95 = wgs84ToLV95(lat, lng);
        const wgsText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const chText = `${Math.round(lv95.e)}, ${Math.round(lv95.n)}`;

        // Skeletons feedback
        const textElements = [infoCommune, infoDistrict, infoCanton, infoAddress, infoLieudit];
        if (infoJustice) textElements.push(infoJustice);
        if (infoPolice) textElements.push(infoPolice);
        if (infoPatrouille) textElements.push(infoPatrouille);

        textElements.forEach(el => {
            el.classList.add('skeleton');
            if (el.id !== 'info-address') el.innerHTML = '&nbsp;';
            else el.innerHTML = '&nbsp;<br>&nbsp;';
        });

        locationTitle.textContent = "Recherche...";
        locationSubtitle.textContent = "Chargement des données...";

        // Coordonnées: CH (LV95) en grand, WGS en petit
        infoCoords.innerHTML = `${chText}<br><span style="font-size: 11px; color: var(--text-muted); font-weight: normal; margin-top: 2px; display: block;">GPS (WGS84) : ${wgsText}</span>`;

        if (cardJustice) cardJustice.style.display = 'none';
        if (cardPolice) cardPolice.style.display = 'none';
        if (cardPatrouille) cardPatrouille.style.display = 'none';

        if (dataEnabled) {
            bottomSheet.classList.remove('hidden');
            fabContainer.classList.remove('sheet-hidden');
        }
        if (searchContainer) searchContainer.classList.remove('hidden');

        try {
            // Nominatim API (Zoom 18 for street level + extratags for RC numbers)
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&format=jsonv2&addressdetails=1&countrycodes=ch&zoom=18&extratags=1`;

            // Check cache first (rounded to ~11m grid)
            const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
            let data;
            if (geocodeCache.has(cacheKey)) {
                data = geocodeCache.get(cacheKey);
            } else {
                const response = await fetch(url, { headers: NOMINATIM_HEADERS });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                data = await response.json();
                geocodeCache.set(cacheKey, data);
                // Limit cache size to 50 entries
                if (geocodeCache.size > 50) {
                    geocodeCache.delete(geocodeCache.keys().next().value);
                }
            }

            if (data && !data.error && data.address) {
                const addr = data.address;

                const commune = addr.village || addr.town || addr.city || addr.municipality || 'Inconnue';
                const district = addr.county || addr.district || 'Inconnu';
                const canton = addr.state || 'Inconnu';

                let displayName = data.name || commune;
                if (!data.name && addr.road) {
                    displayName = addr.road;
                }

                // Format display limits
                if (displayName.length > 25) {
                    displayName = displayName.substring(0, 25) + '...';
                }

                locationTitle.textContent = displayName;
                locationSubtitle.textContent = canton === 'Vaud' ? 'Canton de Vaud, Suisse' : `${canton}, Suisse`;

                infoCommune.textContent = commune;
                // Normalize district name - Nominatim can return "District de X" or "District d'X" etc.
                const cleanDistrict = district
                    .replace(/^District\s+d[eu]'?\s*/i, '')
                    .replace(/^District\s+de\s+l[ae]?'?\s*/i, '')
                    .replace(/^District\s+des?\s+/i, '')
                    .trim();
                infoDistrict.textContent = cleanDistrict;
                infoCanton.textContent = canton;

                // Adresse parsing
                const extratags = data.extratags || {};

                let roadRef = "";
                let isRC = false;

                if (extratags.rcrc_ref) {
                    roadRef = extratags.rcrc_ref;
                    isRC = true;
                } else if (extratags.ref) {
                    roadRef = extratags.ref;
                    if (roadRef.toUpperCase().startsWith("RC")) {
                        isRC = true;
                    }
                }

                const street = addr.road || addr.pedestrian || addr.path || addr.footway || "Lieu sans rue spécifique";
                const houseNumber = addr.house_number ? ` ${addr.house_number}` : "";
                const postCode = addr.postcode ? `${addr.postcode} ` : "";
                let addressText = "";

                if (street !== "Lieu sans rue spécifique") {
                    addressText = `${postCode}${commune}, ${street}${houseNumber}`;
                } else {
                    addressText = `${postCode}${commune}`;
                }

                if (isRC) {
                    let displayRef = roadRef.toUpperCase().startsWith("RC") ? roadRef : `RC ${roadRef}`;
                    addressText += `<br><span style="font-size:11px; color:var(--primary); font-weight:600;">Route Cantonale : ${displayRef}</span>`;
                } else if (roadRef) {
                    addressText += `<br><span style="font-size:11px; color:var(--text-muted); font-weight:700;">Route ${roadRef}</span>`;
                }

                infoAddress.innerHTML = addressText;

                // Lieu-dit parsing
                const lieuDit = addr.locality || addr.isolated_dwelling || addr.hamlet || addr.neighbourhood || addr.croft || addr.suburb || "Aucun lieu-dit identifié";
                infoLieudit.textContent = lieuDit;

                // Effacer la surbrillance lors du changement de zone
                if (activeBoundaryLayer) {
                    map.removeLayer(activeBoundaryLayer);
                    activeBoundaryLayer = null;
                }

                if (canton === 'Vaud' && cardJustice) {
                    cardJustice.style.display = 'flex';

                    // Official mapping: Vaud has 4 MP arrondissements defined by district
                    // Source: https://www.vd.ch/justice
                    const DISTRICT_TO_MP = {
                        // MP de l'Est vaudois
                        'Aigle':                    "MP de l'Est vaudois",
                        'Riviera-Pays-d\'Enhaut':   "MP de l'Est vaudois",
                        'Lavaux-Oron':              "MP de l'Est vaudois",
                        // MP du Nord vaudois
                        'Jura-Nord vaudois':        "MP du Nord vaudois",
                        'Broye-Vully':              "MP du Nord vaudois",
                        'Gros-de-Vaud':             "MP du Nord vaudois",
                        // MP de La Côte
                        'Nyon':                     "MP de La Côte",
                        'Morges':                   "MP de La Côte",
                        // MP de Lausanne
                        'Lausanne':                 "MP de Lausanne",
                        'Ouest lausannois':         "MP de Lausanne",
                    };

                    // Try exact match first, then partial match
                    const mpExact = DISTRICT_TO_MP[cleanDistrict];
                    if (mpExact) {
                        infoJustice.textContent = mpExact;
                    } else {
                        // Partial match for edge cases
                        const mpPartial = Object.entries(DISTRICT_TO_MP).find(([k]) =>
                            cleanDistrict.toLowerCase().includes(k.toLowerCase()) ||
                            k.toLowerCase().includes(cleanDistrict.toLowerCase())
                        );
                        infoJustice.textContent = mpPartial ? mpPartial[1] : `Non déterminé (${cleanDistrict})`;
                    }
                } else if (cardJustice) {
                    cardJustice.style.display = 'none';
                }

                // Police assignment
                if (canton === 'Vaud' && cardPolice) {
                    cardPolice.style.display = 'flex';
                    const c = commune.toLowerCase();

                    if (c.includes("lausanne") && !c.includes("belmont") && !c.includes("mont-sur")) {
                        infoPolice.textContent = "Police de Lausanne";
                    } else if (c.includes("bussigny") || c.includes("chavannes-près-renens") || c.includes("crissier") || c.includes("ecublens") || c.includes("prilly") || c.includes("renens") || c.includes("saint-sulpice") || c.includes("villars-sainte-croix")) {
                        infoPolice.textContent = "Police Ouest Lausannois (POL)";
                    } else if (c.includes("morges") || c.includes("buchillon") || c.includes("lussy") || c.includes("préverenges") || c.includes("saint-prex") || c.includes("tolochenaz")) {
                        infoPolice.textContent = "Police Région Morges (PRM)";
                    } else if (c.includes("nyon") || c.includes("prangins") || c.includes("crans")) {
                        infoPolice.textContent = "Police Nyon Région (PNR)";
                    } else if (c.includes("yverdon") || c.includes("chamblon") || c.includes("cheseaux-noréaz") || c.includes("grandson") || c.includes("montagny") || c.includes("cuarny") || c.includes("treycovagnes") || c.includes("pomy") || c.includes("valeyres")) {
                        infoPolice.textContent = "Police Nord Vaudois (PNV)";
                    } else if (c.includes("montreux") || c.includes("vevey") || c.includes("tour-de-peilz") || c.includes("blonay") || c.includes("légier") || c.includes("chardonne") || c.includes("corseaux") || c.includes("corsier") || c.includes("jongny") || c.includes("veytaux")) {
                        infoPolice.textContent = "Police Riviera (ASR)";
                    } else if (c.includes("aigle") || c.includes("bex") || c.includes("ollon")) {
                        infoPolice.textContent = "Police du Chablais vaudois (EPOC)";
                    } else if (c.includes("pully") || c.includes("paudex") || c.includes("belmont") || c.includes("savigny")) {
                        infoPolice.textContent = "Police Est Lausannois (PEL)";
                    } else if (c.includes("bourg-en-lavaux") || c.includes("chexbres") || c.includes("lutry") || c.includes("puidoux") || c.includes("rivaz") || c.includes("saint-saphorin")) {
                        infoPolice.textContent = "Police Lavaux (APOL)";
                    } else {
                        infoPolice.textContent = "Gendarmerie vaudoise";
                    }
                } else if (cardPolice) {
                    cardPolice.style.display = 'none';
                }

                // Secteur GM (CGM)
                if (IS_MAX_INFO && canton === 'Vaud' && cardPatrouille) {
                    cardPatrouille.style.display = 'flex';
                    cardPatrouille.style.setProperty('display', 'flex', 'important');
                    
                    let sector = "";
                    const c = commune.toLowerCase();
                    const cNorm = c.replace(/^(commune de|ville de)\s+/i, '').trim();

                    if (cleanDistrict === 'Aigle' || cleanDistrict === "Riviera-Pays-d'Enhaut") {
                        sector = 'CGM Est (Rennaz)';
                    } else if (cleanDistrict === 'Nyon') {
                        sector = 'CGM Ouest (Bursins)';
                    } else if (cleanDistrict === 'Lausanne' || cleanDistrict === 'Ouest lausannois' || cleanDistrict === 'Gros-de-Vaud') {
                        sector = 'CGM Centre (Blécherette)';
                    } else if (cleanDistrict === 'Jura-Nord vaudois') {
                        const centreCommunes = ['villars-le-terroir', 'vuarrens', 'bercher', 'pailly', 'essertines', 'fey', 'oppens', 'oulens'];
                        sector = centreCommunes.some(x => cNorm.includes(x)) ? 'CGM Centre (Blécherette)' : 'CGM Nord (Yverdon)';
                    } else if (cleanDistrict === 'Broye-Vully') {
                        const centreCommunes = [
                            'moudon', 'lucens', 'valbroye', 'vucherens', 'syens', 'rossenges', 'hermenches', 'vulliens', 
                            'bussy-sur-moudon', 'chavannes-sur-moudon', 'chesalles-sur-moudon', 'curtilles', 'dompierre', 
                            'lovatens', 'prévonloup', 'roche-sur-mane', 'sarzens', 'treytorrens', 'villars-le-comte', 
                            'brenles', 'forel-sur-lucens', 'cremin', 'granges-près-marnand'
                        ];
                        sector = centreCommunes.some(x => cNorm.includes(x)) ? 'CGM Centre (Blécherette)' : 'CGM Nord (Yverdon)';
                    } else if (cleanDistrict === 'Lavaux-Oron') {
                        const centreCommunes = ['pully', 'paudex', 'belmont', 'lutry', 'savigny', 'bourg-en-lavaux', 'cully', 'epesses', 'grandvaux', 'riex', 'villette', 'forel', 'servion', 'ferlens', 'mézières', 'carrouge', 'montpreveyres'];
                        sector = centreCommunes.some(x => cNorm.includes(x)) ? 'CGM Centre (Blécherette)' : 'CGM Est (Rennaz)';
                    } else if (cleanDistrict === 'Morges') {
                        const centreCommunes = [
                            'morges', 'echichens', 'colombier', 'gollion', 'montricher', "l'isle", 'cossonay', 
                            'vullierens', 'aclens', 'romanel', 'senarclens', 'la chaux', 'cuarnens', 'mont-la-ville', 'la praz',
                            'dizy', 'chevilly', 'pampigny', 'cottens', 'sévery', 'apples', 'reverolle', 'bussy', 'grancy', 'chavannes-le-veyron',
                            'mauraz', 'ferreyres', 'moiry', 'bremblens', 'lonay', 'préverenges', 'denges', 'echandens'
                        ];
                        sector = centreCommunes.some(x => cNorm.includes(x)) ? 'CGM Centre (Blécherette)' : 'CGM Ouest (Bursins)';
                    } else {
                        sector = `CGM Non déterminé (${cleanDistrict})`;
                    }

                    infoPatrouille.textContent = sector;
                } else if (cardPatrouille) {
                    cardPatrouille.style.setProperty('display', 'none', 'important');
                }

                if (canton !== 'Vaud') {
                    locationSubtitle.textContent += " (Hors Vaud)";
                    locationSubtitle.style.color = "#f59e0b"; // Warning
                } else {
                    locationSubtitle.style.color = "";
                }
            } else {
                locationTitle.textContent = "Lieu Inconnu";
                locationSubtitle.textContent = "Point hors zones reconnues.";
                infoCommune.textContent = "-";
                infoDistrict.textContent = "-";
                infoCanton.textContent = "-";
                infoAddress.textContent = "-";
                infoLieudit.textContent = "-";
            }
        } catch (error) {
            console.error(error);
            // Handle rate limiting (429) or connection issues (Failed to fetch)
            const isRateLimit = (error.message && error.message.includes('429')) || 
                               (error.name === 'TypeError' && error.message.includes('fetch'));

            if (isRateLimit) {
                locationTitle.textContent = "Service surchargé";
                locationSubtitle.textContent = "Trop de requêtes — Patientez un peu et réessayez plus tard.";
                locationSubtitle.style.color = "var(--primary)";
                showToast("⏳ Trop de requêtes — l'API vous demande de patienter.", 6000);
                
                // Auto-retry after 8 seconds (slightly more conservative than 5s)
                setTimeout(() => {
                    if (dataEnabled) {
                        const center = map.getCenter();
                        reverseGeocode(center.lat, center.lng);
                    }
                }, 8000);
            } else {
                locationTitle.textContent = "Erreur";
                locationSubtitle.textContent = "Impossible de récupérer les informations.";
                showToast("Erreur de connexion. Vérifiez votre réseau.", 3000);
            }
        } finally {
            const textElements = [infoCommune, infoDistrict, infoCanton, infoAddress, infoLieudit];
            if (infoJustice) textElements.push(infoJustice);
            if (infoPolice) textElements.push(infoPolice);
            if (infoPatrouille) textElements.push(infoPatrouille);
            textElements.forEach(el => el.classList.remove('skeleton'));

            isFetching = false;
        }
    }

    // Map Events
    map.on('movestart', () => {
        crosshair.classList.add('is-dragging');
    });

    let moveTimeout;
    map.on('moveend', () => {
        crosshair.classList.remove('is-dragging');
        clearTimeout(moveTimeout);
        // If a search marker is active, don't overwrite the data with the map center
        if (searchMarker) return;
        moveTimeout = setTimeout(() => {
            if (dataEnabled) {
                const center = map.getCenter();
                reverseGeocode(center.lat, center.lng);
            }
        }, 2000); // 2s debounce — avoids Nominatim rate limiting
    });

    // Locating User
    const btnLocate = document.getElementById('btn-locate');
    btnLocate.addEventListener('click', () => {
        btnLocate.classList.add('pulse');

        // Let user know it's locating
        if (dataEnabled) {
            bottomSheet.classList.remove('hidden');
            fabContainer.classList.remove('sheet-hidden');
        }
        if (searchContainer) searchContainer.classList.remove('hidden');
        locationTitle.textContent = "Localisation...";
        locationSubtitle.textContent = "Acquisition du signal GPS...";

        map.locate({
            setView: true,
            maxZoom: 15,
            enableHighAccuracy: true
        });
    });

    map.on('locationfound', (e) => {
        btnLocate.classList.remove('pulse');

        if (userMarker) {
            userMarker.setLatLng(e.latlng);
        } else {
            const userIcon = L.divIcon({
                className: 'custom-user-icon',
                html: `<div style="background-color: var(--primary); width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            userMarker = L.marker(e.latlng, { icon: userIcon }).addTo(map);
        }
    });

    map.on('locationerror', (e) => {
        btnLocate.classList.remove('pulse');
        alert("Erreur de localisation. Veuillez vérifier l'accès GPS de votre appareil ou du navigateur.");
        reverseGeocode(map.getCenter().lat, map.getCenter().lng);
    });



    async function loadBoundary(type, name, elementToLoadFrom) {
        if (activeBoundaryLayer) {
            map.removeLayer(activeBoundaryLayer);
            activeBoundaryLayer = null;
        }

        if (!name || name === '-' || name.includes('Inconnu')) {
            showToast("Nom invalide ou inconnu.");
            return;
        }

        try {
            let url = '';
            showToast("Recherche des limites...");

            if (type === 'commune') {
                url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(name)}&country=Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
            } else if (type === 'district') {
                // Pour sécuriser, on ajoute "District de " si manquant
                let dName = name.toLowerCase().includes('district') ? name : `District de ${name}`;
                url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dName)},Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
            } else if (type === 'canton') {
                let cName = name.toLowerCase().includes('canton') ? name : `Canton de ${name}`;
                url = `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(cName)}&country=Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
            } else {
                // justice, lieudit
                url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)},Switzerland&polygon_geojson=1&format=jsonv2&limit=1`;
            }

            let response = await fetch(url);
            let data = await response.json();

            // Fallback for commune if nothing found
            if (type === 'commune' && (!data || data.length === 0 || !data[0].geojson)) {
                const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)},Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
                response = await fetch(url2);
                data = await response.json();
            }

            if (data && data.length > 0 && data[0].geojson) {
                const geojson = data[0].geojson;
                if (geojson.type === "Point") {
                    showToast("Seul un point a été trouvé, pas de limites.");
                    return;
                }

                let color = "#3b82f6";
                if (type === 'canton') color = "#10b981";
                if (type === 'district') color = "#f59e0b";
                if (type === 'justice') color = "#8b5cf6";

                activeBoundaryLayer = L.geoJSON(geojson, {
                    style: {
                        color: color,
                        weight: 3,
                        opacity: 0.8,
                        fillOpacity: 0.15
                    },
                    interactive: false
                }).addTo(map);

                // Fit bounds to polygon (removed to prevent map moving and limit vanishing)
                // Keep data sheet open!
            } else {
                showToast("Limites non disponibles pour cet élément.");
            }
        } catch (e) {
            console.error("Erreur chargement frontière", e);
            showToast("Erreur lors du chargement des limites.");
        }
    }

    // Attach Boundary Events
    document.querySelectorAll('.btn-boundary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Avoid triggering copy
            const type = btn.getAttribute('data-type');

            // commune, district, canton
            const targetEl = document.getElementById(`info-${type}`);
            if (targetEl && !targetEl.classList.contains('skeleton')) {
                const name = targetEl.textContent.trim();
                loadBoundary(type, name, btn);
            }
        });
    });

    // Initial load geocoding: locate user
    if (dataEnabled) {
        bottomSheet.classList.remove('hidden');
    }
    locationTitle.textContent = "Localisation initiale...";
    locationSubtitle.textContent = "Acquisition du signal GPS...";
    map.locate({
        setView: true,
        maxZoom: 15,
        enableHighAccuracy: true
    });

    // Toggle Data Menu
    if (btnToggleData) {
        btnToggleData.addEventListener('click', () => {
            dataEnabled = !dataEnabled;
            const icon = btnToggleData.querySelector('.material-symbols-outlined');
            if (dataEnabled) {
                icon.textContent = 'visibility';

                // Fetch current position data
                const center = map.getCenter();
                reverseGeocode(center.lat, center.lng);
            } else {
                icon.textContent = 'visibility_off';
                bottomSheet.classList.add('hidden');
            }
        });
    }

    // Layers Menu
    const btnLayers = document.getElementById('btn-layers');
    const layersMenu = document.getElementById('layers-menu');
    const btnCloseLayers = document.getElementById('btn-close-layers');

    btnLayers.addEventListener('click', () => {
        layersMenu.classList.remove('hidden');
    });

    btnCloseLayers.addEventListener('click', () => {
        layersMenu.classList.add('hidden');
    });

    // About Modal
    const btnAbout = document.getElementById('btn-about');
    const modalAbout = document.getElementById('modal-about');
    const btnCloseAbout = document.getElementById('btn-close-about');

    if (btnAbout && modalAbout) {
        btnAbout.addEventListener('click', () => {
            layersMenu.classList.add('hidden');
            modalAbout.classList.remove('hidden');
        });

        const btnAboutMain = document.getElementById('btn-about-main');
        if (btnAboutMain) {
            btnAboutMain.addEventListener('click', () => {
                modalAbout.classList.remove('hidden');
            });
        }

        btnCloseAbout.addEventListener('click', () => {
            modalAbout.classList.add('hidden');
        });

        // Close modal when clicking outside
        modalAbout.addEventListener('click', (e) => {
            if (e.target === modalAbout) {
                modalAbout.classList.add('hidden');
            }
        });
    }

    // Center map on click and handle data visibility
    map.on('click', (e) => {
        let closedMenu = false;

        if (!layersMenu.classList.contains('hidden')) {
            layersMenu.classList.add('hidden');
            closedMenu = true;
        }

        const searchResults = document.getElementById('search-results');
        if (searchResults && !searchResults.classList.contains('hidden')) {
            searchResults.classList.add('hidden');
            closedMenu = true;
        }

        // Don't pan if the user was just clicking to dismiss a menu
        if (closedMenu) return;

        // Force data to show
        if (!dataEnabled && btnToggleData) {
            dataEnabled = true;
            btnToggleData.querySelector('.material-symbols-outlined').textContent = 'visibility';
        }

        // Center the map smoothly, which triggers moveend and fetches data
        if (e.latlng) {
            map.panTo(e.latlng, { animate: true, duration: 0.5 });

            // Expand sheet if collapsed so user sees the new data
            if (bottomSheet) {
                bottomSheet.classList.remove('hidden', 'collapsed');
                sheetState = 'expanded';
            }
        }
    });

    // Layer checkboxes logic
    const chkCommune = document.getElementById('layer-commune');
    const chkDistrict = document.getElementById('layer-district');
    const chkCanton = document.getElementById('layer-canton');
    const chkAddress = document.getElementById('layer-address');
    const chkLieudit = document.getElementById('layer-lieudit');
    const chkJustice = document.getElementById('layer-justice');
    const chkPolice = document.getElementById('layer-police');
    const chkPatrouille = document.getElementById('layer-patrouille');
    const chkCoords = document.getElementById('layer-coords');

    function updateLayersVisibility() {
        if (chkCommune && cardCommune) cardCommune.classList.toggle('layer-hidden', !chkCommune.checked);
        if (chkDistrict && cardDistrict) cardDistrict.classList.toggle('layer-hidden', !chkDistrict.checked);
        if (chkCanton && cardCanton) cardCanton.classList.toggle('layer-hidden', !chkCanton.checked);
        if (chkAddress && cardAddress) cardAddress.classList.toggle('layer-hidden', !chkAddress.checked);
        if (chkLieudit && cardLieudit) cardLieudit.classList.toggle('layer-hidden', !chkLieudit.checked);
        if (chkCoords && cardCoords) cardCoords.classList.toggle('layer-hidden', !chkCoords.checked);
        if (chkJustice && cardJustice) cardJustice.classList.toggle('layer-hidden', !chkJustice.checked);
        if (chkPolice && cardPolice) cardPolice.classList.toggle('layer-hidden', !chkPolice.checked);
        if (chkPatrouille && cardPatrouille) cardPatrouille.classList.toggle('layer-hidden', !chkPatrouille.checked);
    }

    [chkCommune, chkDistrict, chkCanton, chkAddress, chkLieudit, chkJustice, chkPolice, chkPatrouille, chkCoords].forEach(chk => {
        if (chk) chk.addEventListener('change', updateLayersVisibility);
    });

    // Run once on load
    updateLayersVisibility();

    // Search Autocomplete Logic
    const searchInput = document.getElementById('search-input');
    const searchResultsDiv = document.getElementById('search-results');
    const btnClearSearch = document.getElementById('btn-clear-search');
    let searchTimeout = null;

    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            searchContainer.classList.add('searching');
        });

        searchInput.addEventListener('blur', () => {
            // Delay to allow clicking on results
            setTimeout(() => {
                if (searchInput.value.trim() === "") {
                    searchContainer.classList.remove('searching');
                }
            }, 200);
        });

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                searchContainer.classList.add('searching');
                btnClearSearch.classList.remove('hidden');
            } else {
                btnClearSearch.classList.add('hidden');
                searchResultsDiv.classList.add('hidden');
                return;
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                handleSearch(query);
            }, 400);
        });

        btnClearSearch.addEventListener('click', () => {
            searchInput.value = '';
            btnClearSearch.classList.add('hidden');
            searchResultsDiv.classList.add('hidden');
            searchContainer.classList.remove('searching');
            // Remove search marker when search is cleared
            if (searchMarker) {
                map.removeLayer(searchMarker);
                searchMarker = null;
            }
            searchInput.focus();
            // Reload data for current map center
            if (dataEnabled) {
                const center = map.getCenter();
                reverseGeocode(center.lat, center.lng);
            }
        });
    }

    function lv95ToWGS84(e, n) {
        // Start with polynomial approximation as initial guess
        const y_p = (e - 2600000) / 1000000;
        const x_p = (n - 1200000) / 1000000;
        let lat = (16.9023892 + 3.230773 * x_p - 0.270978 * y_p * y_p
            - 0.002528 * x_p * x_p - 0.0447 * y_p * y_p * x_p - 0.0140 * x_p * x_p * x_p) * 100 / 36;
        let lng = (2.6779094 + 4.728982 * y_p + 0.791484 * y_p * x_p
            + 0.1306 * y_p * x_p * x_p - 0.0436 * y_p * y_p * y_p) * 100 / 36;

        // Iterative Newton refinement: correct until round-trip error < 0.01m
        // Jacobian: dE/dlng ≈ 76124, dN/dlat ≈ 111171 (in LV95 meters per degree)
        for (let i = 0; i < 10; i++) {
            const computed = wgs84ToLV95(lat, lng);
            const de = e - computed.e;
            const dn = n - computed.n;
            if (Math.abs(de) < 0.01 && Math.abs(dn) < 0.01) break;
            lng += de / 76124;
            lat += dn / 111171;
        }

        return { lat, lng };
    }

    async function handleSearch(query) {
        // 1. Try Coordinate Search (WGS84 or LV95)
        const coords = parsePossibleCoordinates(query);
        if (coords) {
            await displayCoordResult(coords);
            return;
        }

        // 2. Otherwise perform location search
        performLocationSearch(query);
    }

    function parsePossibleCoordinates(query) {
        const cleanQuery = query.trim().replace(/\s+/g, ' ');

        // WGS84: 46.123 6.456
        const wgsRegex = /^([-+]?\d{1,2}\.\d+)[,\s/]+([-+]?\d{1,3}\.\d+)$/;
        const matchWgs = cleanQuery.match(wgsRegex);
        if (matchWgs) {
            const lat = parseFloat(matchWgs[1]);
            const lng = parseFloat(matchWgs[2]);
            if (lat > 45 && lat < 48 && lng > 5 && lng < 12) {
                return { lat, lng, type: 'WGS84' };
            }
        }

        // LV95: 2600000 1200000
        const lv95Regex = /^(\d{6,7})[,\s/]+(\d{6,7})$/;
        const matchLv95 = cleanQuery.match(lv95Regex);
        if (matchLv95) {
            const e = parseInt(matchLv95[1]);
            const n = parseInt(matchLv95[2]);
            if (e > 2400000 && e < 2900000 && n > 1000000 && n < 1400000) {
                // Return raw LV95, will be converted via API
                return { e, n, type: 'LV95', orig: `${e}, ${n}` };
            }
        }
        return null;
    }

    async function displayCoordResult(coords) {
        searchResultsDiv.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'search-result-item';

        const title = document.createElement('div');
        title.className = 'search-result-title';
        title.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; color:var(--primary);">location_on</span> Aller aux coordonnées`;

        const subtitle = document.createElement('div');
        subtitle.className = 'search-result-subtitle';

        if (coords.type === 'LV95') {
            subtitle.textContent = `LV95 : ${coords.orig} — Conversion en cours...`;
            li.appendChild(title);
            li.appendChild(subtitle);
            searchResultsDiv.appendChild(li);
            searchResultsDiv.classList.remove('hidden');

            // Use official Swisstopo REST API for exact conversion
            try {
                const apiUrl = `https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=${coords.e}&northing=${coords.n}&format=json`;
                const resp = await fetch(apiUrl);
                const json = await resp.json();
                // API returns: { easting: lng, northing: lat }
                const lat = json.northing;
                const lng = json.easting;
                subtitle.textContent = `LV95 : ${coords.orig} → GPS : ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                li.onclick = () => goToLocation(lat, lng, coords.orig);
            } catch (err) {
                // Fallback to approximation if API unavailable
                console.warn('Swisstopo API unavailable, using approximation', err);
                const approx = lv95ToWGS84(coords.e, coords.n);
                subtitle.textContent = `LV95 : ${coords.orig} (approximation)`;
                li.onclick = () => goToLocation(approx.lat, approx.lng, coords.orig);
            }
        } else {
            subtitle.textContent = `GPS (WGS84) : ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
            li.appendChild(title);
            li.appendChild(subtitle);
            searchResultsDiv.appendChild(li);
            searchResultsDiv.classList.remove('hidden');
            li.addEventListener('click', () => {
                goToLocation(coords.lat, coords.lng, `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
            });
        }
    }

    function goToLocation(lat, lng, name) {
        if (!dataEnabled && btnToggleData) {
            dataEnabled = true;
            btnToggleData.querySelector('.material-symbols-outlined').textContent = 'visibility';
        }

        // Remove any previous search marker
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }

        // Place a persistent marker at the EXACT searched location
        const searchIcon = L.divIcon({
            className: 'search-marker-icon',
            html: `<div style="
                width: 22px; height: 22px;
                background: var(--primary);
                border: 3px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 22]
        });
        searchMarker = L.marker([lat, lng], { icon: searchIcon, zIndexOffset: 1000 }).addTo(map);

        // Fly to exact coordinates, then load data for THOSE coords (not map center)
        map.flyTo([lat, lng], 17, { animate: true, duration: 1.0 });

        // Load data directly for the searched point, bypassing moveend
        reverseGeocode(lat, lng);

        searchResultsDiv.classList.add('hidden');
        searchInput.value = name;
        searchContainer.classList.remove('searching');
    }

    async function performLocationSearch(query) {
        if (query.length < 3) return;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&countrycodes=ch&limit=5`;
        try {
            const response = await fetch(url, { headers: { 'Accept-Language': 'fr-CH, fr' } });
            const data = await response.json();

            searchResultsDiv.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'search-result-item';

                    const title = document.createElement('div');
                    title.className = 'search-result-title';
                    const name = item.name || (item.address && (item.address.road || item.address.village || item.address.town)) || 'Lieu';
                    title.textContent = name;

                    const subtitle = document.createElement('div');
                    subtitle.className = 'search-result-subtitle';
                    subtitle.textContent = item.display_name;

                    li.appendChild(title);
                    li.appendChild(subtitle);

                    li.addEventListener('click', () => {
                        goToLocation(parseFloat(item.lat), parseFloat(item.lon), name);
                    });

                    searchResultsDiv.appendChild(li);
                });
                searchResultsDiv.classList.remove('hidden');
            } else {
                searchResultsDiv.classList.add('hidden');
            }
        } catch (error) {
            console.error(error);
        }
    }

    // Toast & Copy Feature
    const toast = document.getElementById('toast');
    function showToast(message, duration = 2000) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    document.querySelectorAll('.info-card').forEach(card => {
        card.addEventListener('click', () => {
            const strong = card.querySelector('strong');
            if (strong && !strong.classList.contains('skeleton') && strong.textContent.trim() !== '-' && strong.textContent.trim() !== '') {
                let textToCopy = "";

                // Si c'est la carte des coordonnées, ne copier que la première ligne (LV95)
                if (card.id === 'card-coords') {
                    // On récupère le texte brut du strong, et on ne prend que ce qui précède le premier saut de ligne
                    textToCopy = strong.innerText.split('\n')[0].trim();
                } else {
                    textToCopy = strong.innerText.replace(/\n\n/g, ' ').replace(/\n/g, ' - ');
                }

                if (navigator.clipboard) {
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        const label = card.querySelector('.label').textContent;
                        showToast(`${label} copié !`);
                    });
                }
            }
        });
    });

    // Bottom Sheet Touch Swipe Layout
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDraggingSheet = false;

    bottomSheet.addEventListener('touchstart', (e) => {
        // Only ignore if scrolling inside an element that overflows, or search results
        if (e.target.closest('.search-results') || bottomSheet.scrollTop > 0) return;
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        isDraggingSheet = true;
        bottomSheet.classList.add('no-transition');
    }, { passive: true });

    bottomSheet.addEventListener('touchmove', (e) => {
        if (!isDraggingSheet) return;
        touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;

        if (sheetState === 'expanded' && deltaY > 0) {
            bottomSheet.style.transform = `translateY(${deltaY}px)`;
        } else if (sheetState === 'collapsed') {
            const offset = bottomSheet.getBoundingClientRect().height - 110;
            const newY = offset + deltaY;
            if (newY >= 0) bottomSheet.style.transform = `translateY(${newY}px)`;
        }
    }, { passive: true });

    bottomSheet.addEventListener('touchend', () => {
        if (!isDraggingSheet) return;
        isDraggingSheet = false;
        bottomSheet.classList.remove('no-transition');
        bottomSheet.style.transform = '';

        const deltaY = touchCurrentY - touchStartY;
        if (sheetState === 'expanded' && deltaY > 50) {
            sheetState = 'collapsed';
            bottomSheet.classList.add('collapsed');
            if (window.innerWidth < 768 && searchContainer) searchContainer.classList.add('hidden');
        } else if (sheetState === 'collapsed' && deltaY < -50) {
            sheetState = 'expanded';
            bottomSheet.classList.remove('collapsed');
            if (window.innerWidth < 768 && searchContainer) searchContainer.classList.remove('hidden');
        }
    });
});
