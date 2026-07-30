import type { DocsNavGroup } from '~/types/content';

export const docsNavGroups: DocsNavGroup[] = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Introduction', href: '/docs' },
      { label: 'Quick Start', href: '/docs/quick-start' },
      { label: 'Components', href: '/docs/test' }
    ]
  },
  {
    title: 'Configure',
    items: [
      { label: 'Configure your Environment', href: '/docs/configure' },
      { label: 'Supabase', href: '/docs/configure/supabase' },
      { label: 'Supabase Local', href: '/docs/configure/supabase/local' },
      { label: 'Supabase Production', href: '/docs/configure/supabase/supabase' },
      { label: 'Stripe', href: '/docs/configure/stripe' },
      { label: 'Stripe Local', href: '/docs/configure/stripe/local' },
      { label: 'Stripe Production', href: '/docs/configure/stripe/production' },
      { label: 'Vercel', href: '/docs/configure/vercel' }
    ]
  },
  {
    title: 'Storage',
    items: [
      { label: 'Setting up Policies', href: '/docs/storage/setting-up' },
      { label: 'Avatar Upload Example', href: '/docs/storage/example' }
    ]
  },
  {
    title: 'tRPC',
    items: [
      { label: 'Setting up tRPC', href: '/docs/trpc/setup' },
      { label: 'Posts Example', href: '/docs/trpc/example' }
    ]
  }
];
