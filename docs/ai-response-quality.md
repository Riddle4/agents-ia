# Qualite Des Reponses IA

Ce document decrit les garde-fous ajoutes pour ameliorer les reponses generees par l'IA.

## Objectifs

Les problemes traites sont :

- eviter les verifications calendrier trop frequentes ;
- permettre a l'IA de conclure sans poser une question inutile ;
- distinguer les informations a demander au client des informations a demander a un humain ;
- preparer une future analyse des pieces jointes.

## Analyse Structuree

Fichier : `src/services/email-analysis.service.ts`

Avant de verifier le calendrier ou de rediger une reponse, le systeme produit une analyse structuree :

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

Cette analyse est transmise dans `email.aiContext.emailAnalysis`.

## Regle Calendrier

Le calendrier ne doit etre consulte que dans un cas precis :

```text
requestType = ANNIVERSAIRE
locationType = CENTRE_MAGIE_NYON
shouldCheckCalendar = true
```

Donc le calendrier n'est pas consulte pour :

- stages ;
- cours ;
- demandes d'inscription ;
- animations externes ;
- magicien a domicile ;
- team building ;
- boutique ;
- simples demandes de prix ;
- confirmations ou remerciements.

Il existe aussi un garde-fou cote code : meme si l'IA renvoie `shouldCheckCalendar: true`, la valeur est forcee a `false` si la demande n'est pas un anniversaire dans les locaux du Centre de Magie de la Cote a Nyon.

## Modes De Reponse

Le champ `replyMode` guide la redaction.

### `ANSWER_AND_CLOSE`

L'IA doit repondre puis conclure sans poser de question.

Exemples :

- message de remerciement ;
- confirmation simple ;
- document bien recu ;
- information suffisante ne demandant pas de suite.

### `ANSWER_AND_ASK`

L'IA peut poser une question utile au client, mais une seule, et seulement si elle fait avancer le traitement.

### `ASK_MISSING_INFO`

Une information indispensable manque cote client. L'IA doit poser uniquement les questions necessaires.

### `ESCALATE_TO_HUMAN`

Une information interne manque. L'IA ne doit pas demander cette information au client et ne doit pas l'inventer.

Exemples :

- tarif non connu ;
- decision commerciale ;
- cas sensible ;
- disponibilite ambiguë ;
- regle metier absente.

Dans ce cas, la tache contient une section :

```text
Informations internes manquantes
Question interne
```

La personne qui valide l'email peut alors completer ou adapter la reponse.

## Reponses Sans Question Finale

Le prompt de redaction precise maintenant :

- ne pas terminer par une question automatique ;
- ne guider vers une prochaine etape que si elle est necessaire ;
- respecter `ANSWER_AND_CLOSE` quand aucune suite client n'est requise.

## Pieces Jointes

L'analyse des pieces jointes n'est pas encore implementee.

Architecture recommandee pour la suite :

1. recuperer les pieces jointes pendant l'ingestion Gmail ;
2. extraire le texte selon le type de fichier ;
3. produire un resume structure ;
4. transmettre ce resume dans `aiContext` ;
5. utiliser les champs extraits pour rediger une reponse plus precise.

Exemple de structure cible :

```ts
type AttachmentSummary = {
  filename: string
  documentType: "STAGE_REGISTRATION" | "COURSE_REGISTRATION" | "BIRTHDAY_FORM" | "UNKNOWN"
  extractedFields: Record<string, string>
  missingFields: string[]
  summary: string
}
```

