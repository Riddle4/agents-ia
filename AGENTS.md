# AGENTS.md

Contexte permanent pour Codex dans ce projet.

## Produit

Ce projet est un prototype d'automatisation CRM/email pour le Centre de Magie de la Cote, pilote sous la marque Cosmo IA.

Objectif :

- lire les emails entrants Gmail ;
- comprendre la demande client ;
- creer ou retrouver le client ;
- enregistrer le message ;
- creer une tache de suivi si necessaire ;
- generer une proposition de reponse email ;
- laisser un humain valider et traiter la reponse.

Regle importante : le systeme ne doit pas envoyer d'email automatiquement. Il prepare des reponses a valider.

## Stack

- Node.js
- TypeScript via `tsx`
- Express pour le dashboard
- PostgreSQL
- Prisma 7
- OpenAI Responses API
- Gmail IMAP avec `imapflow`
- Google Calendar FreeBusy API

## Commandes Locales

Installer :

```bash
npm install
```

Lancer dashboard + worker :

```bash
npm run dev
```

Dashboard seul :

```bash
npm run dashboard
```

Worker Gmail seul :

```bash
npm run worker
```

Verifier Prisma :

```bash
npx prisma validate
```

Tester l'orchestrateur email :

```bash
npm run test:email
```

Generer un refresh token Google Calendar :

```bash
npx tsx scripts/generate-google-token.ts
```

Si le port 3000 est occupe :

```bash
GOOGLE_TOKEN_PORT=3002 npx tsx scripts/generate-google-token.ts
```

Attention : le redirect URI correspondant doit etre autorise dans Google Cloud.

Depuis l'ajout de la fonctionnalite "Enregistrer un anniversaire", le scope Google Calendar n'est plus seulement readonly. Il faut regenerer le token avec le scope :

```text
https://www.googleapis.com/auth/calendar
```

## Ports

Theraflow peut utiliser `localhost:3000`.

Ce projet peut tourner sur `localhost:3001` via :

```env
PORT=3001
```

dans `.env`.

## Variables D'environnement

Ne jamais afficher les valeurs de `.env`.

Variables importantes :

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `BIRTHDAY_ANALYSIS_MODEL`
- `GMAIL_INFO_USER`
- `GMAIL_INFO_APP_PASSWORD`
- `GMAIL_MAGIELACOTE_USER`
- `GMAIL_MAGIELACOTE_APP_PASSWORD`
- `EMAIL_BATCH_SIZE`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_REFRESH_TOKEN`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`
- `PORT`

## Architecture

Flux principal :

```text
Gmail / Formulaire
  -> Orchestrator
  -> EmailAgent ou FormAgent
  -> processIncomingEmail
  -> Customer / Message / Task / Event services
  -> AI reply generator
  -> Dashboard humain
```

Fichiers importants :

- `src/orchestrator/orchestrator.ts`
- `src/agents/email.agent.ts`
- `src/agents/form.agent.ts`
- `src/workflows/email.workflow.ts`
- `src/services/email-analysis.service.ts`
- `src/services/ai-reply-generator.service.ts`
- `src/services/task.service.ts`
- `src/services/message.service.ts`
- `src/services/calendar.service.ts`
- `src/services/availability.service.ts`
- `scripts/dashboard.ts`
- `scripts/run-email-worker.ts`

## Regles IA

Le systeme utilise une analyse structuree avant la generation de reponse.

Service :

```text
src/services/email-analysis.service.ts
```

Type central :

```ts
type EmailAnalysis = {
  requestType: EmailRequestType
  locationType: EmailLocationType
  shouldCheckCalendar: boolean
  replyMode: ReplyMode
  missingCustomerInfo: string[]
  missingHumanInfo: string[]
  humanQuestion: string | null
  confidence: number
  reasoningSummary: string
}
```

### Regle calendrier

Verifier Google Calendar uniquement si :

```text
requestType = ANNIVERSAIRE
locationType = CENTRE_MAGIE_NYON
shouldCheckCalendar = true
```

Ne pas verifier le calendrier pour :

- stages ;
- cours ;
- ecoles ;
- boutique ;
- animations externes ;
- magicien a domicile ;
- team building ;
- demandes de prix simples ;
- confirmations ou remerciements.

Si Google Calendar echoue, ne pas bloquer tout l'email. Creer quand meme une tache avec une question interne pour la personne qui valide.

### Modes De Reponse

`ANSWER_AND_CLOSE` :

- repondre puis conclure sans question ;
- utile pour confirmations, remerciements, messages complets.

`ANSWER_AND_ASK` :

- repondre puis poser une seule question utile.

`ASK_MISSING_INFO` :

- demander au client les informations indispensables.

`ESCALATE_TO_HUMAN` :

- information interne manquante ;
- ne pas inventer ;
- ne pas transformer une question interne en question client ;
- creer une tache qui signale quoi verifier.
- ne pas generer de reponse client vague du type "nous allons nous renseigner".

Quand `ESCALATE_TO_HUMAN` est detecte, `src/services/task.service.ts` doit creer une section :

```text
--- INFORMATION INTERNE REQUISE ---
```

Le dashboard affiche alors un textarea permettant a l'operateur d'ajouter les informations metier manquantes, puis un bouton :

```text
Generer la reponse IA
```

La route `POST /tasks/:id/generate-reply` appelle `generateReplyForTaskWithHumanInfo`, ajoute une section :

```text
--- INFORMATION FOURNIE PAR L’ÉQUIPE ---
```

puis remplace l'attente interne par une vraie section :

```text
--- RÉPONSE SUGGÉRÉE ---
```

Exemple typique : sortie scolaire / atelier pour eleves demandant description, age recommande, duree, prix ou faisabilite.

## Emails Ignorés

Certains emails automatiques ne doivent pas etre envoyes a l'orchestrateur.

Service :

```text
src/services/ignored-sender.service.ts
```

Table :

```text
IgnoredSender
```

Le dashboard permet d'ajouter ou supprimer des expediteurs ignores. Les emails provenant de ces adresses sont marques comme lus sans generation de reponse IA.

`ads-noreply@google.com` est ignore par defaut, tout comme les patterns automatiques courants (`no-reply`, `noreply`, `do-not-reply`, etc.).

## Signature Email

La signature finale doit toujours etre exactement :

```text
Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
```

Ne pas ajouter :

- `Belle journée`
- `Centre de Magie de la Côte` seul
- `Laurent`
- `Cordialement`
- `Bien à vous`

La fonction `normalizeSignature` dans `src/services/ai-reply-generator.service.ts` nettoie ces doublons.

## Dashboard

Le dashboard est dans :

```text
scripts/dashboard.ts
```

Il est monolithique pour le moment : Express + HTML + CSS inline.

Branding actuel :

- titre : `Cosmo IA`
- sous-titre : `Pilotage intelligent des communications entrantes - Powered by Cosmo`
- logo : `public/cosmo-logo.svg`

Le dashboard liste les taches `TODO`, montre le message client et la reponse IA, puis permet de marquer une tache en `DONE`.

Il contient aussi une section :

```text
Enregistrer un anniversaire
```

Flux :

1. l'humain upload des fichiers PDF/JPG/PNG du formulaire de reservation ;
2. le navigateur convertit les fichiers en base64 et les envoie a `/birthday-reservations/analyze` ;
3. `src/services/birthday-reservation.service.ts` envoie les fichiers a l'API OpenAI Responses avec `input_file` pour les PDF et `input_image` pour les images ;
4. l'IA extrait factuellement variante cochee, preuves visuelles, enfant, age, nombre d'enfants, date, horaires, prix de base et options ;
5. le calcul du total est fait cote code, pas par l'IA ;
6. le resume apparait dans un textarea modifiable avec un bloc de controle extraction ;
7. l'humain clique sur `Approuver et ajouter l'événement` ;
8. `/birthday-reservations/add-event` ajoute l'evenement dans Google Calendar avec le resume valide.

Le modele par defaut pour cette analyse est `process.env.BIRTHDAY_ANALYSIS_MODEL || "gpt-5.5"`. Si l'API n'a pas acces a `gpt-5.5`, configurer `BIRTHDAY_ANALYSIS_MODEL` avec un modele vision fort disponible.

## Documentation

Docs utiles :

- `README.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/operations.md`
- `docs/ai-response-quality.md`

## Etat Git

Le repo local peut contenir :

- un commit local de documentation deja cree mais pas pousse, car l'auth GitHub locale avait echoue ;
- des modifications non committees sur l'amelioration IA ;
- une modification parasite `.DS_Store` a ignorer.

Ne jamais inclure `.DS_Store` dans un commit.

Avant de commit :

```bash
git status -sb
git diff --check
npx prisma validate
```

Stager explicitement les fichiers utiles, jamais `git add -A` si `.DS_Store` est modifie.

## Pieces Jointes

L'analyse des pieces jointes n'est pas encore implementee.

Objectif futur :

- recuperer les pieces jointes Gmail ;
- extraire le texte des PDF, DOCX, images ;
- detecter les formulaires d'inscription ;
- resumer les champs utiles ;
- signaler les champs manquants ;
- utiliser ces informations dans la reponse IA.

Structure cible possible :

```ts
type AttachmentSummary = {
  filename: string
  documentType: "STAGE_REGISTRATION" | "COURSE_REGISTRATION" | "BIRTHDAY_FORM" | "UNKNOWN"
  extractedFields: Record<string, string>
  missingFields: string[]
  summary: string
}
```

## Style De Travail

- Lire le code existant avant de modifier.
- Garder les changements scopes.
- Ne pas exposer les secrets `.env`.
- Preferer des tests locaux simples avant de proposer un push.
- Ne pas envoyer ou declencher d'emails sans validation humaine explicite.
- Pour les changements Git, ignorer `.DS_Store` et stager les fichiers explicitement.
