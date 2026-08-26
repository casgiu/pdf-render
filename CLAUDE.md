@AGENTS.md

# Guide de maintenance — PDF Render

## Architecture actuelle

L'application Shopify embarquée génère des catalogues PDF et des flipbooks à partir des produits de la boutique.

- **Web** : React Router sur Render.
- **Base de données** : PostgreSQL Render pour les sessions Shopify, les réglages et les enregistrements `CatalogueJob`.
- **File d'attente** : BullMQ sur Redis Render (`REDIS_URL`).
- **Worker** : `app/worker.server.js`. Il récupère les produits via une session offline Shopify, génère les fichiers et les charge dans R2.
- **Fichiers** : Cloudflare R2 ; aucun disque persistant Render n'est requis.

Pour limiter les coûts pendant les tests, le worker tourne actuellement dans le processus web si `RUN_WORKER_IN_WEB_PROCESS=true`. Plus tard, le démarrer dans un Background Worker Render via `npm run worker` et désactiver cette variable sur le service web.

## Modules importants

- `app/lib/catalogue-jobs.server.js` : création, statut, nettoyage et rétention des jobs.
- `app/lib/job-queue.server.js` : file BullMQ et règles de retry.
- `app/worker.server.js` : exécution et récupération des jobs interrompus.
- `app/lib/object-storage.server.js` : accès Cloudflare R2 compatible S3.
- `app/lib/shopify-data.server.js` : lecture collections, produits et métadonnées Shopify.
- `app/lib/pdf.server.js` : rendu PDF avec pdfkit.
- `app/lib/flipbook.server.js` : conversion PDF vers flipbook HTML.
- `app/routes/app._index.jsx` : écran principal, lancement et historique.

## Variables nécessaires

```text
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL
SCOPES=read_products
DATABASE_URL
REDIS_URL
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY_ID
OBJECT_STORAGE_SECRET_ACCESS_KEY
RUN_WORKER_IN_WEB_PROCESS
```

Les groupes de variables Render doivent être explicitement liés au service. `render.yaml` décrit le service, mais il ne met pas automatiquement à jour un service Render déjà créé hors Blueprint.

## Cycle de vie et rétention

Un catalogue est soit global (`type=full`), soit associé à une collection. Une contrainte PostgreSQL empêche deux jobs actifs pour le même périmètre. Après une génération réussie, les anciens résultats terminés du même périmètre sont supprimés de PostgreSQL et de R2. Le nettoyage de l'historique élimine aussi les doublons créés avant cette règle.

Objets R2 :

```text
catalogues/<shop>/<jobId>.pdf
flipbooks/<shop>/<token>.html
```

Le résultat précédent n'est supprimé qu'après succès du nouveau : une erreur de génération ne supprime donc pas le dernier catalogue valide.

Redis Free peut être vidé lors d'un redémarrage. Les jobs non terminés restent en base PostgreSQL et sont remis en file par le worker au démarrage.

## Commandes

```bash
npm run dev
npm run build
npm run start
npm run worker
npm run setup
npm run lint
npm run typecheck
```

## Pièges à préserver

1. Les imports locaux du worker exécuté directement par Node doivent conserver leur extension `.js` dans la chaîne de modules concernée. Les retirer provoque `ERR_MODULE_NOT_FOUND` en production.
2. Dans l'application Shopify embarquée, les téléchargements passent par `fetch()` puis `Blob` : une simple navigation vers un lien de fichier ne transporte pas nécessairement le jeton de session.
3. Ne pas inclure `.env` dans l'image Docker ; des valeurs locales peuvent autrement écraser les variables Render.
4. Les migrations de production sont appliquées avec `npx prisma migrate deploy`. Pour une migration nécessitant du SQL PostgreSQL spécifique, créer le dossier de migration et son `migration.sql` plutôt que d'utiliser une commande interactive en production.
5. Les objets R2 doivent être privés : les routes authentifiées servent les PDF, tandis que les flipbooks publics utilisent un jeton non devinable.

## Vérifications minimales

Avant de pousser :

```bash
npm run lint
npm run typecheck
npm run build
git diff --check
```

Après un déploiement : vérifier un catalogue de collection, un catalogue complet, le téléchargement du PDF, un flipbook public, les logs du worker et les objets R2.
