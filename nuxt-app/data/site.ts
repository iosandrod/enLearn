import type {
  FaqItem,
  FooterColumn,
  HeroAction,
  MarketingFeature,
  PricingPlan,
  SiteNavItem,
  Testimonial
} from '~/types/content';

export const siteName = 'Hikari';

export const siteDescription =
  'A backend-proxied SaaS starter with auth, dashboard, blog, and docs migrated to Nuxt 3.';

export const publicNav: SiteNavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Docs', href: '/docs' }
];

export const homeHero = {
  eyebrow: 'Nuxt 3 migration',
  title: 'Hikari',
  description:
    'Keep the product flows while routing auth and data access through the backend, with the public site, dashboard, blog, and docs in a Vue-friendly Nuxt app.',
  actions: [
    { label: 'Sign in', href: '/signin', primary: true },
    { label: 'Read the docs', href: '/docs' }
  ] satisfies HeroAction[],
  bullets: [
    'Backend-managed auth',
    'Schema-driven dashboard',
    'Markdown blog and docs',
    'Nuxt 3 public routes'
  ]
};

export const heroStats = [
  { label: 'Framework', value: 'Nuxt 3' },
  { label: 'UI core', value: 'VXE' },
  { label: 'Backend', value: 'Nest API' }
];

export const marketingFeatures: MarketingFeature[] = [
  {
    kicker: 'Auth',
    title: 'Backend sign-in flows',
    description:
      'Email/password authentication and callback handling now go through the Nest backend before reaching the auth provider.'
  },
  {
    kicker: 'Dashboard',
    title: 'Object-driven screens',
    description:
      'Forms and grids are rendered from schema objects, so future screens can be assembled with data instead of copied components.'
  },
  {
    kicker: 'Content',
    title: 'Blog and docs routes',
    description:
      'The original MDX content is read by Nuxt server endpoints and rendered into blog and documentation pages.'
  },
  {
    kicker: 'Billing',
    title: 'Pricing surface preserved',
    description:
      'The plan structure is retained so Stripe-facing work can keep the same conceptual interface.'
  },
  {
    kicker: 'Database',
    title: 'Backend-controlled data access',
    description:
      'Existing tables and auth metadata remain the source of truth, while browser requests use backend business APIs.'
  },
  {
    kicker: 'Migration',
    title: 'Next routes mirrored in Nuxt',
    description:
      'Public routes such as /, /pricing, /blog, and /docs now have Nuxt counterparts.'
  }
];

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Starter',
    description:
      'Kickstart your journey with essential templates and community access.',
    features: [
      'Access to basic template library',
      'Monthly community newsletter',
      'Template exchange forum',
      'Template of the month'
    ],
    monthlyPrice: 900,
    yearlyPrice: 9000
  },
  {
    name: 'Pro',
    description:
      'For teams that need advanced templates and stronger community support.',
    features: [
      'Premium template library',
      'Weekly community digest',
      'Priority forum access',
      'Personalized recommendations',
      'Custom template requests'
    ],
    monthlyPrice: 9900,
    yearlyPrice: 99000,
    featured: true
  },
  {
    name: 'Enterprise',
    description:
      'For organizations that require comprehensive templates and dedicated support.',
    features: [
      'Unlimited access to all templates',
      'Daily template updates',
      'Consulting sessions',
      'Weekly Q&A sessions',
      'Dedicated support'
    ],
    monthlyPrice: 99900,
    yearlyPrice: 999000
  }
];

export const testimonials: Testimonial[] = [
  {
    name: 'dcodesdev',
    title: 'TypeScript Developer',
    avatarFallback: 'DC',
    text: "That's beautiful bro!"
  },
  {
    name: 'SuhailKakar',
    title: 'Developer at joinOnboard',
    avatarFallback: 'SK',
    text: "If you'd built this a few months ago, it would have saved me hours."
  },
  {
    name: 'SaidAitmbarek',
    title: 'Founder of microlaunch.net',
    avatarFallback: 'SA',
    text: 'So cool, looks really clean. Any plan to open source it?'
  },
  {
    name: 'MPlegas',
    title: 'Developer',
    avatarFallback: 'MP',
    text: 'Exceptional!'
  }
];

export const faqItems: FaqItem[] = [
  {
    question: 'Is everything included in the price?',
    answer:
      'Yes. The plan cards describe the complete starter surface without hidden add-ons.'
  },
  {
    question: 'Does the Nuxt app call Supabase directly?',
    answer:
      'No. Browser requests go through Nuxt server routes and the Nest API, which control auth and data access.'
  },
  {
    question: 'Can more screens become low-code?',
    answer:
      'Yes. New forms and tables can use the same schema object pattern as the dashboard.'
  },
  {
    question: 'Can the old Next app stay available?',
    answer:
      'The root scripts now start Nuxt, while the Next scripts remain as backups for reference during migration.'
  }
];

export const footerColumns: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Dashboard', href: '/dashboard' }
    ]
  },
  {
    title: 'Content',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Docs', href: '/docs' },
      { label: 'Quick Start', href: '/docs/quick-start' }
    ]
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/signin' },
      { label: 'Sign up', href: '/signup' },
      { label: 'Settings', href: '/dashboard/settings' }
    ]
  }
];
