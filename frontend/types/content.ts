export interface SiteNavItem {
  label: string;
  href: string;
}

export interface HeroAction {
  label: string;
  href: string;
  primary?: boolean;
}

export interface MarketingFeature {
  title: string;
  description: string;
  kicker: string;
}

export interface PricingPlan {
  name: string;
  description: string;
  features: string[];
  monthlyPrice: number;
  yearlyPrice: number;
  featured?: boolean;
}

export interface Testimonial {
  name: string;
  title: string;
  text: string;
  avatarFallback: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FooterColumn {
  title: string;
  links: SiteNavItem[];
}

export interface ContentHeading {
  depth: number;
  id: string;
  text: string;
}

export interface ContentSummary {
  slug: string;
  href: string;
  title: string;
  description: string;
  date?: string;
  author?: string;
  excerpt?: string;
}

export interface RenderedContent extends ContentSummary {
  bodyHtml: string;
  toc: ContentHeading[];
}

export interface DocsNavGroup {
  title: string;
  items: SiteNavItem[];
}
