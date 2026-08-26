# PDF Render

Application Shopify embarquée pour générer des catalogues de produits au format PDF et des flipbooks partageables.

## Fonctionnalités

- Génération d'un catalogue pour une collection ou pour l'ensemble de la boutique.
- Thème personnalisable (couleurs, typographie et accroche).
- Création d'un flipbook HTML public depuis un PDF.
- Traitement asynchrone avec reprise des tâches interrompues.
- Conservation d'un seul catalogue final par périmètre : un catalogue complet et un catalogue par collection.

## Architecture

```text
Shopify Admin
     │
     ▼
Application React Router (Render)
     ├── PostgreSQL : sessions Shopify, réglages, historique des jobs
     ├── Redis / BullMQ : file de génération
     └── Worker : Shopify Admin API → génération PDF/flipbook → Cloudflare R2
```

Les fichiers générés ne sont pas conservés sur le disque du serveur : ils sont stockés dans Cloudflare R2.

| Donnée | Emplacement |
| --- | --- |
| Sessions Shopify, réglages, historique | PostgreSQL (Render) |
| File d'attente | Redis (Render Key Value) |
| PDF et flipbooks | Cloudflare R2 |

## Développement local

```bash
npm install
npm run dev
```

`npm run dev` lance `shopify app dev` et ouvre un tunnel de développement. Une application Shopify de développement et une boutique de test sont nécessaires.

## Variables d'environnement

Ne jamais versionner les valeurs réelles dans le dépôt.

```dotenv
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_products

# PostgreSQL
DATABASE_URL=

# Redis
REDIS_URL=

# Cloudflare R2 (API compatible S3)
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=pdf-render
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=

# true par défaut : utile tant que le worker tourne dans le service web
RUN_WORKER_IN_WEB_PROCESS=true

# Observabilité (optionnel) : URL de webhook compatible Slack pour les erreurs critiques.
ERROR_ALERT_WEBHOOK_URL=
```

En production, `DATABASE_URL` doit pointer vers l'URL interne PostgreSQL de Render. Les variables R2 et Redis sont fournies via les groupes de variables liés au service Render.

## Commandes utiles

```bash
npm run dev        # développement Shopify
npm run build      # build de production
npm run start      # serveur web
npm run worker     # worker BullMQ seul
npm run setup      # migrations Prisma en production
npm run lint
npm run typecheck
```

## Déploiement

Le service Render est construit avec Docker. Au démarrage, `npm run setup` applique les migrations Prisma puis le serveur démarre. Pour la phase de test, le worker est lancé dans le même service web lorsque `RUN_WORKER_IN_WEB_PROCESS=true`.

Lorsque le volume de travail le justifiera, créer un service Render Background Worker utilisant `npm run worker`, puis définir `RUN_WORKER_IN_WEB_PROCESS=false` sur le service web. Cela évite que le traitement des PDF concurrence les requêtes de l'interface.

## Stockage et rétention

Les objets R2 suivent cette organisation :

```text
catalogues/<shop>/<jobId>.pdf
flipbooks/<shop>/<token>.html
```

Quand une nouvelle génération réussit, elle remplace la précédente du même périmètre. L'ancien fichier reste disponible pendant la génération ; il est supprimé seulement après succès. L'historique est également nettoyé afin de ne conserver qu'un résultat final par collection, plus un catalogue complet.

Redis Free peut perdre la file au redémarrage. Ce n'est pas une perte définitive : l'état des jobs reste dans PostgreSQL et le worker remet en file les jobs inachevés au démarrage.

## Vérification avant déploiement

```bash
npm run lint
npm run typecheck
npm run build
```

Après le déploiement, vérifier la création d'un catalogue, son téléchargement, la création d'un flipbook et la présence des fichiers correspondants dans R2.

Le point d'entrée public `GET /health` vérifie PostgreSQL, Redis et R2. Il retourne
`200` quand tout est disponible ou `503` avec le détail non sensible de la dépendance
en erreur. Il est déjà déclaré comme health check dans `render.yaml`. Les logs sont
émis au format JSON (faciles à filtrer dans Render) ; renseignez
`ERROR_ALERT_WEBHOOK_URL` avec un webhook compatible Slack pour recevoir les échecs
de jobs, de Redis et de rendu. Les alertes identiques sont regroupées sur cinq minutes.

## Prochaines améliorations techniques

- Exécuter le worker dans un service Render dédié.
- Passer l'image Docker à Node.js 22 avant janvier 2027 (AWS SDK v3 cessera alors de prendre en charge Node.js 20).
- Ajouter des métriques et une politique R2 de nettoyage des objets orphelins.
