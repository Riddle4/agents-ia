# Operations

Ce document regroupe les commandes et gestes utiles pour utiliser le projet localement.

## Demarrage

Installer les dependances :

```bash
npm install
```

Valider la configuration Prisma :

```bash
npx prisma validate
```

Demarrer dashboard et worker email :

```bash
npm run dev
```

## Dashboard

Commande :

```bash
npm run dashboard
```

URL par defaut :

```text
http://localhost:3000
```

L'acces demande les identifiants `DASHBOARD_USER` et `DASHBOARD_PASSWORD`.

Le dashboard permet de :

- consulter les taches `TODO` ;
- lire le message client ;
- lire la reponse suggeree ;
- marquer une tache comme `DONE`.

## Worker Email

Commande :

```bash
npm run worker
```

Comportement :

- verifie les boites Gmail toutes les 2 minutes ;
- lit les emails non lus ;
- traite au maximum 5 emails par boite et par cycle ;
- ignore certains emails automatiques ;
- marque un email comme lu uniquement si le traitement reussit.

## Scripts De Test Manuel

Tester le flux orchestrateur email :

```bash
npm run test:email
```

Tester l'ingestion Gmail :

```bash
npm run test:gmail
```

Tester le flux formulaire :

```bash
npm run test:form
```

Afficher les taches :

```bash
npm run view:tasks
```

Afficher les evenements :

```bash
npm run view:events
```

Tester les disponibilites :

```bash
tsx scripts/test-availability.ts
```

## Base De Donnees

Appliquer les migrations en environnement cible :

```bash
npx prisma migrate deploy
```

Creer une migration en developpement apres modification du schema :

```bash
npx prisma migrate dev --name nom_de_la_migration
```

Regenerer le client Prisma :

```bash
npx prisma generate
```

## Points A Surveiller

- Les appels OpenAI necessitent `OPENAI_API_KEY`.
- Les disponibilites necessitent un refresh token Google valide.
- Le worker marque les emails comme lus apres traitement reussi.
- Les reponses sont des suggestions : aucune reponse n'est envoyee automatiquement.
- Les emails sont dedoublonnes par couple `source` + `externalId`.

## Depannage Rapide

### `DATABASE_URL est manquante`

Verifier que `.env` existe et contient `DATABASE_URL`.

### `OPENAI_API_KEY manquante dans .env`

Ajouter `OPENAI_API_KEY` ou eviter les scripts qui generent une reponse IA.

### `GOOGLE_REFRESH_TOKEN manquant`

Regenerer ou renseigner le refresh token Google.

### Dashboard inaccessible

Verifier :

- que `npm run dashboard` tourne ;
- le port utilise ;
- les variables `DASHBOARD_USER` et `DASHBOARD_PASSWORD`.

