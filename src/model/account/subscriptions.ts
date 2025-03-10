import * as _ from 'lodash';
import { reportError } from '../../errors';
import { delay, doWhile } from '../../util/promise';

// Intari
export const ACCOUNTS_API = process.env.ACCOUNTS_API ??
    `https://httptoolkitmgmnt.viorsan.com/api`;

export interface SubscriptionPlan {
    paddleId: number;
    name: string;
    prices?: {
        currency: string;
        monthly: string;
        total: string;
    } | 'priceless';
}

export const SubscriptionPlans = {
    'pro-monthly': { paddleId: 550380, name: 'Pro (monthly)' } as SubscriptionPlan,
    'pro-annual': { paddleId: 550382, name: 'Pro (annual)' } as SubscriptionPlan,
    'pro-perpetual': { paddleId: 599788, name: 'Pro (perpetual)', prices: 'priceless' } as SubscriptionPlan,
    'team-monthly': { paddleId: 550789, name: 'Team (monthly)' } as SubscriptionPlan,
    'team-annual': { paddleId: 550788, name: 'Team (annual)' } as SubscriptionPlan,
};

async function loadPlanPrices() {
    const response = await fetch(
        `${ACCOUNTS_API}/get-prices?product_ids=${
            Object.values(SubscriptionPlans)
            .filter(plan => !plan.prices)
            .map(plan => plan.paddleId)
            .join(',')
        }`
    );

    if (!response.ok) {
        console.log(response);
        throw new Error(`Failed to look up prices, got ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
        console.log(data);
        throw new Error("Price lookup request was unsuccessful");
    }

    const productPrices = data.response.products as Array<{
        product_id: number,
        currency: string,
        price: { net: number },
        subscription: { interval: string }
    }>;

    productPrices.forEach((productPrice) => {
        const plan = _.find(SubscriptionPlans,
            { paddleId: productPrice.product_id }
        ) as SubscriptionPlan | undefined;

        if (!plan) return;

        const currency = productPrice.currency;
        const totalPrice = productPrice.price.net;
        const monthlyPrice = productPrice.subscription.interval === 'year'
            ? totalPrice / 12
            : totalPrice;

        plan.prices = {
            currency: currency,
            total: formatPrice(currency, totalPrice),
            monthly: formatPrice(currency, monthlyPrice)
        };
    });
}

// Async load all plan prices, repeatedly, until it works
doWhile(
    // Do: load the prices, with a timeout
    () => Promise.race([
        loadPlanPrices().catch(reportError),
        delay(5000) // 5s timeout
    ]).then(() => delay(1000)), // Limit the frequency

    // While: if any subs didn't successfully get data, try again:
    () => _.some(SubscriptionPlans, (plan) => !plan.prices),
);


function formatPrice(currency: string, price: number) {
    return Number(price).toLocaleString(undefined, {
        style:"currency",
        currency: currency,
        minimumFractionDigits: _.round(price) === price ? 0 : 2,
        maximumFractionDigits: 2
    })
}

export type SKU = keyof typeof SubscriptionPlans;

export const getSKU = (paddleId: number | undefined) =>
    _.findKey(SubscriptionPlans, { paddleId: paddleId }) as SKU | undefined;

export const getCheckoutUrl = (email: string, sku: SKU) =>
    `${ACCOUNTS_API}/redirect-to-checkout?email=${
        encodeURIComponent(email)
    }&sku=${
        sku
    }&source=app.httptoolkit.tech&returnUrl=${
        encodeURIComponent('https://httptoolkit.com/app-purchase-thank-you/')
    }`;

export const openCheckout = async (email: string, sku: SKU) => {
    window.open(getCheckoutUrl(email, sku), '_blank');
}