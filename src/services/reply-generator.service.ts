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

Afin de vous répondre précisément, pourriez-vous me confirmer :
- la date souhaitée
- l’âge de l’enfant
- le lieu de l’anniversaire
- le nombre approximatif d’enfants

Je pourrai ensuite vous indiquer les possibilités et vous transmettre les informations adaptées.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}

function quoteReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Avec plaisir, nous pouvons vous transmettre une proposition adaptée.

Afin de préparer une réponse précise, pourriez-vous me préciser :
- le type d’événement
- la date souhaitée
- le lieu
- le nombre approximatif de participants

Je pourrai ensuite revenir vers vous avec les informations et tarifs correspondants.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}

function courseReply() {
  return `
Bonjour,

Merci beaucoup pour votre message et votre intérêt pour nos cours de magie.

Avec plaisir, je peux vous renseigner.

Pour vous orienter au mieux, pourriez-vous me préciser :
- l’âge de l’enfant
- le niveau actuel en magie, s’il en a déjà fait
- le lieu ou le cours qui vous intéresse
- vos disponibilités éventuelles

Je reviendrai ensuite vers vous avec les possibilités adaptées.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}

function supportReply() {
  return `
Bonjour,

Merci pour votre message.

Je suis désolé d’apprendre qu’il y a eu un souci. Je vais regarder cela attentivement afin de vous répondre au mieux.

Pouvez-vous, si possible, me transmettre quelques précisions complémentaires afin que je puisse traiter votre demande rapidement ?

Je reviens vers vous dès que possible.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}

function availabilityReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Avec plaisir, je vais vérifier les disponibilités pour vous répondre précisément.

Pourriez-vous me confirmer :
- la date souhaitée
- l’horaire idéal
- le type de prestation recherchée
- le nombre de participants

Je pourrai ensuite vous indiquer les options possibles.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}

function generalReply() {
  return `
Bonjour,

Merci beaucoup pour votre message.

Je l’ai bien reçu et je vais revenir vers vous dès que possible avec les informations nécessaires.

Belle journée,

Laurent
Centre de Magie de la Côte
  `.trim()
}