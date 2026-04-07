# 📍 GeoInfo Vaud

**GeoInfo** est une application web cartographique interactive et optimisée pour mobile (Progressive Web App - PWA). Son objectif est de fournir rapidement, par un simple clic ou par géolocalisation GPS, des informations administratives, géographiques et judiciaires selon une position exacte.

Si l'application fonctionne partout en Suisse pour l'extraction de base (adresse, lieu-dit, coordonnées), sa logique a été spécialement étudiée et enrichie pour le **Canton de Vaud**, affichant automatiquement la compétence territoriale des corps de métier spécifiques.

---

## ✨ Fonctionnalités

*   **🗺️ Carte Experte** : Navigation fluide, mode Vue Standard / Vue Satellite (Esri), et coordonnées suisses (WGS84 et LV95).
*   **🔎 Géocodage Inversé** : Récupère automatiquement l'adresse, la commune, le district, le lieu-dit exact et le canton grâce à OpenStreetMap.
*   **🚓 Métiers & Juridictions (Vaud)** : L'application détecte intelligemment le territoire pour attribuer le **Ministère Public d'arrondissement** ainsi que la **Police de Région** experte (Police Ouest Lausannois, Région Morges, Riviera, Nord Vaudois, Lausanne, etc.).
*   **📱 Interface PWA (Mobile-First)** :
    *   Design moderne (Dark/Light) avec animations **Skeleton** lors des chargements.
    *   Menu déroulant à tiroir manipulable de façon tactile (*Swipeable Bottom Sheet*).
    *   Totalement installable (Manifest, Service Worker).
*   **📋 Copie rapide** : Appuyez sur n'importe quel bloc d'information pour la copier en toute discrétion (notification visuelle *Toast*).

## 🛠 Technologies
*   **Front-end** : Vanilla JS, HTML5, CSS3 natif pur sans framework excessif.
*   **Cartographie** : **Leaflet.js** avec imageries CartoDB & ArcGIS.
*   **Géo-Recherche** : OpenStreetMap / Nominatim API (y compris les registres *rcrc_ref* vaudois).

## 🚀 Comment lancer le projet

Le projet est entièrement "Client-Side" (statique) et sans Backend externe requis.

1.  Clonez ce dépôt :
    ```bash
    git clone https://github.com/VOTRE-NOM/GeoInfo.git
    cd GeoInfo
    ```
2.  Lancez un simple serveur HTTP local (indispensable pour l'installation progressive PWA et requêtes API) :
    ```bash
    # Via Python (Optionnel)
    python -m http.server 8000
    
    # Ou via Node.js / NPX (Optionnel)
    npx serve
    ```
3.  Ouvrez votre navigateur sur `http://localhost:8000`.

## ⚠️ Avertissements

*   *Données publiques* : Cet outil s'apparente à un projet personnel et expérimental, développé sur la base de données cartographiques et registres publics ouverts (Open Data).
*   *Limitation de responsabilité* : Aucune garantie absolue n'est formulée sur l'exactitude, la fraîcheur des tracés ou la perfection des territoires policiers générés. L'utilisateur utilise les informations de l'outil sous sa propre responsabilité.
