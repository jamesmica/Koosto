function fetchIsochrone(map, center) {
    var apiKey = 'pk.eyJ1IjoiamFtZXNpdGhlYSIsImEiOiJjbG93b2FiaXEwMnVpMmpxYWYzYjBvOTVuIn0.G2rAo0xl14oye9YVz4eBcw';
    var minutes = 10; // Durée en minutes pour l'isochrone

    alert('lat :',center.lat);
    alert('lon :',center.lon);
    alert('mode :',center.mode);

    var url = `https://api.mapbox.com/isochrone/v1/mapbox/${center.mode}/${center.lon},${center.lat}?contours_minutes=${minutes}&polygons=true&access_token=${apiKey}`;

    fetch(url)
    .then(response => response.json())
    .then(data => {
        // Le premier feature contient les coordonnées de l'isochrone
        var coords = data.features[0].geometry.coordinates[0];
        var latLngs = coords.map(coord => ([coord[1], coord[0]]));

        // Utiliser Leaflet pour tracer l'isochrone sur la carte
        var isochronePolygon = L.polygon(latLngs, {
            color: '#FF0000',
            weight: 2,
            opacity: 0.8,
            fillColor: '#FF0000',
            fillOpacity: 0.35
        }).addTo(map);
    })
    .catch(error => console.log('Erreur lors de la récupération des isochrones :', error));
}

function initialiserCarte() {
    var carte = L.map('maCarte').setView([48.8566, 2.3522], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(carte);
    return carte;
}

// Initialise la carte
var carte = initialiserCarte();











function chargerEtablissements() {
    const codeCommune = document.getElementById('codeCommuneInput').value;
    const activiteEtab = document.getElementById('codeNAF').value;
    if (0===0) {
        const token = '2d4a57e2-c1de-3c24-981c-3309f92d139c'; // Utilisez votre token d'accès
        const urlSirene = `https://api.insee.fr/entreprises/sirene/V3/siret?q=codeCommuneEtablissement:${codeCommune} AND periode(activitePrincipaleEtablissement:${activiteEtab})&date=2024-01-01`;
        
        // Fetch des données SIRENE
        fetch(urlSirene, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            if (data.etablissements && data.etablissements.length > 0) {
                data.etablissements.forEach((etablissement, index) => {
                    // Construisez la variable infos avec les données de l'établissement
                    const infos = `<strong> Unité légale </strong> <br>
                    Sexe : ${etablissement.uniteLegale.sexeUniteLegale} <br> 
                    NOM : ${etablissement.uniteLegale.nomUniteLegale} <br> 
                    Prenom : ${etablissement.uniteLegale.prenom1UniteLegale} <br>
                    Creation UL : ${etablissement.uniteLegale.dateCreationUniteLegale} <br>
                    Activité principale UL : ${etablissement.uniteLegale.activitePrincipaleUniteLegale} <br>
                    Tranche effectif : ${etablissement.uniteLegale.trancheEffectifsUniteLegale} <br>
                    Caractère employeur : ${etablissement.uniteLegale.caractereEmployeurUniteLegale} <br> <br>
                    <strong> Etablissement </strong> <br>
                    Nom établissement : ${etablissement.periodesEtablissement[0].enseigne1Etablissement} <br>
                    Activité principale etab : ${etablissement.periodesEtablissement[0].activitePrincipaleEtablissement} <br>
                    Activité principale registre métier : ${etablissement.activitePrincipaleRegistreMetiersEtablissement} <br>
                    Creation etab : ${etablissement.dateCreationEtablissement} <br>
                    Caractère employeur etablissement : ${etablissement.periodesEtablissement[0].caractereEmployeurEtablissement} <br>
                    Tranche effectif etablissement : ${etablissement.trancheEffectifsEtablissement} <br>
                    Etablissement siège (boolean) : ${etablissement.etablissementSiege}`;

                
                    const adresse = `${etablissement.adresseEtablissement.numeroVoieEtablissement} ${etablissement.adresseEtablissement.typeVoieEtablissement} ${etablissement.adresseEtablissement.libelleVoieEtablissement}, ${etablissement.adresseEtablissement.codePostalEtablissement} ${etablissement.adresseEtablissement.libelleCommuneEtablissement}`;
                    
                    setTimeout(() => {
                        geocoderAdresse(adresse, infos);
                    }, index * 0);
                });
                
            }
        })
        .catch(error => console.error('Erreur :', error));
    } else {
        alert('Veuillez entrer un code de commune.');
    }
}

function geocoderAdresse(adresse, infos) {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`;

    fetch(url)
    .then(response => response.json())
    .then(data => {
        if (data.features && data.features.length > 0) {
            const lat = data.features[0].geometry.coordinates[1];
            const lon = data.features[0].geometry.coordinates[0];
            afficherSurCarte(lat, lon, infos);
        } else {
            console.log('Aucun résultat trouvé pour l\'adresse:', adresse);
        }
    })
    .catch(error => console.error('Erreur de géocodage:', error));
}

function afficherSurCarte(lat, lon, adresse) {
    L.marker([lat, lon]).addTo(carte)
      .bindPopup(adresse)
      .openPopup();
}
