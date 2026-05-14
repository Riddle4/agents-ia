# Architecture

Ce document decrit l'organisation technique du projet et le flux principal de traitement.

## Vue D'ensemble

Le projet est organise autour d'un orchestrateur, d'agents specialises et de services metier.

```text
Gmail / Formulaire
       |
       v
Orchestrator
       |
       +-- EmailAgent
       +-- FormAgent
       |
       v
Email workflow transactionnel
       |
       +-- Customer service
       +-- Message service
       +-- Task service
       +-- Event service
       +-- AI reply generator
       +-- Calendar / availability services
```

## Orchestrateur

Fichier : `src/orchestrator/orchestrator.ts`

L'orchestrateur recoit une entree typee :

- `EMAIL`
- `FORM`

Il journalise le debut du traitement, delegue au bon agent, puis journalise le resultat ou l'erreur.

## Agents

### EmailAgent

Fichier : `src/agents/email.agent.ts`

Responsabilites :

- lire le contenu de l'email ;
- detecter les demandes de disponibilite par mots-cles ;
- extraire une plage de dates avec OpenAI si necessaire ;
- interroger les disponibilites reelles du calendrier ;
- enrichir l'email avec un contexte IA ;
- appeler le workflow principal.

### FormAgent

Fichier : `src/agents/form.agent.ts`

Responsabilites :

- transformer un formulaire entrant en entree compatible email ;
- ajouter le type de formulaire dans le corps du message ;
- appeler le workflow principal.

## Workflow Principal

Fichier : `src/workflows/email.workflow.ts`

Le workflow `processIncomingEmail` execute les operations importantes dans une transaction Prisma :

1. trouver ou creer le client ;
2. creer le message entrant ;
3. creer un evenement `MESSAGE_RECEIVED` ;
4. analyser si une tache doit etre creee ;
5. creer un evenement `TASK_CREATED` si une tache est creee ;
6. marquer les evenements comme traites.

## Services Metier

### Customers

Fichier : `src/services/customer.service.ts`

Le client est identifie par email. Si aucun client n'existe, le service cree un nouveau client et tente d'extraire prenom et nom depuis la partie locale de l'adresse email.

### Messages

Fichier : `src/services/message.service.ts`

Le service enregistre les messages entrants avec :

- source ;
- direction ;
- sujet ;
- corps ;
- type detecte ;
- priorite ;
- sentiment ;
- validation humaine requise ;
- identifiant externe optionnel.

Un doublon technique peut etre ignore si `source` et `externalId` existent deja.

### Tasks

Fichier : `src/services/task.service.ts`

Le service analyse le besoin de tache, evite de recreer une tache `TODO` identique pour le meme client, genere une reponse suggeree avec OpenAI, puis cree une tache.

La description de la tache contient :

- un resume IA ;
- le message client ;
- la reponse suggeree.

### Task Intelligence

Fichier : `src/services/task-intelligence.service.ts`

L'analyse de tache est basee sur des mots-cles. Elle peut produire notamment :

- `BIRTHDAY_REQUEST`
- `QUOTE_REQUEST`
- `COURSE_REQUEST`
- `SUPPORT_REQUEST`
- `AVAILABILITY_REQUEST`
- `GENERAL`

## Generation De Reponses

Fichier : `src/services/ai-reply-generator.service.ts`

La generation utilise OpenAI avec le modele `process.env.ECHO_REPLY_MODEL || "gpt-5"`.

Avant la generation, le systeme peut recevoir une analyse structuree produite par `src/services/email-analysis.service.ts`. Cette analyse indique le type de demande, le lieu, le mode de reponse attendu, les informations client manquantes et les informations internes a demander a un humain.

Le prompt contient :

- le contexte du Centre de Magie de la Cote ;
- le style de reponse ;
- les contraintes absolues ;
- le template metier ;
- les disponibilites reelles, si disponibles ;
- le mode de reponse attendu ;
- les informations internes a ne pas inventer ;
- le message client ;
- l'analyse interne de la tache.

La reponse est normalisee pour forcer la signature :

```text
Salutations magiques

L'Equipe du Centre de Magie de la Cote
```

## Disponibilites

Fichiers :

- `src/services/email-analysis.service.ts`
- `src/services/date-extractor.service.ts`
- `src/services/calendar.service.ts`
- `src/services/availability.service.ts`

Le systeme consulte Google Calendar uniquement si l'analyse structuree autorise la verification calendrier.

Regle actuelle :

```text
requestType = ANNIVERSAIRE
locationType = CENTRE_MAGIE_NYON
shouldCheckCalendar = true
```

Si cette regle est remplie, le systeme extrait une plage de dates depuis le message client, interroge Google Calendar FreeBusy, puis compare les indisponibilites aux creneaux metier codes en dur.

Creneaux actuellement configures :

- mercredi : 16:00-18:00
- samedi : 10:00-12:00, 13:15-15:15, 15:45-17:45
- dimanche : 10:00-12:00, 13:15-15:15, 15:45-17:45

## Dashboard

Fichier : `scripts/dashboard.ts`

Le dashboard Express affiche les taches `TODO`, triees par priorite et date de creation. Il permet aussi de marquer une tache comme `DONE`.

L'acces est protege par Basic Auth avec `DASHBOARD_USER` et `DASHBOARD_PASSWORD`.

## Modele De Donnees

Fichier : `prisma/schema.prisma`

### Customer

Client final. Relation avec messages et taches.

### Message

Message entrant ou sortant. Le projet utilise actuellement surtout les messages entrants.

### Task

Action a realiser. Les taches sont le point principal de validation humaine.

### Event

Journal technique des evenements internes.

## Limites Actuelles

- Classification par mots-cles, donc sensible aux formulations imprevues.
- Pas de tests automatises.
- Appel OpenAI effectue pendant la transaction Prisma.
- Dashboard monolithique avec HTML/CSS inline.
- Creneaux de disponibilite codes en dur.
- Pas encore de mecanisme d'envoi email controle depuis le dashboard.
- Analyse des pieces jointes pas encore implementee.
