document.addEventListener('DOMContentLoaded', () => {
    // Canton Vaud roughly centered
    const INITIAL_COORDS = [46.5197, 6.6323]; // Lausanne
    const INITIAL_ZOOM = 13;
    
    // Bounds for Switzerland approx, to restrict the map 
    // bounding box: 45.8, 5.9, 47.8, 10.5
    const SWISS_BOUNDS = [
        [45.8, 5.9], 
        [47.8, 10.5]
    ];

    const map = L.map('map', {
        zoomControl: false, 
        maxBounds: SWISS_BOUNDS,
        maxBoundsViscosity: 1.0,
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
    let vaudLayer = null;
    let communeLayer = null;

    // Functions
    function wgs84ToLV95(lat, lng) {
        const latSec = lat * 3600;
        const lngSec = lng * 3600;
        const latAux = (latSec - 169028.66) / 10000;
        const lngAux = (lngSec - 26782.5) / 10000;
        const e = 2600072.37 + 211455.93 * lngAux - 10938.51 * lngAux * latAux - 0.36 * lngAux * Math.pow(latAux, 2) - 44.54 * Math.pow(lngAux, 3);
        const n = 1200147.07 + 308807.95 * latAux + 3745.25 * Math.pow(lngAux, 2) + 76.63 * Math.pow(latAux, 2) - 194.56 * Math.pow(lngAux, 2) * latAux + 119.79 * Math.pow(latAux, 3);
        return { e: Math.round(e), n: Math.round(n) };
    }

    async function reverseGeocode(lat, lng) {
        if (isFetching) return;
        isFetching = true;
        
        const lv95 = wgs84ToLV95(lat, lng);
        const wgsText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const chText = `${lv95.e}, ${lv95.n}`;
        
        // Skeletons feedback
        const textElements = [infoCommune, infoDistrict, infoCanton, infoAddress, infoLieudit];
        if (infoJustice) textElements.push(infoJustice);
        if (infoPolice) textElements.push(infoPolice);
        
        textElements.forEach(el => {
            el.classList.add('skeleton');
            if(el.id !== 'info-address') el.innerHTML = '&nbsp;';
            else el.innerHTML = '&nbsp;<br>&nbsp;';
        });

        locationTitle.textContent = "Recherche...";
        locationSubtitle.textContent = "Chargement des données...";
        
        infoCoords.innerHTML = `${wgsText}<br><span style="font-size: 11px; color: var(--text-muted); font-weight: normal; margin-top: 2px; display: block;">${chText}</span>`;
        if (cardJustice) cardJustice.style.display = 'none';
        if (cardPolice) cardPolice.style.display = 'none';
        
        if (dataEnabled) {
            bottomSheet.classList.remove('hidden');
            fabContainer.classList.remove('sheet-hidden');
        }
        if (searchContainer) searchContainer.classList.remove('hidden');

        try {
            // Nominatim API (Zoom 18 for street level + extratags for RC numbers)
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&countrycodes=ch&zoom=18&extratags=1`;
            
            const response = await fetch(url, {
                headers: {
                    'Accept-Language': 'fr-CH, fr'
                }
            });
            const data = await response.json();

            if (data && !data.error && data.address) {
                const addr = data.address;
                
                const commune = addr.village || addr.town || addr.city || addr.municipality || 'Inconnue';
                const district = addr.county || addr.district || 'Inconnu';
                const canton = addr.state || 'Inconnu';
                
                let displayName = data.name || commune;
                if(!data.name && addr.road) {
                    displayName = addr.road;
                }
                
                // Format display limits
                if(displayName.length > 25) {
                    displayName = displayName.substring(0, 25) + '...';
                }

                locationTitle.textContent = displayName;
                locationSubtitle.textContent = canton === 'Vaud' ? 'Canton de Vaud, Suisse' : `${canton}, Suisse`;
                
                infoCommune.textContent = commune;
                const cleanDistrict = district.replace('District de ', '').replace('District d\'', '').trim();
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
                
                // Tracé de la commune
                if (canton === 'Vaud' || canton === 'Inconnu') {
                    loadCommuneBoundary(commune);
                } else {
                    if (communeLayer) map.removeLayer(communeLayer);
                }
                
                if (canton === 'Vaud' && cardJustice) {
                    cardJustice.style.display = 'flex';
                    
                    const queryText = (commune + " " + cleanDistrict + " " + (addr.county||'') + " " + (addr.state_district||'') + " " + (addr.city||'')).toLowerCase();
                    
                    if (queryText.includes("aigle") || queryText.includes("lavaux") || queryText.includes("oron") || queryText.includes("riviera") || queryText.includes("enhaut")) {
                        infoJustice.textContent = "MP de l'Est vaudois";
                    } else if (queryText.includes("broye") || queryText.includes("vully") || queryText.includes("gros-de-vaud") || queryText.includes("jura") || queryText.includes("yverdon")) {
                        infoJustice.textContent = "MP du Nord vaudois";
                    } else if (queryText.includes("morges") || queryText.includes("nyon") || queryText.includes("rolle")) {
                        infoJustice.textContent = "MP de La Côte";
                    } else if (queryText.includes("lausanne") || queryText.includes("ouest") || queryText.includes("renens") || queryText.includes("prilly")) {
                        infoJustice.textContent = "MP de Lausanne";
                    } else {
                        infoJustice.textContent = "Non déterminé (" + cleanDistrict + ")";
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
                
                if(canton !== 'Vaud') {
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
            locationTitle.textContent = "Erreur";
            locationSubtitle.textContent = "Impossible de récupérer les informations.";
        } finally {
            const textElements = [infoCommune, infoDistrict, infoCanton, infoAddress, infoLieudit];
            if (infoJustice) textElements.push(infoJustice);
            if (infoPolice) textElements.push(infoPolice);
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
        moveTimeout = setTimeout(() => {
            if (dataEnabled) {
                const center = map.getCenter();
                reverseGeocode(center.lat, center.lng);
            }
        }, 1000); // 1s debounce
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
            userMarker = L.marker(e.latlng, {icon: userIcon}).addTo(map);
        }
    });

    map.on('locationerror', (e) => {
        btnLocate.classList.remove('pulse');
        alert("Erreur de localisation. Veuillez vérifier l'accès GPS de votre appareil ou du navigateur.");
        reverseGeocode(map.getCenter().lat, map.getCenter().lng);
    });

    // Polygon Borders
    async function loadVaudBoundary() {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=Canton+de+Vaud,Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.length > 0 && data[0].geojson) {
                vaudLayer = L.geoJSON(data[0].geojson, {
                    style: {
                        color: "#10b981", 
                        weight: 2, 
                        opacity: 0.8, 
                        fillOpacity: 0.05, 
                        dashArray: "5, 5"
                    },
                    interactive: false
                }).addTo(map);
            }
        } catch (e) {
            console.error("Erreur chargement frontière Vaud", e);
        }
    }
    
    async function loadCommuneBoundary(communeName) {
        if (communeLayer) {
            map.removeLayer(communeLayer);
            communeLayer = null;
        }
        if (!communeName || communeName === 'Inconnue' || communeName === '-') return;

        try {
            const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(communeName)}&state=Vaud&country=Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
            let response = await fetch(url);
            let data = await response.json();
            
            if (!data || data.length === 0 || !data[0].geojson) {
                const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(communeName)},Canton+de+Vaud,Switzerland&polygon_geojson=1&format=jsonv2&class=boundary&type=administrative&limit=1`;
                response = await fetch(url2);
                data = await response.json();
            }

            if (data && data.length > 0 && data[0].geojson) {
                communeLayer = L.geoJSON(data[0].geojson, {
                    style: {
                        color: "#3b82f6", 
                        weight: 3, 
                        opacity: 0.8, 
                        fillOpacity: 0.1
                    },
                    interactive: false
                }).addTo(map);
            }
        } catch (e) {
            console.error("Erreur chargement frontière Commune", e);
        }
    }
    
    loadVaudBoundary();

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
        
        btnCloseAbout.addEventListener('click', () => {
            modalAbout.classList.add('hidden');
        });
        
        // Close modal when clicking outside
        modalAbout.addEventListener('click', (e) => {
            if(e.target === modalAbout) {
                modalAbout.classList.add('hidden');
            }
        });
    }
    
    // Center map on click and handle data visibility
    map.on('click', (e) => {
        let closedMenu = false;
        
        if(!layersMenu.classList.contains('hidden')) {
            layersMenu.classList.add('hidden');
            closedMenu = true;
        }
        
        const searchResults = document.getElementById('search-results');
        if(searchResults && !searchResults.classList.contains('hidden')) {
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
    }

    [chkCommune, chkDistrict, chkCanton, chkAddress, chkLieudit, chkJustice, chkPolice, chkCoords].forEach(chk => {
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
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                btnClearSearch.classList.remove('hidden');
            } else {
                btnClearSearch.classList.add('hidden');
                searchResultsDiv.classList.add('hidden');
                return;
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performLocationSearch(query);
            }, 400); // 400ms debounce
        });

        btnClearSearch.addEventListener('click', () => {
            searchInput.value = '';
            btnClearSearch.classList.add('hidden');
            searchResultsDiv.classList.add('hidden');
            searchInput.focus();
        });
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
                        const lat = parseFloat(item.lat);
                        const lon = parseFloat(item.lon);
                        
                        if (!dataEnabled && btnToggleData) {
                            dataEnabled = true;
                            btnToggleData.querySelector('.material-symbols-outlined').textContent = 'visibility';
                        }
                        
                        map.flyTo([lat, lon], 16, { animate: true, duration: 1.2 });
                        searchResultsDiv.classList.add('hidden');
                        searchInput.value = name;
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
    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    document.querySelectorAll('.info-card').forEach(card => {
        card.addEventListener('click', () => {
            const strong = card.querySelector('strong');
            if (strong && !strong.classList.contains('skeleton') && strong.textContent.trim() !== '-' && strong.textContent.trim() !== '') {
                const textToCopy = strong.innerText.replace(/\n\n/g, ' ').replace(/\n/g, ' - ');
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
    }, {passive: true});

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
    }, {passive: true});

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
