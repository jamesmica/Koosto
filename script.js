var data;
var lat;
var lon;
var currentIsochrone;
let codesINSEE = new Set();
let tousLesMarqueurs = [];




var data = {"lat":48,"lon":5,"mode":"driving","time":10};
var lat = data.lat;
var lon = data.lon;

window.addEventListener("message", function(event) {
    if (!['http://koosto.fr', 'http://editor.weweb.io', 'https://editor.weweb.io', 'https://koosto.fr', 'https://www.koosto.fr'].includes(event.origin)) {
        alert('Origine inconnue : ', event.origin);
        return;
    }
    
    // Effacer tous les marqueurs existants
    if (tousLesMarqueurs) {
        tousLesMarqueurs.forEach(marqueur => marqueur.remove());
        tousLesMarqueurs = []; // Réinitialiser le tableau
    }

    
    alert("Reçu : " + event.data);
    try {
        // Mettre à jour `data` avec les nouvelles valeurs
        data = JSON.parse(event.data);
        lat = data.lat;
        lon = data.lon;
        
        // Appeler les fonctions dépendantes des nouvelles valeurs de `data`, `lat`, et `lon`
    
    fetchIsochrone(carte, data); // Assurez-vous que `carte` est défini correctement avant cet appel
    chargerIsochroneEtListerCommunes(); // Cette fonction doit utiliser `lat` et `lon` indirectement via `data`

    } catch (error) {
        console.error("Erreur lors du traitement de l'événement message:", error);
    }
});


function resetMap() {
    carte.eachLayer((layer) => {
        if (!layer._url) { // Vérifie si la couche n'est pas une couche de tuiles basée sur l'URL
            carte.removeLayer(layer);
        }
    });
}



function initialiserCarte() {
    var carte = L.map('maCarte').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(carte);
    return carte;
}
var carte = initialiserCarte();
function fetchIsochrone(map, center) {
    // console.log('fetchIsochrone(map, center)');
    var apiKey = 'pk.eyJ1IjoiamFtZXNpdGhlYSIsImEiOiJjbG93b2FiaXEwMnVpMmpxYWYzYjBvOTVuIn0.G2rAo0xl14oye9YVz4eBcw';
    var url = `https://api.mapbox.com/isochrone/v1/mapbox/${center.mode}/${center.lon},${center.lat}?contours_minutes=${center.time || 10}&polygons=true&access_token=${apiKey}`;

    // Retourner une promesse qui se résout une fois que l'isochrone est chargé
    return new Promise((resolve, reject) => {
        fetch(url)
        .then(response => response.json())
        .then(data => {
            if (currentIsochrone) {
                currentIsochrone.remove();
            }
            var coords = data.features[0].geometry.coordinates[0];
            var latLngs = coords.map(coord => ([coord[1], coord[0]]));

            currentIsochrone = L.polygon(latLngs, { color: '#FF0000', weight: 2, opacity: 0.8, fillColor: '#ffffff', fillOpacity: 0.01 }).addTo(map);
            // console.log(currentIsochrone); 
            map.setView([center.lat, center.lon], 13);
            resolve(currentIsochrone); // Résoudre la promesse avec l'isochrone
        })
        .catch(error => {
            console.log('Erreur lors de la récupération des isochrones :', error);
            reject(error); // Rejeter la promesse en cas d'erreur
        });
    });
}


function creerGrillePointsEtAfficherSurCarte(isochrone, pas, map) {
    // console.log('creerGrillePointsEtAfficherSurCarte(isochrone, pas, map)');
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
    let grillePoints = creerGrillePointsEtAfficherSurCarte(currentIsochrone, 0.005, carte);
    for (let point of grillePoints) {
        const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${point[1]}&lat=${point[0]}`;
        try {
            const response = await fetch(url);
            const dataReverse = await response.json();
            if (dataReverse.features && dataReverse.features.length > 0) {
                const codeINSEE = dataReverse.features[0].properties.citycode;
                codesINSEE.add(codeINSEE);
                // Ne pas retourner ici, continuez à collecter les codes INSEE
            } else {
                console.error('Communes couvertes isochrone: aucun résultat trouvé pour le point:', point[0], point[1]);
                // Ne pas retourner ici, continuez à traiter les autres points
            }
        } catch (error) {
            console.error('Erreur lors du géocodage du point:', 'lat', point[0], 'lon', point[1], error);
            // Ne pas retourner ici, continuez à traiter les autres points
        }
    }

    // Retournez tous les codes INSEE collectés après avoir traité tous les points
    return Array.from(codesINSEE);
}


async function chargerIsochroneEtListerCommunes() {
    try {
        await fetchIsochrone(carte, {"lat":data.lat,"lon":data.lon,"mode":"driving","time":10});
        const codes = await listerCommunesCouvertesParIsochrone(currentIsochrone);
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
            // Les coordonnées sont retournées sous la forme [longitude, latitude]
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


async function chargerEtablissements(codesINSEE) {
    const token = '354c9f77-e707-378c-b65c-b8b3e48d3da5'; // Utilisez votre token d'accès
    console.log('codes INSEE ',codesINSEE);
    for (const codeINSEE of codesINSEE) {
        console.log('insee sirene :',codeINSEE);
        const urlSirene = `https://api.insee.fr/entreprises/sirene/V3.11/siret?q=codeCommuneEtablissement:${codeINSEE} AND periode(activitePrincipaleEtablissement:86.21Z)&nombre=100`;

        const response = await fetch(urlSirene, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`Erreur HTTP : ${response.status} ${codeINSEE}`);
        }
        
        // Vérifiez le type de contenu avant de parser en JSON
        // const contentType = response.headers.get('content-type');
        // if (!contentType || !contentType.includes('application/json')) {
        //     console.error("La réponse n'est pas du JSON :", await response.text());
        //     return;
        // }
        
        const dataSirene = await response.json();
            console.log(dataSirene);

            if (dataSirene.etablissements && dataSirene.etablissements.length > 0) {
                dataSirene.etablissements.forEach(etablissement => {
                    if (etablissement.adresseEtablissement.coordonneeLambertAbscisseEtablissement>0) {
                        console.log(etablissement.adresseEtablissement.coordonneeLambertAbscisseEtablissement);
                        const infos = `<strong>Établissement</strong><br>
                        Nom : ${etablissement.uniteLegale.nomUniteLegale} ${etablissement.uniteLegale.prenom1UniteLegale}<br>
                        Activité Principale : ${etablissement.periodesEtablissement[0].activitePrincipaleEtablissement}<br>
                        Adresse : ${etablissement.adresseEtablissement.numeroVoieEtablissement} ${etablissement.adresseEtablissement.typeVoieEtablissement} ${etablissement.adresseEtablissement.libelleVoieEtablissement}, ${etablissement.adresseEtablissement.codePostalEtablissement} ${etablissement.adresseEtablissement.libelleCommuneEtablissement}<br>
                        Adresse : ${etablissement.adresseEtablissement.coordonneeLambertAbscisseEtablissement}<br>
                        SIREN : ${etablissement.siret}`;
                        // Utiliser l'adresse géocodée si disponible ou géocoder l'adresse
                        afficherSurCarte(
                            etablissement.adresseEtablissement.coordonneeLambertAbscisseEtablissement,
                            etablissement.adresseEtablissement.coordonneeLambertOrdonneeEtablissement,
                            infos
                        );
                    }

                });
            }
        }
    }

    function afficherSurCarte(lat, lon, infos) {
        if (lat && lon) {
            const marqueur = L.marker([lat, lon]).addTo(carte)
                .bindPopup(infos)
                .openPopup();
            tousLesMarqueurs.push(marqueur);
        } else {
            console.log("Coordonnées non disponibles pour l'établissement :", infos);
        }
    }

    

