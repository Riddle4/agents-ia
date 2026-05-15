import type { SmartTaskDecision } from "./task-intelligence.service"

type GenerateReplyInput = {
  fromEmail: string
  subject: string
  body: string
  decision: SmartTaskDecision
}

export function generateSuggestedReply(input: GenerateReplyInput) {
  switch (input.decision.taskType) {
    case "BIRTHDAY_REQUEST":
      return birthdayReply()

    case "QUOTE_REQUEST":
      return quoteReply()

    case "COURSE_REQUEST":
      return courseReply()

    case "SUPPORT_REQUEST":
      return supportReply()

    case "AVAILABILITY_REQUEST":
      return availabilityReply()

    default:
      return generalReply()
  }
}

function birthdayReply() {
  return `
Bonjour,

Merci beaucoup pour votre message et votre intérêt pour nos anniversaires magiques ✨

Nous serions ravis de vous aider à organiser un moment magique pour votre enfant.

Pour pouvoir vous répondre précisément, pourriez-vous nous confirmer :
- la date souhaitée
- l’âge de l’enfant
- le lieu de l’anniversaire
- le nombre approximatif d’enfants

Nous pourrons ensuite vous indiquer les possibilités et vous transmettre les informations adaptées.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}

function quoteReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Avec plaisir, nous pouvons vous transmettre une proposition adaptée.

Pour préparer une réponse précise, pourriez-vous nous préciser :
- le type d’événement
- la date souhaitée
- le lieu
- le nombre approximatif de participants

Nous pourrons ensuite revenir vers vous avec les informations et tarifs correspondants.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}

function courseReply() {
  return `
Bonjour,

Merci beaucoup pour votre message et votre intérêt pour nos cours de magie.

Avec plaisir, nous pouvons vous renseigner.

Pour vous orienter au mieux, pourriez-vous nous préciser :
- l’âge de l’enfant
- le niveau actuel en magie, s’il en a déjà fait
- le lieu ou le cours qui vous intéresse
- vos disponibilités éventuelles

Nous reviendrons ensuite vers vous avec les possibilités adaptées.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}

function supportReply() {
  return `
Bonjour,

Merci pour votre message.

Nous sommes désolés d’apprendre qu’il y a eu un souci. Nous allons regarder cela attentivement afin de vous répondre au mieux.

Pouvez-vous, si possible, nous transmettre quelques précisions complémentaires afin que nous puissions traiter votre demande rapidement ?

Nous revenons vers vous dès que possible.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}

function availabilityReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Avec plaisir, nous allons vérifier les disponibilités pour vous répondre précisément.

Pourriez-vous nous confirmer :
- la date souhaitée
- l’horaire idéal
- le type de prestation recherchée
- le nombre de participants

Nous pourrons ensuite vous indiquer les options possibles.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}

function generalReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Nous l’avons bien reçu et nous reviendrons vers vous dès que possible avec les informations nécessaires.

Salutations magiques 💫

L’Equipe du Centre de Magie de la Côte
  `.trim()
}
