# Configuration

Le projet utilise `dotenv`. Les variables sont lues depuis un fichier `.env` a la racine.

Ne commitez jamais `.env`, `token.json` ou `credentials.json`.

## Base De Donnees

### `DATABASE_URL`

URL de connexion PostgreSQL utilisee par Prisma et le pool `pg`.

Exemple de format :

```text
postgresql://user:password@localhost:5432/agents_ia
```

## OpenAI

### `OPENAI_API_KEY`

Cle API OpenAI utilisee pour :

- generer les reponses suggerees ;
- extraire les plages de dates depuis les emails.
- analyser les formulaires d'anniversaire uploades.

Sans cette variable, la generation de reponse echoue.

### `BIRTHDAY_ANALYSIS_MODEL`

Modele OpenAI utilise pour lire les formulaires d'anniversaire PDF/JPG et detecter les cases cochees.

Valeur recommandee :

```text
gpt-5.5
```

Si votre compte API n'a pas acces a ce modele, utilisez un modele vision plus puissant disponible sur votre compte.

## Gmail

Deux boites Gmail sont configurees dans `src/ingestion/gmail.ingestion.ts`.

### `GMAIL_INFO_USER`

Adresse email de la boite `GMAIL_INFO`.

### `GMAIL_INFO_APP_PASSWORD`

Mot de passe d'application Gmail pour la boite `GMAIL_INFO`.

### `GMAIL_MAGIELACOTE_USER`

Adresse email de la boite `GMAIL_MAGIELACOTE`.

### `GMAIL_MAGIELACOTE_APP_PASSWORD`

Mot de passe d'application Gmail pour la boite `GMAIL_MAGIELACOTE`.

## Google Calendar

### `GOOGLE_CLIENT_ID`

Client ID OAuth Google.

### `GOOGLE_CLIENT_SECRET`

Client secret OAuth Google.

### `GOOGLE_CALENDAR_ID`

Identifiant du calendrier utilise par la requete FreeBusy.

### `GOOGLE_REFRESH_TOKEN`

Refresh token OAuth permettant d'interroger Google Calendar sans reconnexion manuelle.

Le scope utilise est :

```text
https://www.googleapis.com/auth/calendar.readonly
```

## Dashboard

### `DASHBOARD_USER`

Nom d'utilisateur Basic Auth pour le dashboard.

### `DASHBOARD_PASSWORD`

Mot de passe Basic Auth pour le dashboard.

### `PORT`

Port optionnel du dashboard Express.

Valeur par defaut :

```text
3000
```

## Exemple De Fichier `.env`

```text
DATABASE_URL="postgresql://user:password@localhost:5432/agents_ia"

OPENAI_API_KEY="sk-..."

GMAIL_INFO_USER="info@example.com"
GMAIL_INFO_APP_PASSWORD="xxxx xxxx xxxx xxxx"
GMAIL_MAGIELACOTE_USER="contact@example.com"
GMAIL_MAGIELACOTE_APP_PASSWORD="xxxx xxxx xxxx xxxx"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALENDAR_ID="..."
GOOGLE_REFRESH_TOKEN="..."

DASHBOARD_USER="admin"
DASHBOARD_PASSWORD="change-me"
PORT="3000"
```

## Verification

Verifier le schema Prisma :

```bash
npx prisma validate
```

Tester une demande email via l'orchestrateur :

```bash
npm run test:email
```

Tester les disponibilites Google Calendar :

```bash
tsx scripts/test-availability.ts
```
