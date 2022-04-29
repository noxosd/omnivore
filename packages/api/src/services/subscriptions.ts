import { Subscription } from '../entity/subscription'
import { getRepository } from '../entity/utils'
import { SubscriptionStatus } from '../generated/graphql'
import { sendEmail } from '../utils/sendEmail'
import axios from 'axios'

const sendUnsubscribeEmail = async (
  unsubscribeMailTo: string,
  newsletterEmail: string
): Promise<void> => {
  const sent = await sendEmail({
    to: unsubscribeMailTo,
    subject: 'Unsubscribe',
    text: `This message was automatically generated by Omnivore.`,
    from: newsletterEmail,
  })

  if (!sent) {
    throw new Error(`Failed to unsubscribe, email: ${unsubscribeMailTo}`)
  }
}

const sendUnsubscribeHttpRequest = async (url: string): Promise<void> => {
  const response = await axios.get(url)

  if (response.status !== 200) {
    throw new Error(`Failed to unsubscribe, response: ${response.statusText}`)
  }
}

export const saveSubscription = async (
  userId: string,
  name: string,
  newsletterEmail: string,
  unsubscribeMailTo?: string,
  unsubscribeHttpUrl?: string
): Promise<Subscription> => {
  const subscription = await getRepository(Subscription).findOneBy({
    name,
    user: { id: userId },
  })

  if (subscription) {
    // if subscription already exists, updates updatedAt
    subscription.status = SubscriptionStatus.Active
    subscription.newsletterEmail = newsletterEmail
    unsubscribeMailTo && (subscription.unsubscribeMailTo = unsubscribeMailTo)
    unsubscribeHttpUrl && (subscription.unsubscribeHttpUrl = unsubscribeHttpUrl)
    return getRepository(Subscription).save(subscription)
  }

  // create new subscription
  return getRepository(Subscription).save({
    name,
    newsletterEmail,
    user: { id: userId },
    status: SubscriptionStatus.Active,
    unsubscribeHttpUrl,
    unsubscribeMailTo,
  })
}

export const unsubscribe = async (
  subscription: Subscription
): Promise<Subscription> => {
  if (subscription.unsubscribeMailTo) {
    // unsubscribe by sending email first
    await sendUnsubscribeEmail(
      subscription.unsubscribeMailTo,
      subscription.newsletterEmail
    )
  } else if (subscription.unsubscribeHttpUrl) {
    // unsubscribe by sending http request if no unsubscribeMailTo
    await sendUnsubscribeHttpRequest(subscription.unsubscribeHttpUrl)
  } else {
    throw new Error('No unsubscribe method defined')
  }

  // set status to unsubscribed
  subscription.status = SubscriptionStatus.Unsubscribed
  return getRepository(Subscription).save(subscription)
}

export const unsubscribeAll = async (
  userId: string,
  newsletterEmail: string
): Promise<void> => {
  try {
    const subscriptions = await getRepository(Subscription).find({
      where: {
        user: { id: userId },
        status: SubscriptionStatus.Active,
        newsletterEmail,
      },
    })

    for (const subscription of subscriptions) {
      try {
        await unsubscribe(subscription)
      } catch (error) {
        console.log('Failed to unsubscribe', error)
      }
    }
  } catch (error) {
    console.log('Failed to unsubscribe all', error)
  }
}