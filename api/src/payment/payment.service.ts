import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type Stripe from 'stripe';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { createSupabaseClient, getCurrentUser } from '../common/utils/supabase';
import {
  calculateTrialEndUnixTimestamp,
  getAppUrl,
  getStripeClient
} from '../common/utils/stripe';

type PostData = Record<string, unknown>;

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback) {
    return fallback;
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function readNumber(value: unknown, name: string, fallback?: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof fallback === 'number') {
    return fallback;
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

@Injectable()
export class PaymentService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'listPlans':
        return this.listPlans();
      case 'getSubscription':
        return this.getSubscription(context);
      case 'createCheckoutSession':
        return this.createCheckoutSession(postData, context);
      case 'createBillingPortal':
        return this.createBillingPortal(postData, context);
      default:
        throw new BadRequestException(`Unsupported payment method: ${method}`);
    }
  }

  private async listPlans() {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase
      .from('products')
      .select('*, prices(*)')
      .eq('active', true)
      .eq('prices.active', true)
      .order('metadata->index')
      .order('unit_amount', { referencedTable: 'prices' });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private async getSubscription(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const { data, error } = await client
      .from('subscriptions')
      .select(
        `
        *,
        prices (
          *,
          products (*)
        )
      `
      )
      .eq('user_id', user.id)
      .in('status', ['trialing', 'active'])
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? null;
  }

  private async createCheckoutSession(postData: PostData, context: ServiceContext) {
    const { user } = await getCurrentUser(context);
    const stripe = getStripeClient();
    const supabase = createSupabaseClient('admin', context);

    const priceId = readString(postData.priceId, 'priceId');
    const quantity = readNumber(postData.quantity, 'quantity', 1);
    const successUrl = readString(
      postData.successUrl,
      'successUrl',
      getAppUrl('/dashboard/account')
    );
    const cancelUrl = readString(
      postData.cancelUrl,
      'cancelUrl',
      getAppUrl('/pricing')
    );

    const { data: price, error: priceError } = await supabase
      .from('prices')
      .select('*, products(*)')
      .eq('id', priceId)
      .maybeSingle();

    if (priceError || !price) {
      throw new NotFoundException(
        priceError?.message ?? `Price not found: ${priceId}`
      );
    }

    const customerId = await this.createOrRetrieveCustomer({
      supabase,
      stripe,
      userId: user.id,
      email: user.email ?? ''
    });

    const params: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer: customerId,
      customer_update: {
        address: 'auto'
      },
      line_items: [
        {
          price: price.id,
          quantity
        }
      ],
      cancel_url: cancelUrl,
      success_url: successUrl
    };

    if (price.type === 'recurring') {
      params.mode = 'subscription';
      params.subscription_data = {
        trial_end: calculateTrialEndUnixTimestamp(price.trial_period_days)
      };
    } else {
      params.mode = 'payment';
    }

    const session = await stripe.checkout.sessions.create(params);

    return {
      sessionId: session.id,
      url: session.url,
      customerId
    };
  }

  private async createBillingPortal(
    postData: PostData,
    context: ServiceContext
  ) {
    const { user } = await getCurrentUser(context);
    const stripe = getStripeClient();
    const supabase = createSupabaseClient('admin', context);
    const returnUrl = readString(
      postData.returnUrl,
      'returnUrl',
      getAppUrl('/dashboard/account')
    );

    const customerId = await this.createOrRetrieveCustomer({
      supabase,
      stripe,
      userId: user.id,
      email: user.email ?? ''
    });

    const { url } = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    if (!url) {
      throw new BadRequestException('Could not create billing portal session.');
    }

    return {
      url,
      customerId
    };
  }

  private async createOrRetrieveCustomer({
    supabase,
    stripe,
    userId,
    email
  }: {
    supabase: ReturnType<typeof createSupabaseClient>;
    stripe: ReturnType<typeof getStripeClient>;
    userId: string;
    email: string;
  }) {
    const { data: existingCustomer, error: lookupError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (lookupError) {
      throw new BadRequestException(lookupError.message);
    }

    let stripeCustomerId = existingCustomer?.stripe_customer_id ?? '';

    if (stripeCustomerId) {
      const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);
      if (typeof stripeCustomer === 'string') {
        stripeCustomerId = stripeCustomer;
      } else {
        stripeCustomerId = stripeCustomer.id;
      }
    } else {
      const stripeCustomers = await stripe.customers.list({ email });
      stripeCustomerId =
        stripeCustomers.data.length > 0 ? stripeCustomers.data[0].id : '';
    }

    if (!stripeCustomerId) {
      const createdCustomer = await stripe.customers.create({
        email,
        metadata: { supabaseUUID: userId }
      });
      stripeCustomerId = createdCustomer.id;
    }

    if (existingCustomer) {
      if (existingCustomer.stripe_customer_id !== stripeCustomerId) {
        const { error: updateError } = await supabase
          .from('customers')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', userId);

        if (updateError) {
          throw new BadRequestException(updateError.message);
        }
      }
    } else {
      const { error: insertError } = await supabase.from('customers').insert({
        id: userId,
        stripe_customer_id: stripeCustomerId
      });

      if (insertError) {
        throw new BadRequestException(insertError.message);
      }
    }

    return stripeCustomerId;
  }
}
