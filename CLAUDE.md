@AGENTS.md

# État du projet — pdf-render (Homa Home)

App Shopify embarquée qui génère des catalogues PDF (et des flipbooks
partageables) à partir des produits de la boutique. C'est la suite du
script CLI original (`~/Downloads/homahome-catalogue-script`), transformé
en vraie app Shopify pour être utilisable depuis l'admin plutôt qu'en
ligne de commande sur un seul Mac.

## Infra / comptes

- **Repo GitHub** : https://github.com/casgiu/pdf-render (public, branche `main`, déploiement auto sur push)
- **Hébergement** : Render, service `pdf-render`, URL prod `https://pdf-render-015q.onrender.com`
  - Déployé via Blueprint (`render.yaml`) — disque persistant `pdf-render-data` monté sur `/data`
  - SQLite (sessions + jobs) : `/data/prod.sqlite`
  - PDF/flipbooks générés : `/data/catalogues/`
  - Variables d'env à vérifier si un déploiement échoue : `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES=read_products`, `DATABASE_URL=file:/data/prod.sqlite`, `CATALOGUE_STORAGE_DIR=/data/catalogues`
- **Shopify Partners** : organisation "Homa Home" (id `224684808`), app "pdf-render" (client_id `c1adf1bf6c6d3295c778c14b9345b327`)
  - Récupérer le secret courant : `shopify app env show` depuis ce dossier
  - Boutique de test créée pour le dev local : `test-gx8s8q1s.myshopify.com`
  - Boutique réelle (cible finale) : `w2543v-77.myshopify.com` (alias affiché : homa-home-2)
  - Distribution : `SingleMerchant` (app privée, pas d'App Store), scope unique `read_products`

## Comment relancer le dev local

```bash
cd ~/Downloads/pdf-render
npm run dev   # = shopify app dev, ouvre un tunnel Cloudflare + preview URL
```
Nécessite d'être connecté au bon compte Shopify (`shopify auth login` déjà fait sur cette machine). Le CLI redemande parfois de choisir une boutique de dev.

## Architecture

- `app/lib/shopify-data.server.js` — GraphQL (collections, produits, metafields → caractéristiques). Utilise `admin.graphql` (session authentifiée), pas de token client_credentials comme l'ancien script.
- `app/lib/images.server.js` — téléchargement + compression JPEG (sharp) des photos produit.
- `app/lib/pdf.server.js` — génération PDF (pdfkit), copié quasi tel quel du script CLI (`pdf.js`).
- `app/lib/catalogue-jobs.server.js` — jobs de génération en tâche de fond (table Prisma `CatalogueJob`), pattern fire-and-forget : la route qui lance le job répond tout de suite, la génération continue côté serveur, l'UI fait du polling.
- `app/lib/flipbook.server.js` — convertit un PDF déjà généré en flipbook HTML autonome (pdftoppm + page-flip, images en base64).
- `app/routes/app._index.jsx` — page principale (liste collections, bouton catalogue complet, historique avec statuts + téléchargement + création de flipbook).
- `app/routes/app.catalogue.start.jsx` / `status.$id.jsx` / `file.$id.jsx` / `flipbook.$id.jsx` — cycle de vie d'un job.
- `app/routes/flipbook.$token.jsx` — page **publique** (pas d'auth Shopify) qui sert le flipbook généré.

## Pièges déjà rencontrés (pour ne pas les refaire)

1. **Téléchargement de fichier dans une app embarquée** : une navigation `<a href>` classique ne passe PAS par le `fetch` patché par `AppProvider` (qui attache le token de session) → 401/bounce OAuth silencieux. Toujours télécharger via `fetch()` côté client + `Blob` + lien `download` synthétique (voir `downloadBlob` dans `app._index.jsx`).
2. **`SHOPIFY_API_KEY` sur Render** doit être EXACTEMENT le client_id de `pdf-render` (`c1adf1bf6c6d3295c778c14b9345b327`). Un mauvais client_id fait planter l'auth avec un 401 sans message clair et redirige vers une autre app existante dans l'org.
3. **`prisma migrate dev`** est interactif et échoue dans un terminal non-interactif dès qu'il y a un warning (ex: ajout de contrainte unique). Dans ce cas : écrire le SQL de migration à la main dans `prisma/migrations/<timestamp>_<nom>/migration.sql`, puis `npx prisma migrate deploy` (non-interactif).
4. **`.env` doit être exclu du build Docker** (`.dockerignore`) sinon la valeur locale de `DATABASE_URL` écrase celle fournie par Render en prod → perte des sessions à chaque déploiement.
5. **`render.yaml`** n'est appliqué automatiquement que via un déploiement "Blueprint" sur Render — un service créé à la main ignore ce fichier. Toute nouvelle variable d'env ajoutée au fichier doit être vérifiée/ajoutée manuellement dans le dashboard Render si le service existe déjà.

## Prochaine étape en attente

Installer l'app sur la vraie boutique `w2543v-77.myshopify.com` (pas seulement la boutique de test) et valider le catalogue complet avec les vraies 7 catégories (Salons, Salle à manger, Chambres, Luminaires, Professionnels, Extérieur, Décorations) et les vrais produits/metafields.

## Idées pour la suite (non commencées)

- Rendre les 7 catégories du catalogue complet configurables depuis l'UI plutôt que codées en dur (`MAIN_MENU_CATEGORIES` dans `shopify-data.server.js`).
- Nettoyage périodique des vieux PDF/flipbooks sur le disque (pas de purge automatique pour l'instant).
