var data;
var lat;
var lon;
var currentIsochrone;
let codesINSEE = new Set();
var codes;
var grillePoints = [];
var mode;
var geojsonData;



var data = {"lat":48,"lon":5,"mode":"driving","time":10};
var lat = data.lat;
var lon = data.lon;



window.addEventListener("message", async function(event) {
    if (!['http://koosto.fr', 'http://editor.weweb.io', 'https://editor.weweb.io', 'https://koosto.fr', 'https://www.koosto.fr'].includes(event.origin)) {
        alert('Origine inconnue : ', event.origin);
        return;
    }
    
    console.log("Reçu : " + event.data);
    try {
        data = JSON.parse(event.data);
        lat = data.lat;
        lon = data.lon;
        console.log(data.mode);
        if (data.mode=="driving") {
            mode = "driving";
        }  else {
            mode = "walking";
        } ;
        
        resetMap(); // Réinitialisez la carte et les données.
        codesINSEE.clear(); // Très important pour ne pas garder les anciens codes INSEE.
        grillePoints = [];
        await chargerIsochroneEtListerCommunes(); // Assurez-vous que cette fonction gère correctement les promesses.


                    fetch('shp/94080.geojson').then(response => response.json()).then(data => {
                        geojsonData = data; // Store the GeoJSON data
                        updateMap(); // Call updateMap here to add the geoJSON to the map as soon as it's loaded
                    }).catch(error => console.error('Error loading the GeoJSON:', error));


                    const legend = L.control({position: 'bottomright'});

                    legend.onAdd = function (carte) {
                        const div = L.DomUtil.create('div', 'legend');
                        const grades = [0,600, 800, 1000, 1500]; // Remplacez par les seuils appropriés pour votre indice
                        const labels = [];

                        // Générez un label avec un carré coloré pour chaque intervalle d'indice
                        for (let i = 0; i < grades.length; i++) {
                        const from = grades[i];
                        const to = grades[i + 1];

                        let color = getColor(from + (to - from) / 2); // Utilisez votre fonction pour obtenir la couleur
                        labels.push(
                            '<i style="background:' + color + '"></i> ' +
                            from + (to ? '&ndash;' + to : '+'));
                        }

                        div.innerHTML = labels.join('<br>');
                        return div;
                    };

                    legend.addTo(carte);

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
            currentIsochrone.bringToFront();
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

    let grillePoints = creerGrillePointsEtAfficherSurCarte(isochrone, 0.005, carte);
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


    async function updateMap() {
        if (!codesINSEE || codesINSEE.size === 0) {
            console.error("Aucun code INSEE disponible pour charger les GeoJSON.");
            return;
        }
    
        // Supprimer les anciennes couches GeoJSON
        carte.eachLayer(layer => {
            if (layer instanceof L.GeoJSON) {
                carte.removeLayer(layer);
            }
        });
    
        // Charger les nouveaux fichiers GeoJSON pour chaque code INSEE
        for (let codeINSEE of codesINSEE) {
            try {
                const geojsonUrl = `shp/${codeINSEE}.geojson`;
                const response = await fetch(geojsonUrl);
                const data = await response.json();
                
                // Ajouter la donnée GeoJSON à la carte
                L.geoJSON(data, { 
                    style: style,
                    onEachFeature: onEachFeature
                }).addTo(carte);
            } catch (error) {
                console.error(`Erreur lors du chargement du GeoJSON pour le code INSEE ${codeINSEE}:`, error);
            }
        }
    }
    
    // Vous pouvez également envisager de déplacer la logique de chargement des GeoJSON dans une fonction séparée pour une meilleure organisation du code
    async function loadGeoJSONForINSEECode(codeINSEE) {
        const geojsonUrl = `shp/${codeINSEE}.geojson`;
        try {
            const response = await fetch(geojsonUrl);
            if (!response.ok) throw new Error(`HTTP status ${response.status}`);
            return await response.json();
        } catch (error) {
            throw error;
        }
    }
    

function onEachFeature(feature, layer) {
  if (feature.properties) {
    // Calculs préliminaires pour éviter de répéter le calcul
    let population = feature.properties.ind || 'Non spécifié';
    let densite = population * 1/0.04;
    let tailleMenage = feature.properties.men ? (population / feature.properties.men).toFixed(2) : 'Non spécifié';
    let revenusIndividus = feature.properties.ind_snv ? (feature.properties.ind_snv / population).toFixed(0) : 'Non spécifié';
    let pauvreteMenages = feature.properties.men_pauv && feature.properties.men ? (feature.properties.men_pauv / feature.properties.men * 100).toFixed(2) + '%' : 'Non spécifié';

    var popupContent = "<div style='font-size: 12px;'>";
    popupContent += "<strong>Code INSEE: </strong>" + feature.properties.lcog_geo + "<br>";
    popupContent += "<strong>Population: </strong>" + population.toFixed(0) + "<br>";
    popupContent += "<strong>Densité : </strong>" + densite.toFixed(0) + " hab/km²<br>";
    popupContent += "<strong>Taille typique d'un ménage: </strong>" + tailleMenage + " pers./ménage<br>";
    popupContent += "<strong>Revenus des individus: </strong>" + revenusIndividus + " €<br>";
    popupContent += "<strong>Pauvreté des ménages: </strong>" + pauvreteMenages + "<br>";
    popupContent += "</div>";

    layer.bindPopup(popupContent);
  }
}


    function getColor(d) {
//   console.log(d); // Afficher la valeur d'indice pour laquelle une couleur est demandée
  return d > 1500 ? '#000099' :
         d > 1000 ? '#1919FF' :
         d > 800 ? '#6666FF' :
         d > 600 ? '#9999FF' :
         d < 601 ? '#E5E5FF' :
                     '#000099'; // Utilisez des seuils appropriés à vos données
}


// Utilisez une fonction similaire pour définir le style de vos entités GeoJSON en fonction de l'indice
function style(feature) {
//   console.log(feature.properties.Ind_snv, feature.properties.Ind); // Afficher les valeurs dans la console
  var indice = feature.properties.ind;
//   console.log(indice); // Afficher le résultat de la division
  return {
    fillColor: getColor(indice),
    weight: 1,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.7
  };
}

function afficherSurCarte(lat, lon, infos) {
    if (lat && lon) {
        L.circleMarker([node.lat, node.lon], {
            radius : 15,
            color  : '#00ffff',
            opacity: 0.75,
          })
            .bindPopup(infos)
            .openPopup();
    } else {
        console.log("Coordonnées non disponibles pour l'établissement :", infos);
    }
}



