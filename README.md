# Agents IA v1

Prototype d'automatisation CRM pour le Centre de Magie de la Cote.

Le projet ingere des emails Gmail et des formulaires, identifie ou cree les clients, enregistre les messages entrants, cree des taches de suivi et genere des reponses email proposees avec OpenAI. Les reponses ne sont pas envoyees automatiquement : elles sont preparees pour validation humaine dans le dashboard.

## Fonctionnalites

- Ingestion de plusieurs boites Gmail via IMAP.
- Orchestration des entrees `EMAIL` et `FORM`.
- Creation et reutilisation des clients par adresse email.
- Enregistrement des messages entrants avec source, priorite, sentiment et identifiant externe.
- Classification metier des demandes : anniversaire, cours, stage, escape game, boutique, animation externe, team building, etc.
- Creation de taches `TODO` avec priorite et echeance.
- Generation de reponses email proposees via OpenAI.
- Recherche de disponibilites via Google Calendar FreeBusy.
- Dashboard Express protege par Basic Auth pour consulter et cloturer les taches.
- Journalisation des evenements internes.

## Stack

- Node.js
- TypeScript execute avec `tsx`
- PostgreSQL
- Prisma 7 avec `@prisma/adapter-pg`
- OpenAI Responses API
- Gmail IMAP avec `imapflow`
- Parsing email avec `mailparser`
- Google Calendar API
- Express

## Structure

```text
src/
  agents/          Agents specialises pour emails et formulaires
  config/          Style de reponse et contexte de marque
  generated/       Client Prisma genere
  ingestion/       Ingestion Gmail
  lib/             Client Prisma partage
  orchestrator/    Routage des entrees vers les agents
  services/        Services metier, IA, calendrier, taches, messages
  workflows/       Workflow transactionnel principal

scripts/
  dashboard.ts             Dashboard local
  run-email-worker.ts      Worker Gmail periodique
  test-*.ts                Scripts de test manuel
  view-*.ts                Scripts de consultation

prisma/
  schema.prisma            Modele de donnees
  migrations/              Migrations SQL

docs/
  architecture.md          Architecture et flux
  configuration.md         Variables d'environnement
  operations.md            Commandes courantes
```

## Installation

```bash
npm install
```

Le projet attend une base PostgreSQL accessible via `DATABASE_URL`.

## Configuration

Creez un fichier `.env` a la racine du projet. Les variables attendues sont documentees dans [docs/configuration.md](docs/configuration.md).

Variables principales :

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `GMAIL_INFO_USER`
- `GMAIL_INFO_APP_PASSWORD`
- `GMAIL_MAGIELACOTE_USER`
- `GMAIL_MAGIELACOTE_APP_PASSWORD`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_REFRESH_TOKEN`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`

## Base De Donnees

Valider le schema Prisma :

```bash
npx prisma validate
```

Appliquer les migrations :

```bash
npx prisma migrate deploy
```

Generer le client Prisma si necessaire :

```bash
npx prisma generate
```

## Utilisation

Demarrer le dashboard et le worker email en parallele :

```bash
npm run dev
```

Demarrer seulement le dashboard :

```bash
npm run dashboard
```

Demarrer seulement le worker Gmail :

```bash
npm run worker
```

Par defaut, le dashboard ecoute sur `http://localhost:3000`, sauf si `PORT` est defini.

## Scripts Utiles

```bash
npm run test:email
npm run test:gmail
npm run test:form
npm run view:tasks
npm run view:events
```

Ces scripts sont des tests et outils manuels. Il n'y a pas encore de suite de tests automatisee.

## Workflow Fonctionnel

1. Le worker lit les emails non lus dans les boites Gmail configurees.
2. Chaque email est envoye a l'orchestrateur.
3. L'orchestrateur appelle l'agent email.
4. L'agent email detecte si la demande concerne des disponibilites.
5. Si besoin, une plage de dates est extraite puis le calendrier Google est consulte.
6. Le workflow principal cree ou reutilise le client.
7. Le message entrant est enregistre.
8. Le besoin de tache est analyse.
9. Si une tache est necessaire, OpenAI genere une reponse proposee.
10. La tache est visible dans le dashboard pour validation humaine.

## Securite Et Validation Humaine

Le systeme est concu pour assister l'equipe, pas pour envoyer automatiquement des emails. Les messages entrants sont marques avec `requiresHumanValidation: true`, et les reponses generees sont stockees dans les taches comme propositions.

Les prompts interdisent explicitement d'inventer des tarifs, des disponibilites ou de confirmer une reservation.

## Documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Qualite des reponses IA](docs/ai-response-quality.md)
- [Operations](docs/operations.md)
