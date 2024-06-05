var data;
var lat;
var lon;
var currentIsochrone;
let codesINSEE = new Set();
var codes;
var grillePoints = [];
var mode;
var markers;
var dataCarreaux;
var totalPointsInsideIsochrone = 0; // Initialiser à zéro au début
var sumInd = 0;
var countTiles = 0;

var data = {"lat":48.86666,"lon":2.333333,"mode":"driving","time":10};
var lat = data.lat;
var lon = data.lon;

// Fonction de test pour charger les données (à commenter pour la production)
// function testChargerDonnees() {
//     const testEvent = {
//         origin: 'https://www.koosto.fr/medecin-generaliste/simulateur-business-plan/',
//         data: JSON.stringify({"lat":48.86666, "lon":2.333333, "mode":"driving", "time":10})
//     };
//     window.dispatchEvent(new MessageEvent('message', testEvent));
// }

async function getAddressFromCoordinates(lat, lon) {
    const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            console.log(data.features[0].properties.label);
            return data.features[0].properties.label;
        } else {
            console.error('Aucune adresse trouvée pour les coordonnées:', lat, lon);
            return 'Adresse non trouvée';
        }
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'adresse:', error);
        return 'Erreur lors de la récupération de l\'adresse';
    }
}

async function afficherAdresseSurCarte(lat, lon) {
    const adresse = await getAddressFromCoordinates(lat, lon);

    // Créer une icône personnalisée
    let customIcon = L.divIcon({
        html: `
        <div class="icon-label" style="background-image: url('img/my_pin_bleu_fonce.png'); background-size: cover; width: 36px; height: 36px; display: flex; justify-content: center; align-items: center;">
        <span style="position: absolute; color: white; font-size: 11px; font-weight: bold;"></span>
    </div>
        `,
        className: '', // This removes default Leaflet icon styling
        iconSize: [36, 36],
        iconAnchor: [18, 18]  // The anchor of the icon, centered
    });

    const marker = L.marker([lat, lon], {icon: customIcon}).addTo(carte);
    marker.bindPopup(`${adresse || "Adresse d'origine"} `);
}

window.addEventListener("message", async function(event) {
    resetMap(); // Réinitialisez la carte et les données.
    codesINSEE.clear(); // Très important pour ne pas garder les anciens codes INSEE.
    grillePoints = [];

    data = JSON.parse(event.data);
    lat = data.lat;
    lon = data.lon;

    console.log("Reçu : " + event.data);
    try {
        data = JSON.parse(event.data);
        lat = data.lat;
        lon = data.lon;
        console.log(data.mode);
        if (data.mode == "driving") {
            mode = "driving";
        } else {
            mode = "walking";
        }

        resetMap(); // Réinitialisez la carte et les données.
        codesINSEE.clear(); // Très important pour ne pas garder les anciens codes INSEE.
        grillePoints = [];
        await chargerIsochroneEtListerCommunes();
        await updateMap(); // Assurez-vous que cette fonction gère correctement les promesses.

        await afficherAdresseSurCarte(lat, lon);

    } catch (error) {
        console.error("Erreur lors du traitement de l'événement message:", error);
    }
});

function resetMap() {
    carte.eachLayer((layer) => {
        if (!layer._url) { // Supprimez toutes les couches sauf la couche de tuiles basée sur l'URL.
            carte.removeLayer(layer);
        }
    });
    if (currentIsochrone) {
        currentIsochrone.remove(); // Assurez-vous de supprimer l'isochrone actuel s'il existe.
    }
}

function initialiserCarte() {
    var carte = L.map('maCarte', {
        maxZoom: 18,   // Maximum zoom level that the user can zoom to
        minZoom: 4     // Minimum zoom level que l'utilisateur peut zoomer out to
    }).setView([lat, lon], 13);

    // Créer un nouveau pane pour les marqueurs avec un zIndex élevé
    carte.createPane('markerPane');
    carte.getPane('markerPane').style.zIndex = 650; // Les tuiles ont habituellement un zIndex de 400

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(carte);

    return carte;
}

var carte = initialiserCarte();
// testChargerDonnees(); // Ligne à commenter pour la production

function fetchIsochrone(map, center) {
    var apiKey = 'pk.eyJ1IjoiamFtZXNpdGhlYSIsImEiOiJjbG93b2FiaXEwMnVpMmpxYWYzYjBvOTVuIn0.G2rAo0xl14oye9YVz4eBcw';
    var url = `https://api.mapbox.com/isochrone/v1/mapbox/${center.mode}/${center.lon},${center.lat}?contours_minutes=${center.time || 10}&polygons=true&access_token=${apiKey}`;

    return new Promise((resolve, reject) => {
        fetch(url)
        .then(response => response.json())
        .then(data => {
            if (currentIsochrone) {
                currentIsochrone.remove();
            }
            var coords = data.features[0].geometry.coordinates[0];
            var latLngs = coords.map(coord => ([coord[1], coord[0]]));

            currentIsochrone = L.polygon(latLngs, {
                color: '#FF0000',
                weight: 2,
                opacity: 0.8,
                fillColor: '#007aff',
                fillOpacity: 0.3,
                interactive: false  // Désactiver les événements de clic sur cette couche
            }).addTo(map);

            var bounds = currentIsochrone.getBounds();
            carte.fitBounds(bounds);
            resolve(currentIsochrone);
        })
        .catch(error => {
            console.log('Erreur lors de la récupération des isochrones :', error);
            reject(error);
        });
    });
}

function creerGrillePointsEtAfficherSurCarte(isochrone, pas, map) {
    const bbox = turf.bbox(isochrone.toGeoJSON());
    let grillePoints = [];

    // Générer une grille de points à l'intérieur des bornes
    for (let lon = bbox[0]; lon <= bbox[2]; lon += pas) {
        for (let lat = bbox[1]; lat <= bbox[3]; lat += pas) {
            let point = turf.point([lon, lat]);
            // Vérifier si le point est à l'intérieur de l'isochrone
            if (turf.booleanPointInPolygon(point, isochrone.toGeoJSON())) {
                grillePoints.push([lat, lon]); // Stocker les points valides
                
                // Afficher le point sur la carte
                // L.marker([lat, lon]).addTo(map);
            }
        }
    }

    return grillePoints;
}

async function listerCommunesCouvertesParIsochrone(isochrone) {
    let grillePoints = creerGrillePointsEtAfficherSurCarte(isochrone, 0.005, carte);
    for (let point of grillePoints) {
        const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${point[1]}&lat=${point[0]}`;
        try {
            const response = await fetch(url);
            const dataReverse = await response.json();
            if (dataReverse.features && dataReverse.features.length > 0) {
                const codeINSEE = dataReverse.features[0].properties.citycode;
                codesINSEE.add(codeINSEE);
            } else {
                console.error('Communes couvertes isochrone: aucun résultat trouvé pour le point:', point[0], point[1]);
            }
        } catch (error) {
            console.error('Erreur lors du géocodage du point:', 'lat', point[0], 'lon', point[1], error);
        }
    }

    return Array.from(codesINSEE);
}

async function chargerIsochroneEtListerCommunes() {
    try {
        await fetchIsochrone(carte, {"lat":data.lat,"lon":data.lon,"mode":mode,"time":10});
        codes = null;
        var codes = await listerCommunesCouvertesParIsochrone(currentIsochrone);
        console.log("Codes INSEE des communes touchées:", codes);
        await chargerEtablissements(codes);
    } catch (error) {
        console.error('Erreur:', error);
    }
}

async function chercherCoordonnees(adresse) {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const coords = data.features[0].geometry.coordinates;
            return { lon: coords[0], lat: coords[1] };
        } else {
            console.error('Aucun résultat trouvé pour l\'adresse:', adresse);
            return null;
        }
    } catch (error) {
        console.error('Erreur lors de la recherche des coordonnées:', error);
        return null;
    }
}

// Fonction pour convertir les coordonnées Lambert-93 en WGS84 en utilisant proj4
function lambert93toWGS84(x, y) {
    const lambert93 = "+proj=lcc +lat_1=44 +lat_2=49 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
    const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";

    console.log("Received Lambert-93 coordinates:", x, y);

    // Conversion explicite en nombres
    x = parseFloat(x);
    y = parseFloat(y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        console.error("Invalid Lambert-93 coordinates after conversion:", x, y);
        return { lat: null, lon: null };
    }

    try {
        const [lon, lat] = proj4(lambert93, wgs84, [x, y]);
        console.log("Converted WGS84 coordinates:", { lat, lon });
        return { lat, lon };
    } catch (error) {
        console.error("Error during conversion:", error);
        return { lat: null, lon: null };
    }
}

// Fonction pour charger les établissements
async function chargerEtablissements(codesINSEE) {
    const token = "dd176d5c-6027-319e-8c42-7fc888ab5368"; // Obtenir le token d'accès

    for (const codeINSEE of codesINSEE) {
        console.log('INSEE code:', codeINSEE);
        const urlSirene = `https://api.insee.fr/entreprises/sirene/V3.11/siret?q=codeCommuneEtablissement:${codeINSEE} AND periode(activitePrincipaleEtablissement:86.21Z AND etatAdministratifEtablissement:A)&nombre=1000&date=2024-05-01`;

        const response = await fetch(urlSirene, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`Erreur HTTP : ${response.status} ${codeINSEE}`);
            continue;
        }

        const dataSirene = await response.json();
        var markersByCoord = {};

        var iconSingle = L.icon({
            iconUrl: 'img/pin.png',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });

        var iconMultiple = L.icon({
            iconUrl: 'img/multipin.png',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        });

        function addOrUpdateMarker(lat, lon, infos) {
            if (!lat || !lon) {
                console.log("Coordonnées non disponibles pour l'établissement :", infos);
                return;
            }

            let point = turf.point([lon, lat]);
            if (!(currentIsochrone && turf.booleanPointInPolygon(point, currentIsochrone.toGeoJSON()))) {
                console.log("Point hors de l'isochrone: ", lat, lon);
                return;
            }

            var coordKey = `${lat},${lon}`;
            if (markersByCoord.hasOwnProperty(coordKey)) {
                var markerData = markersByCoord[coordKey];
                var existingPopup = markerData.marker.getPopup();
                markerData.count += 1;
                existingPopup.setContent(existingPopup.getContent() + '<hr>' + infos);
                if (markerData.count > 1) {
                    markerData.marker.setIcon(iconMultiple);
                }
                totalPointsInsideIsochrone += 1;
            } else {
                var marker = L.marker([lat, lon], {icon: iconSingle}).bindPopup(infos).addTo(carte);
                markersByCoord[coordKey] = { marker: marker, count: 1 };
                totalPointsInsideIsochrone += 1;
            }
        }

        if (dataSirene.etablissements && dataSirene.etablissements.length > 0) {
            dataSirene.etablissements.forEach(etablissement => {
                const lambertX = etablissement.adresseEtablissement.coordonneeLambertAbscisseEtablissement;
                const lambertY = etablissement.adresseEtablissement.coordonneeLambertOrdonneeEtablissement;

                if (lambertX > 0 && lambertY > 0) {
                    console.log("Lambert-93 coordinates for establishment:", lambertX, lambertY);

                    // Conversion explicite en nombres
                    let { lat, lon } = lambert93toWGS84(parseFloat(lambertX), parseFloat(lambertY));

                    if (lat !== null && lon !== null) {
                        let infos = `
                            ${etablissement.uniteLegale.nomUniteLegale || ''} ${etablissement.uniteLegale.prenom1UniteLegale || ''}<br>
                            ${etablissement.adresseEtablissement.numeroVoieEtablissement || ''} ${etablissement.adresseEtablissement.typeVoieEtablissement || ''} ${etablissement.adresseEtablissement.libelleVoieEtablissement || ''}<br>
                            ${etablissement.adresseEtablissement.codePostalEtablissement || ''} ${etablissement.adresseEtablissement.libelleCommuneEtablissement || ''}<br>
                            <a href="https://www.koosto.fr/tarifs" target="_blank">
                            <button class="pro-details">Ce professionnel en détail</button>
                            </a> 
                        `;

                        addOrUpdateMarker(lat, lon, infos);
                    }
                }
            });
        }
    }
    finalizeDisplay();
}

async function updateMap() {
    if (!codesINSEE || codesINSEE.size === 0) {
        console.error("Aucun code INSEE disponible pour charger les GeoJSON.");
        return;
    }

    let uniqueIds = new Set(); // Ensemble pour stocker les identifiants uniques
    countTiles = 0; // Compteur pour le nombre de carreaux uniques
    let sumInd = 0; // Somme des valeurs de 'ind' pour les carreaux uniques

    // Supprimer toutes les couches GeoJSON existantes
    carte.eachLayer(layer => {
        if (layer instanceof L.GeoJSON) {
            carte.removeLayer(layer);
        }
    });

    // Charger tous les GeoJSON et les fusionner
    let allFeatures = []; // Pour stocker toutes les caractéristiques de tous les GeoJSON
    for (let codeINSEE of codesINSEE) {
        try {
            const geojsonUrl = `shp_test/${codeINSEE}.geojson`;
            const response = await fetch(geojsonUrl);
            if (!response.ok) {
                console.error(`Erreur lors du chargement des données GeoJSON pour le code INSEE ${codeINSEE}: ${response.status}`);
                continue;
            }
            let dataCarreaux = await response.json();
            allFeatures = allFeatures.concat(dataCarreaux.features); // Fusionner les caractéristiques
        } catch (error) {
            console.error(`Erreur lors du chargement du GeoJSON pour le code INSEE ${codeINSEE}:`, error);
        }
    }

    // Filtrer et traiter toutes les caractéristiques fusionnées
    let filteredFeatures = allFeatures.filter(feature => {
        let idCar = feature.properties.idcar_200m;
        if (!uniqueIds.has(idCar) && turf.intersect(feature.geometry, currentIsochrone.toGeoJSON())) {
            uniqueIds.add(idCar); // Ajouter l'identifiant au Set pour éviter les doublons
            countTiles++; // Incrémenter le compteur pour chaque carreau unique
            sumInd += feature.properties.ind || 0; // Ajouter la valeur de 'ind' à la somme
            return true;
        }
        return false;
    });

    // Créer et ajouter une nouvelle couche GeoJSON avec les caractéristiques filtrées
    // L.geoJSON({type: 'FeatureCollection', features: filteredFeatures}, { 
    //     style: style,
    //     onEachFeature: onEachFeature
    // }).addTo(carte);

    // Afficher le résultat final après le traitement de toutes les caractéristiques
    console.log(`Nombre de carreaux uniques à l'intérieur de l'isochrone: ${countTiles}, Somme de 'ind' pour ces carreaux: ${sumInd}`);
    
    const dataToSend2 = {
        type: 'tilesInsideIsochrone',
        tiles: countTiles,
        pop: sumInd
    };

    console.log(dataToSend2);

    // Send data to the parent window
    window.parent.postMessage(dataToSend2, 'https://www.koosto.fr'); // Replace '*' with the actual origin of the parent for security
    window.parent.postMessage(dataToSend2, 'https://editor.weweb.io');
    // Reset the counter for next use
    countTiles = 0;
    sumInd = 0;

    // Mettre l'isochrone au premier plan après avoir ajouté les carreaux
    if (currentIsochrone) {
        currentIsochrone.bringToFront();
    }
}

function afficherSurCarte(lat, lon, infos) {
}

async function finalizeDisplay() {
    console.log(`Nombre total de points à l'intérieur de l'isochrone : ${totalPointsInsideIsochrone}`);
    const dataToSend = {
        type: 'pointsInsideIsochrone',
        count: totalPointsInsideIsochrone
    };

    console.log(dataToSend);

    // Send data to the parent window
    window.parent.postMessage(dataToSend, 'https://www.koosto.fr'); // Replace '*' with the actual origin of the parent for security
    window.parent.postMessage(dataToSend, 'https://editor.weweb.io');

    // Reset the counter for next use
    totalPointsInsideIsochrone = 0;
}

// testChargerDonnees(); // Ligne à commenter pour la production
