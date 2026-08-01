const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-ChtNaXUk.js","assets/vue.runtime.esm-bundler-BmNzlVHg.js","assets/index.esm-BSc9TXjN.js","assets/_plugin-vue_export-helper-BDNMzG2s.js","assets/preload-helper-Czpn1I53.js","assets/index-C6fwkMkB.css"])))=>i.map(i=>d[i]);
import{it as e,k as t,m as n,ut as r}from"./vue.runtime.esm-bundler-BmNzlVHg.js";import{t as i}from"./preload-helper-Czpn1I53.js";var a=`---\r
title: Complete Setup Guide for Hikari, a Nextjs Starter\r
description: Setup your app in 10 minutes!\r
date: 2024-08-03\r
author: Antoine Ross\r
---\r
\r
Hikari is a powerful, feature-rich Next.js SaaS starter designed to accelerate your development process. This guide will walk you through setting up Hikari, including its Supabase backend and Stripe integration.\r
\r
## Key Features\r
\r
- **Next.js 14.2.3**: Leveraging the latest features of Next.js for optimal performance.\r
- **Supabase 1.172.2**: Robust backend solution for database management and authentication.\r
- **Stripe.js 2.4.0**: Seamless payment processing with easy setup.\r
- **TypeScript**: Enhanced code quality and developer productivity.\r
- **TailwindCSS**: Rapid UI development with utility-first CSS.\r
- **UI Components**: Rich set of pre-built components using shadcn/ui and magicui.\r
- **Documentation Framework**: Integrated Fumadocs for easy documentation creation.\r
- **Landing Page Components**: Complete set of customizable landing page elements.\r
- **Dashboard and User Management**: Pre-built dashboard and user management pages.\r
\r
## Quick Start Guide\r
\r
### 1. Clone the Repository\r
\r
\`\`\`bash\r
git clone https://github.com/antoineross/Hikari.git\r
cd Hikari\r
\`\`\`\r
\r
### 2. Install Dependencies\r
\r
Ensure you have [pnpm](https://pnpm.io/installation) installed and run:\r
\r
\`\`\`bash\r
pnpm install\r
\`\`\`\r
\r
### 3. Set Up Local Development Environment with Supabase\r
\r
#### Prerequisites\r
\r
- Install [Docker](https://www.docker.com/get-started/)\r
- Set up environment files:\r
  - Copy \`.env.local.example\` to \`.env.local\`\r
  - Copy \`.env.example\` to \`.env\`\r
\r
#### Start Local Supabase Instance\r
\r
1. Start Supabase:\r
   \`\`\`bash\r
   npx supabase start\r
   \`\`\`\r
\r
2. Configure environment variables:\r
   - Copy the \`service_role_key\` from the terminal output.\r
   - Set \`SUPABASE_SERVICE_ROLE_KEY\` in your \`.env.local\` file with this value.\r
\r
3. Get Supabase URLs:\r
   \`\`\`bash\r
   npx supabase status\r
   \`\`\`\r
   Copy the following values to your \`.env.local\` file:\r
   - \`API URL\` as \`NEXT_PUBLIC_SUPABASE_URL\`\r
   - \`anon key\` as \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`\r
   - \`service_role key\` as \`SUPABASE_SERVICE_ROLE_KEY\`\r
\r
4. Link local Supabase instance:\r
   \`\`\`bash\r
   npx supabase link\r
   \`\`\`\r
   Follow the prompts to link to your Supabase project.\r
\r
### 4. Set Up Stripe Integration\r
\r
#### Create a Stripe Account\r
\r
If you don't already have a Stripe account, [create one now](https://dashboard.stripe.com/register).\r
\r
#### Enable Test Mode\r
\r
Make sure you have the ["Test Mode" toggle](https://stripe.com/docs/testing) switched on in your Stripe dashboard for development purposes.\r
\r
#### Configure Stripe API Keys\r
\r
1. Go to the **API Keys** section on the Developers tab in your Stripe dashboard.\r
2. Copy the \`Publishable key\` and \`Secret key\`.\r
3. Paste them into your \`.env.local\` file:\r
   \`\`\`bash\r
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
   STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
   \`\`\`\r
\r
#### Set Up Stripe CLI\r
\r
1. [Download and install the Stripe CLI](https://docs.stripe.com/stripe-cli).\r
2. Log in to your Stripe account via the CLI:\r
   \`\`\`bash\r
   stripe login\r
   \`\`\`\r
\r
#### Configure Webhook\r
\r
1. Forward events to your local webhook endpoint:\r
   \`\`\`bash\r
   stripe listen --forward-to http://localhost:3000/api/webhooks/stripe\r
   \`\`\`\r
2. Copy the webhook signing secret that's printed in the console.\r
3. Add it to your \`.env.local\` file:\r
   \`\`\`bash\r
   STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
   \`\`\`\r
\r
#### Create Products and Pricing\r
\r
Hikari uses a fixtures file to bootstrap test product and pricing data in your Stripe account. Here's an example of a comprehensive Stripe fixtures file:\r
\r
\`\`\`json\r
{\r
  "_meta": {\r
    "template_version": 0\r
  },\r
  "fixtures": [\r
    {\r
      "name": "prod_basic",\r
      "path": "/v1/products",\r
      "method": "post",\r
      "params": {\r
        "name": "Starter",\r
        "description": "Kickstart your journey with some light-hearted fun.",\r
        "metadata": {\r
          "index": "0"\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_starter_month",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_basic:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 1900,\r
        "recurring": {\r
          "interval": "month",\r
          "interval_count": 1\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_starter_year",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_basic:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 19000,\r
        "recurring": {\r
          "interval": "year",\r
          "interval_count": 1\r
        }\r
      }\r
    },\r
    {\r
      "name": "prod_pro",\r
      "path": "/v1/products",\r
      "method": "post",\r
      "params": {\r
        "name": "Pro",\r
        "description": "For those who need a steady stream of humor in their lives.",\r
        "metadata": {\r
          "index": "1"\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_pro_month",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_pro:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 4900,\r
        "recurring": {\r
          "interval": "month",\r
          "interval_count": 1\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_pro_year",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_pro:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 49000,\r
        "recurring": {\r
          "interval": "year",\r
          "interval_count": 1\r
        }\r
      }\r
    },\r
    {\r
      "name": "prod_enterprise",\r
      "path": "/v1/products",\r
      "method": "post",\r
      "params": {\r
        "name": "Enterprise",\r
        "description": "For the serious humorist who needs all the laughs.",\r
        "metadata": {\r
          "index": "3"\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_enterprise_month",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_enterprise:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 39900,\r
        "recurring": {\r
          "interval": "month",\r
          "interval_count": 1\r
        }\r
      }\r
    },\r
    {\r
      "name": "price_enterprise_year",\r
      "path": "/v1/prices",\r
      "method": "post",\r
      "params": {\r
        "product": "\${prod_enterprise:id}",\r
        "currency": "usd",\r
        "billing_scheme": "per_unit",\r
        "unit_amount": 399000,\r
        "recurring": {\r
          "interval": "year",\r
          "interval_count": 1\r
        }\r
      }\r
    }\r
  ]\r
}\r
\`\`\`\r
\r
To use this:\r
\r
1. Save the above JSON in \`utils/stripe/fixtures/stripe-fixtures.json\`.\r
2. Ensure the Stripe CLI is listening to your local environment:\r
   \`\`\`bash\r
   stripe listen --forward-to http://localhost:3000/api/webhooks/stripe\r
   \`\`\`\r
3. Run the Stripe fixtures command to create the products in your Stripe account:\r
   \`\`\`bash\r
   pnpm stripe:fixtures\r
   \`\`\`\r
\r
### 5. Set Up GitHub OAuth (Optional)\r
\r
1. Create a GitHub OAuth app following [this guide](https://supabase.com/docs/guides/auth/social-login/auth-github).\r
\r
2. Add the following to your \`.env\` file:\r
   \`\`\`\r
   SUPABASE_AUTH_EXTERNAL_GITHUB_REDIRECT_URI="http://127.0.0.1:54321/auth/v1/callback"\r
   SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="your_client_id"\r
   SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="your_client_secret"\r
   \`\`\`\r
\r
### 6. Final Environment Setup\r
\r
Your \`.env.local\` file should now look similar to this:\r
\r
\`\`\`bash\r
NEXT_PUBLIC_APP_URL="http://localhost:3000"\r
\r
# Supabase Local Dev\r
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR************************************WNReilDMblYTn_I0"\r
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"\r
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1Ni******************************************Zx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"\r
\r
# Stripe\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
\r
# Optional (for database security)\r
DB_PASSWORD="your_database_password"\r
\`\`\`\r
\r
### 7. Run the Development Server\r
\r
1. Start the Next.js development server:\r
   \`\`\`bash\r
   pnpm dev\r
   \`\`\`\r
\r
2. Open [http://localhost:3000](http://localhost:3000) in your browser to see your Hikari application.\r
\r
## Key Components\r
\r
### Supabase Integration\r
\r
Hikari uses Supabase for database management and authentication. The setup process includes:\r
- Local Supabase instance setup\r
- Environment variable configuration\r
- Database schema management\r
\r
### Stripe Integration\r
\r
The Stripe integration in Hikari includes:\r
- Webhook handling for various Stripe events\r
- Product and pricing management using fixtures\r
- Subscription handling\r
\r
### UI Components\r
\r
Hikari comes with a rich set of UI components, including:\r
- Complete landing page elements\r
- Dashboard components\r
- User management interfaces\r
\r
## Customization\r
\r
While Hikari provides a solid starting point, it's designed to be customizable:\r
- Modify the \`stripe-fixtures.json\` file to adjust product and pricing information\r
- Customize UI components to match your brand\r
- Extend the provided API routes and add new ones as needed\r
\r
## Important Notes\r
\r
- Stripe Checkout in Hikari supports pricing that bills a predefined amount at a specific interval. More complex plans (e.g., different pricing tiers or seats) are not yet supported.\r
- Always ensure your Stripe webhook is correctly configured and that you've redeployed with all necessary environment variables.\r
- The webhook listener must be running concurrently with your development server for the Stripe integration to function correctly.\r
\r
## Licensing\r
\r
Hikari is open-source and available under the MIT License, allowing for both personal and commercial use with proper attribution.\r
\r
## Conclusion\r
\r
Hikari provides a comprehensive starting point for your Next.js SaaS projects, combining powerful features with ease of use. By leveraging Hikari, you can focus on building your unique product features rather than setting up infrastructure and common SaaS components.\r
\r
Remember, Hikari is an evolving project. Check the official repository for the latest updates, features, and community contributions.\r
\r
Happy building with Hikari!`,o=`---\r
title: How Supacrawler Enhances Hikari Projects - A Showcase  \r
description: Using Supacrawler alongside Hikari unlocks powerful data tools for SaaS apps  \r
date: 2025-09-10\r
author: Antoine Ross  \r
---\r
\r
When you start a SaaS app using **Hikari**—Next.js 14 + Supabase + Stripe + Tailwind—you get a strong foundation: authentication, subscription billing, dashboards, docs/blog support, UI scaffolding.\r
\r
But often, you’ll also want to bring in external content, monitor page changes, or extract structured data from other sites. That’s where [**Supacrawler**](https://supacrawler.com) becomes a natural companion.\r
\r
Below is how Supacrawler adds value to Hikari-based projects, some use-cases, what implementing it looks like, and why this combo works well.\r
\r
---\r
\r
## What Supacrawler Brings to the Table\r
\r
Here are the capabilities Supacrawler provides that Hikari doesn't include out of the box:\r
\r
- Extracting and transforming content from external sources (blogs, documentation) via REST API endpoints like \`/scrape\` and \`/crawl\`.  \r
- Full-page screenshots and previews (with JS rendering) using \`/screenshots\`.  \r
- Monitoring external pages for updates using \`/watch\` — useful for changelogs, compliance, or competitive tracking.  \r
- Affordable and performant crawling jobs with asynchronous processing, backed by Redis + Asynq. Supacrawler documentation confirms its focus on cost-effectiveness and stability.\r
\r
---\r
\r
## Example Workflows When You Combine Hikari + Supacrawler\r
\r
These are practical scenarios showing how developers using Hikari could plug in Supacrawler to extend their app:\r
\r
| Workflow | How Supacrawler Is Used | Why It Helps |\r
|---|---|---|\r
| **Content Imports** | Use the \`/crawl\` endpoint to harvest external blog or docs content, convert it to Markdown/JSON, and integrate into Hikari’s blog or knowledge sections. | Lets you aggregate content without manually copying/pasting, or writing scraping logic. Keeps content up-to-date automatically. |\r
| **Change Alerts & Monitoring** | For pages that matter (competitor pricing, external docs, regulatory sites), schedule \`/watch\` jobs; then show flagged changes in dashboards or send email/webhooks. | Great for SaaS apps that need real-world signals or timely updates. Reactive rather than manual. |\r
| **Visual Previews / Archiving** | When users supply URLs to display content previews (e.g. link previews, snapshots), use \`/screenshots\`. | Improves UI / UX; gives a visual way to confirm content, not just text. |\r
| **Data-Driven Features** | Build features like content search, enrichment (extract metadata, links, images) using \`/scrape\` and \`/crawl\`. For example, combining scraped documentation with your own content search powered by Supabase + vector embeddings. | Adds value-added features (search, recommendation) without heavy scraping infrastructure. |\r
\r
---\r
\r
## How to Integrate Supacrawler with Hikari\r
\r
Here’s a mental sketch of how you’d wire them up:\r
\r
1. **API Key / Service Setup**  \r
   Deploy or use Supacrawler (locally or hosted), get API key, set environment variables in your Hikari project to point to Supacrawler endpoints (e.g., \`SUPACRAWLER_API_URL\`, \`SUPACRAWLER_KEY\`).\r
\r
2. **Create Utility Modules**  \r
   In Hikari, write small service modules (JS/TypeScript) that call Supacrawler’s \`/scrape\`, \`/crawl\`, etc. Maybe utilities like \`fetchExternalBlogContent()\`, \`watchPageDifferences()\`, \`generatePreviewScreenshot()\`.\r
\r
3. **UI / Backend Hooks**  \r
   - Backend server side (Next.js API routes) to process the Supacrawler jobs, handle responses.  \r
   - Frontend UI components to display previews, show status of monitoring, or content fetched.  \r
   - Use dashboards in Hikari to show external content, maybe with filters or schedule.\r
\r
4. **Configuration Choices**  \r
   - Depth of crawl, link limits, and whether JS rendering is needed (these affect performance).  \r
   - How frequently to watch pages.  \r
   - Storage of screenshots / scraped content (store in Supabase Storage or other storage).  \r
   - Error handling & retries.\r
\r
To showcase Supacrawler in real-world workflows, here are some tutorials I’ve published:\r
\r
* [Production-Ready RAG with Supacrawler and pgvector](https://supacrawler.com/blog/production-ready-rag-with-supacrawler-and-pgvector)\r
* [Automate Monitoring Website Changes with Watch](https://supacrawler.com/blog/automate-monitoring-website-changes-with-watch)\r
* [How to Crawl Blogs and Docs](https://supacrawler.com/blog/how-to-crawl-blogs-and-docs)\r
* [Github](https://github.com/supacrawler/supacrawler)\r
\r
These examples highlight how Supacrawler can be used to **build AI-ready pipelines, monitor critical web pages, and retrieve structured content at scale**.\r
`,s=`---\r
title: A Complete & Open Source SaaS Starter Using Next.js, Supabase, and Stripe\r
description: Discover the powerful features and benefits of Hikari, a comprehensive Next.js SaaS starter.\r
date: 2023-06-17\r
author: Antoine Ross\r
---\r
\r
## 1. Introduction to Hikari\r
\r
### What is Hikari?\r
\r
Hikari is a comprehensive, open-source SaaS (Software as a Service) starter template that combines the power of Next.js, Supabase, and Stripe. Designed to accelerate the development of modern web applications, Hikari provides developers with a robust foundation for building scalable, feature-rich SaaS products.\r
\r
[Image Suggestion: Place a hero image here showcasing Hikari's logo and a collage of its key features (Next.js, Supabase, Stripe logos)]\r
\r
### Key Features and Technologies\r
\r
- **Next.js 14**: Utilizing the latest features for optimal performance and developer experience\r
- **Supabase**: Offering a powerful backend solution for authentication and database management\r
- **Stripe Integration**: Enabling seamless payment processing and subscription management\r
- **TypeScript**: Enhancing code quality and developer productivity\r
- **Tailwind CSS**: Facilitating rapid UI development with utility-first styling\r
- **Fumadocs**: Integrated documentation and blogging capabilities\r
- **Comprehensive UI Components**: Including landing pages, dashboard elements, and user management interfaces\r
\r
[Image Suggestion: Insert an infographic here visualizing the tech stack and features of Hikari]\r
\r
## 2. The Power of Next.js in Hikari\r
\r
### Next.js 14 and App Router\r
\r
Hikari leverages Next.js 14, taking full advantage of its App Router feature. This modern routing system allows for:\r
\r
- Easier management of complex application structures\r
- Improved performance through automatic code splitting\r
- Enhanced SEO capabilities with built-in metadata API\r
\r
[Image Suggestion: Include a screenshot of the Hikari project structure, highlighting the App Router implementation]\r
\r
### Server and Client Components\r
\r
Hikari utilizes both server and client components, a key feature of Next.js 14:\r
\r
- **Server Components**: Render on the server, reducing JavaScript sent to the client and improving initial load times\r
- **Client Components**: Enable interactive UI elements and dynamic content updates\r
- **Hybrid Approach**: Hikari strategically uses both types to optimize performance and user experience\r
\r
[Image Suggestion: Add a diagram illustrating the flow between server and client components in a typical Hikari application]\r
\r
## 3. Leveraging Supabase for Backend Functionality\r
\r
### Authentication and Database Management\r
\r
Supabase provides Hikari with a powerful, scalable backend solution:\r
\r
- **User Authentication**: Easy implementation of secure login systems, including social auth options\r
- **PostgreSQL Database**: Robust, scalable database management with real-time capabilities\r
- **Row Level Security**: Ensuring data privacy and security at the database level\r
\r
[Image Suggestion: Include a screenshot of the Hikari sign-in page, showcasing the Supabase-powered authentication]\r
\r
### Real-time Capabilities\r
\r
Supabase's real-time features enable Hikari to offer:\r
\r
- Live data updates without complex WebSocket implementations\r
- Real-time collaborative features for multi-user applications\r
- Instant synchronization across clients for a seamless user experience\r
\r
[Image Suggestion: Add an animated GIF or video demonstrating real-time data updates in a Hikari application]\r
\r
## 4. Stripe Integration for Billing\r
\r
### Setting up Stripe Checkout\r
\r
Hikari comes with pre-configured Stripe integration:\r
\r
- Easy setup of payment flows using Stripe Checkout\r
- Support for various payment methods and currencies\r
- Secure handling of payment information\r
\r
[Image Suggestion: Include a screenshot of the Stripe Checkout process integrated into a Hikari application]\r
\r
### Managing Subscriptions\r
\r
The Stripe integration in Hikari includes robust subscription management:\r
\r
- Automated billing cycles and invoice generation\r
- Support for different subscription tiers and pricing models\r
- Webhook integration for real-time updates on subscription status\r
\r
[Image Suggestion: Add a mockup of a subscription management dashboard in Hikari]\r
\r
## 5. Additional Features\r
\r
### Fumadocs for Documentation and Blogging\r
\r
Hikari integrates Fumadocs, providing:\r
\r
- Built-in documentation capabilities for your SaaS product\r
- Blogging functionality to share updates and engage with users\r
- Customizable layouts and themes for docs and blog posts\r
\r
[Image Suggestion: Include a split-screen image showing both the documentation and blog interfaces powered by Fumadocs in Hikari]\r
\r
### Tailwind CSS for Styling\r
\r
Tailwind CSS is at the core of Hikari's styling approach:\r
\r
- Rapid UI development with utility-first classes\r
- Consistent design language across the application\r
- Easy customization to match your brand identity\r
\r
[Image Suggestion: Add a before-and-after comparison of a UI component, showing how Tailwind CSS classes transform the design]\r
\r
## 6. Getting Started with Hikari\r
\r
### Installation Process\r
\r
Getting started with Hikari is straightforward:\r
\r
1. Clone the Hikari repository:\r
   \`\`\`bash\r
   git clone https://github.com/antoineross/Hikari.git\r
   \`\`\`\r
2. Install dependencies:\r
   \`\`\`bash\r
   pnpm install\r
   \`\`\`\r
3. Set up environment variables for Supabase and Stripe\r
4. Start the development server:\r
   \`\`\`bash\r
   pnpm dev\r
   \`\`\`\r
\r
[Image Suggestion: Include a terminal screenshot showing the successful installation and startup of a Hikari project]\r
\r
### Customization Options\r
\r
Hikari is designed to be highly customizable:\r
\r
- Modify the \`stripe-fixtures.json\` file to adjust product and pricing information\r
- Customize UI components using Tailwind CSS classes\r
- Extend Supabase schema and functions to fit your specific backend needs\r
- Add or modify API routes to create custom functionality\r
\r
[Image Suggestion: Show a split-screen image comparing the default Hikari UI with a customized version, highlighting the flexibility of the template]\r
\r
## Conclusion\r
\r
Hikari stands out as a comprehensive open source SaaS starter, combining the power of Next.js, Supabase, and Stripe. Its robust feature set, coupled with the flexibility to customize and extend, makes it an excellent choice for developers looking to rapidly build and deploy SaaS applications. Whether you're a startup founder, an indie hacker, or part of a development team, Hikari provides the tools and structure you need to bring your SaaS ideas to life quickly and efficiently.\r
\r
[Image Suggestion: Close with a showcase image featuring multiple screens of a completed Hikari-based SaaS application, including the landing page, dashboard, and user settings]\r
\r
By choosing Hikari, you're not just getting a template – you're gaining access to a full-fledged ecosystem that can grow and evolve with your project. As an open-source project, Hikari benefits from community contributions and constant improvements, ensuring that your SaaS application is built on a solid, future-proof foundation.\r
\r
Start building your next big idea with Hikari today and join the growing community of developers leveraging this powerful SaaS starter!`,c=`---\r
title: What's on the Roadmap for Hikari?\r
description: Discover the upcoming features and improvements planned for Hikari.\r
date: 2024-07-19\r
author: Antoine Ross\r
---\r
\r
## Hikari's Roadmap: What's Coming Next\r
\r
As the creator of Hikari, I'm excited to share our plans for the future. We're constantly working to improve and expand our Next.js SaaS starter to meet the evolving needs of developers and businesses. Here's what we're currently focusing on:\r
\r
### Localization and Internationalization\r
\r
We understand the importance of reaching a global audience. That's why we're considering adding robust localization and internationalization support to Hikari. This feature's priority will largely depend on community demand. With this addition, you'll be able to:\r
\r
- Easily translate your application into multiple languages\r
- Adapt your content for different regions and cultures\r
- Provide a seamless experience for users worldwide\r
\r
We're eager to hear from our community about how important this feature is to you and your projects.\r
\r
### Payment Integration\r
\r
While Hikari currently supports Stripe for payment processing, we recognize the need for more flexibility in payment options. We're excited to announce that we're working on integrating LemonSqueezy as an additional payment provider. This expansion will offer several benefits:\r
\r
- More choice for developers and businesses\r
- Simplified setup process for those who prefer LemonSqueezy\r
- Access to LemonSqueezy's unique features and pricing model\r
\r
We believe this addition will make Hikari even more versatile and accessible to a wider range of projects. The integration is currently in development, and we're aiming to release it in the near future.\r
\r
### Community Leaderboard\r
\r
To foster engagement and showcase the success of projects built with Hikari, we're planning to implement a community leaderboard. This feature could take two potential forms:\r
\r
- For SaaS projects: A leaderboard tracking revenue generated by applications built with Hikari\r
- For open-source projects: A leaderboard displaying GitHub stars earned by projects using Hikari\r
\r
We're still in the early stages of planning this feature and would love to hear your thoughts on which approach would be most valuable to our community.\r
\r
### Looking Forward\r
\r
While these are our main focus areas, we're always open to new ideas and suggestions. The development of Hikari is a collaborative effort, and your input is crucial in shaping its future.\r
\r
If you have thoughts on these planned features or ideas for other improvements, we encourage you to reach out. You can:\r
\r
- Open an issue on our GitHub repository\r
- Join our community discussions\r
- Connect with us on social media\r
\r
Thank you for being part of the Hikari community. Together, we're building the future of SaaS development!\r
`,l=`---\r
title: What is Hikari?\r
description: Discover the powerful features and benefits of Hikari, a comprehensive Next.js SaaS starter.\r
date: 2023-07-17\r
author: Antoine Ross\r
---\r
\r
# Introducing Hikari: A Comprehensive Next.js SaaS Starter\r
\r
Hikari is a powerful and feature-rich Next.js SaaS starter designed to accelerate your development process and provide a solid foundation for your next big project. Let's dive into what makes Hikari stand out from the crowd.\r
\r
## Core Technologies\r
\r
Hikari leverages a modern tech stack to ensure robustness, scalability, and developer-friendly experiences:\r
\r
1. **Supabase**: For database management and authentication, Hikari integrates Supabase, offering a flexible and secure backend solution.\r
\r
2. **Stripe**: Handling payments is a breeze with Stripe integration. Hikari simplifies the process further with a single command to set up your pricing page:\r
\r
   \`\`\`bash\r
   pnpm stripe:fixtures\r
   \`\`\`\r
\r
3. **Next.js**: The frontend is built on Next.js, providing server-side rendering, static site generation, and an overall excellent developer experience.\r
\r
4. **TailwindCSS**: For styling, Hikari uses TailwindCSS, allowing for rapid UI development with utility-first CSS.\r
\r
5. **TypeScript**: Hikari is built with TypeScript, offering enhanced code quality and developer productivity through static typing.\r
\r
## UI Components and Design\r
\r
Hikari doesn't just stop at the core technologies. It provides a rich set of UI components and design elements:\r
\r
1. **UI Libraries**: Hikari utilizes both shadcn/ui and magicui for its UI components, offering a wide range of customizable and accessible elements.\r
\r
2. **Landing Page Components**: A complete set of landing page components is included, covering all your needs:\r
\r
   - FAQ sections\r
   - Feature highlights\r
   - Hero sections\r
   - Regular navigation bar\r
   - Unique floating circular navigation bar\r
   - Pricing component\r
   - Wall of love for testimonials\r
\r
3. **Dashboard and User Management**: Hikari comes with a pre-built dashboard component using shadcn/ui blocks. It also includes dedicated \`/account\` and \`/settings\` pages for comprehensive user management.\r
\r
## Why Choose Hikari?\r
\r
Hikari is more than just a collection of technologies and components. It's a carefully crafted starter that brings together best practices, modern design, and developer-friendly features. Whether you're building a SaaS application, a personal project, or a corporate website, Hikari provides the tools and structure you need to get started quickly and scale effectively.\r
\r
By choosing Hikari, you're not just saving time on initial setup - you're investing in a foundation that will support your project as it grows and evolves. From authentication to payment processing, from landing pages to user dashboards, Hikari has you covered.\r
\r
Ready to supercharge your Next.js project? Give Hikari a try and experience the difference a well-designed starter can make in your development journey.\r
`,u=`---\r
title: Why was Hikari built?\r
description: I just wanted to scratch an itch.\r
date: 2024-07-18\r
author: Antoine Ross\r
---\r
\r
## Scratching an Itch\r
\r
I built Hikari because I wanted to **scratch an itch**.\r
\r
As a developer, I found myself in need of a robust starter template for numerous SaaS projects I was actively building at the time. Moreover, I wanted a solution that would serve as a solid foundation for my future projects.\r
\r
This pressing need and forward-thinking approach led me to create a more modern and personalized version of Taxonomy, a comprehensive and customizable solution that could adapt to various SaaS scenarios and evolve with my future requirements.\r
\r
## The Inspiration\r
\r
The inspiration for this project is [Taxonomy](https://tx.shadcn.com/), which is a modern starter template for Nextjs.13. Initially, I used Taxonomy as a way to understand Next.js -- I loved how the design was simple and clean.\r
After using Taxonomy for a while, I discovered it lacked certain features and the level of customization I desired. For instance:\r
\r
1. **Documentation**: Contentlayer, which was a crucial component for building a documentation site, was no longer supported in Next.js 14.\r
\r
2. **Authentication**: Clerk was an easy authentication system, but I preferred Supabase for its flexibility and ease of use. While there was a [Supabase version of Taxonomy](https://taxonomy-supabase.vercel.app/), its authentication logic differed from my preferred implementation.\r
\r
3. **Database**: I also preferred using Supabase Postgres over Planetscale or Prisma for database management.\r
\r
I often found myself returning to the [Supabase subscription repository](https://github.com/vercel/nextjs-subscription-payments/tree/main) as a starting point, customizing it to include components from Taxonomy. This repetitive process made me realize the need for a more tailored solution.\r
\r
## Modern Features and Design Choices\r
\r
In developing Hikari, I wanted to incorporate more modern features and make design choices that would enhance both functionality and user experience. Here are some key changes and additions:\r
\r
1. **Documentation Framework**: Replaced Contentlayer with [Fumadocs](https://fumadocs.vercel.app/), a powerful documentation framework. Its design language and flexibility resonated strongly with my vision for Hikari.\r
\r
2. **Authentication**: Moved away from Clerk in favor of Supabase for authentication. This change offers more flexibility and better integration with other Supabase services.\r
\r
3. **Modular Component Library**: Developed a comprehensive set of components that can be easily mixed and matched for various website needs. This includes:\r
\r
   - Landing page components\r
   - Documentation components\r
   - Blog layout and styling\r
   - Dashboard elements\r
\r
4. **Cohesive Design Language**: Implemented a design system that aligns with my personal aesthetic preferences - simple, clean, and modern. This ensures a consistent look and feel across all parts of the application.\r
\r
5. **Simplicity and Ease of Use**: Prioritized a user-friendly experience, making it intuitive for both developers using the template and end-users interacting with the final product.\r
\r
6. **Performance Optimization**: Incorporated best practices for performance, including code splitting, lazy loading, and optimized asset delivery.\r
\r
7. **Responsive Design**: Ensured that all components and layouts are fully responsive, providing a seamless experience across devices of all sizes.\r
\r
8. **SEO Friendly**: Implemented SEO best practices, including proper meta tag management and semantic HTML structure.\r
\r
These features and design choices make Hikari not just a template, but a comprehensive toolkit for building modern, efficient, and user-friendly SaaS applications.\r
\r
# The Philosophy Behind Hikari\r
\r
## Open Source and Community\r
\r
Building Hikari wasn't just about solving my own problems. I'm a firm believer in open source and wanted to give back to the community that has helped me learn and grow. By sharing Hikari, I hope to contribute to the ecosystem and help other developers who might face similar challenges.\r
So I'd like to give a special thanks to all the open source projects that I've used to build Hikari.\r
\r
- [ShadcnUI](https://github.com/shadcn-ui/ui): A collection of accessible UI components for building modern web applications.\r
- [Taxonomy](https://github.com/shadcn-ui/taxonomy): A modern starter template for Next.js 13.\r
- [Fumadocs](https://github.com/fumadocs/fumadocs): A documentation framework for building beautiful documentation sites.\r
- [Next.js](https://github.com/vercel/next.js): A React framework for production.\r
- [Supabase](https://github.com/vercel/nextjs-subscription-payments): A starter template for Supabase Authentication/Database + Vercel + Stripe.\r
- [MagicUI](https://github.com/magicuidesign/magicui): A collection of accessible UI components for designing web applications.\r
\r
## Looking Forward\r
\r
Hikari is just the beginning. Over the past six months, I've been studying and working on a variety of projects, each addressing different _"itches"_ I've encountered in my development journey. I'm excited to release these projects in the coming months and share my progress with the community.\r
\r
If you're interested in following along with these projects or want to see what else I'm working on, feel free to check out my Twitter: [@antoineross\\_\\_](https://twitter.com/antoineross__).\r
\r
In the end, Hikari represents not just a tool, but a philosophy: **build what you need, make it flexible, and share it with others**. I hope it serves you as well as it has served me.\r
`,d=`---\r
title: Configure your Environment\r
description: Configuring your environment variables\r
---\r
\r
Welcome to the docs! You can start writing documents in \`/content/docs\`.\r
\r
## What is Next?\r
\r
<Cards>\r
  <Card title="Learn more about Next.js" href="https://nextjs.org/docs" />\r
  <Card title="Learn more about Fumadocs" href="https://fumadocs.vercel.app" />\r
</Cards>\r
`,f=`---\r
title: Stripe\r
description: Configuring Stripe\r
---\r
\r
Welcome to the docs! You can start writing documents in \`/content/docs\`.\r
\r
## What is Next?\r
\r
<Cards>\r
  <Card title="Learn more about Next.js" href="https://nextjs.org/docs" />\r
  <Card title="Learn more about Fumadocs" href="https://fumadocs.vercel.app" />\r
</Cards>\r
`,ee=`---\r
title: Local Development\r
description: Setting up Stripe Locally\r
---\r
\r
import { Step, Steps } from 'fumadocs-ui/components/steps';\r
\r
If you don't already have a Stripe account, create one now.\r
\r
For the following steps, make sure you have the ["Test Mode" toggle](https://stripe.com/docs/testing) switched on.\r
\r
## Developing Locally\r
\r
We need to create a webhook in the \`Developers\` section of Stripe. This webhook is the piece that connects Stripe to your Vercel Serverless Functions.\r
\r
<div className="steps">\r
<div className="step">\r
Go to the **API Keys** section on the Developers tab. Copy the \`Publishable key\` and \`Secret key\` and paste them into your \`.env.local\` file as \`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\` and \`STRIPE_SECRET_KEY\`\r
\r
</div>\r
\r
<div className="step">\r
Click the "Test in local environment" button on the [test Endpoints page](https://dashboard.stripe.com/test/webhooks).\r
</div>\r
<div className="step">\r
[Download the CLI](https://docs.stripe.com/stripe-cli) and log in with your Stripe account\r
\`\`\`bash\r
stripe login\r
\`\`\`\r
</div>\r
<div className="step">\r
Forward events to your webhook. In our case, the webhook is in the \`api/webhooks/stripe\` endpoint. \r
    \`\`\`bash\r
    stripe listen --forward-to http://localhost:3000/api/webhooks/stripe\r
    \`\`\`\r
This will print out the following. Copy the webhook signing secret and paste it to your \`.env.local\` file as \`STRIPE_WEBHOOK_SECRET\`: \r
    \`\`\`bash\r
     Ready! You are using Stripe API Version [2024-06-20]. \r
     Your webhook signing secret is whsec_4838c65cc*********************8\r
    \`\`\`\r
Now that we have our stripe webhook secret, we can trigger the events for our supabase server. For now just copy the the environment variables. We will come back to this later.\r
</div>\r
<div className="step">\r
By now your .env.local file should look like this:\r
\`\`\`bash title=".env.local"\r
# Get these from Stripe dashboard\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
\`\`\`\r
</div>\r
</div>\r
\r
## Create product and pricing information\r
\r
Your application's webhook listens for product updates on Stripe and automatically propagates them to your Supabase database. So with your webhook listener running, you can now create your product and pricing information in the [Stripe Dashboard](https://dashboard.stripe.com/test/products).\r
\r
Before continuing with this portion of the documentation, make sure you have the following environment variables set in your \`.env.local\` file:\r
\r
\`\`\`bash title=".env.local"\r
NEXT_PUBLIC_APP_URL="http://localhost:3000"\r
\r
# These environment variables are used for Supabase Local Dev\r
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR************************************WNReilDMblYTn_I0"\r
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"\r
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1Ni******************************************Zx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"\r
\r
# Get these from Stripe dashboard\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
\`\`\`\r
\r
Stripe Checkout currently supports pricing that bills a predefined amount at a specific interval. More complex plans (e.g., different pricing tiers or seats) are not yet supported. For example, you can create business models with different pricing tiers, e.g.:\r
\r
<div className="border-2 rounded-lg mx-8 px-10">\r
  | Product | Monthly Price | Yearly Price |\r
  |-------------|----------------|--------------| \r
  | Hobby | 10 USD | 100 USD |\r
  | Freelancer | 20 USD | 200 USD |\r
  | Pro | 40 USD | 400 USD |\r
</div>\r
\r
To speed up the setup, we use a <strong>fixtures file</strong> \`utils/stripe/fixtures/stripe-fixtures.json\` to bootstrap test product and pricing data in your Stripe account. Edit this file according to your products pricing scheme. The [Stripe CLI](https://stripe.com/docs/stripe-cli#install) \`fixtures\` command executes a series of API requests defined in this JSON file.\r
Simply run \`pnpm stripe:fixtures\`.\r
\r
<div className="steps">\r
  <div className="step">\r
    First go to \`utils/stripe/fixtures/stripe-fixtures.json\` and edit the file\r
    according to your products pricing scheme.\r
  </div>\r
  <div className="step">\r
    If you haven't yet, ensure that you are logged in to the stripe CLI in your\r
    terminal. \`\`\`bash stripe login \`\`\` Then run the command to have stripe\r
    listening to your local environment. **Make sure that you have your webhook\r
    secret set in your \`.env.local\` file**. \`\`\`bash stripe listen --forward-to\r
    http://localhost:3000/api/webhooks/stripe \`\`\`\r
  </div>\r
  <div className="step">\r
    Now that you have your products and pricing scheme set up, run the following\r
    command to create the products in your Stripe account: \`\`\`bash pnpm\r
    stripe:fixtures \`\`\`\r
  </div>\r
</div>\r
\r
**Important:** Make sure that you've configured your Stripe webhook correctly and redeployed with all needed environment variables.\r
`,te=`---\r
title: Developing in Production\r
description: Setting up Stripe for Production\r
---\r
\r
import { Step, Steps } from 'fumadocs-ui/components/steps';\r
\r
If you don't already have a Stripe account, create one now.\r
\r
For the following steps, make sure you have the ["Test Mode" toggle](https://stripe.com/docs/testing) switched on.\r
\r
## Development in Production\r
\r
We need to create a webhook in the \`Developers\` section of Stripe. Pictured in the architecture diagram above, this webhook is the piece that connects Stripe to your Vercel Serverless Functions.\r
\r
<div className="steps">\r
<div className="step">\r
Click the "Add Endpoint" button on the [test Endpoints page](https://dashboard.stripe.com/test/webhooks).\r
</div>\r
<div className="step">\r
Enter your production deployment URL followed by \`/api/webhooks\` for the endpoint URL. (e.g. \`https://your-deployment-url.vercel.app/api/webhooks\`)\r
</div>\r
<div className="step">\r
Click \`Select events\` under the \`Select events to listen to\` heading.\r
</div>\r
<div className="step">\r
Click the following events:\r
\r
- 'product.created'\r
- 'product.updated'\r
- 'product.deleted'\r
- 'price.created'\r
- 'price.updated'\r
- 'price.deleted'\r
- 'checkout.session.completed'\r
- 'customer.subscription.created'\r
- 'customer.subscription.updated'\r
- 'customer.subscription.deleted'\r
</div>\r
<div className="step">\r
Copy \`Signing secret\` as we'll need that in the next step (e.g \`whsec_xxx\`) (!be careful not to copy the webhook ID \`we_xxxx\`).\r
</div>\r
<div className="step">\r
In addition to the \`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\` and the \`STRIPE_SECRET_KEY\` we've set earlier during deployment, we need to add the webhook secret as \`STRIPE_WEBHOOK_SECRET\` env var.\r
</div>\r
<div className="step">\r
By now your .env file should look like this:\r
\r
\`\`\`bash title=".env"\r
# Get these from Stripe dashboard\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_live_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_la483**********************************d2118"\r
\`\`\`\r
\r
</div>\r
</div>\r
\r
## Create product and pricing information\r
\r
Your application's webhook listens for product updates on Stripe and automatically propagates them to your Supabase database. So with your webhook listener running, you can now create your product and pricing information in the [Stripe Dashboard](https://dashboard.stripe.com/test/products).\r
\r
Stripe Checkout currently supports pricing that bills a predefined amount at a specific interval. More complex plans (e.g., different pricing tiers or seats) are not yet supported.\r
\r
For example, you can create business models with different pricing tiers, e.g.:\r
\r
<div className="border-2 rounded-lg mx-8 px-10">\r
  | Product | Monthly Price | Yearly Price |\r
  |-------------|----------------|--------------| \r
  | Hobby | 10 USD | 100 USD |\r
  | Freelancer | 20 USD | 200 USD |\r
  | Pro | 40 USD | 400 USD |\r
</div>\r
\r
Optionally, to speed up the setup, we have added a <strong>fixtures file</strong> \`utils/stripe/fixtures/stripe-fixtures.json\` to bootstrap test product and pricing data in your Stripe account. Edit this file according to your products pricing scheme. The [Stripe CLI](https://stripe.com/docs/stripe-cli#install) \`fixtures\` command executes a series of API requests defined in this JSON file. Simply run \`pnpm stripe:fixtures\`.\r
\r
**Important:** Make sure that you've configured your Stripe webhook correctly and redeployed with all needed environment variables.\r
\r
## Configure the Stripe customer portal\r
\r
<div className="steps">\r
  <div className="step">\r
    Set your custom branding in the\r
    [settings](https://dashboard.stripe.com/settings/branding).\r
  </div>\r
  <div className="step">\r
    Configure the Customer Portal\r
    [settings](https://dashboard.stripe.com/test/settings/billing/portal).\r
  </div>\r
  <div className="step">\r
    Toggle on "Allow customers to update their payment methods".\r
  </div>\r
  <div className="step">\r
    Toggle on "Allow customers to update subscriptions".\r
  </div>\r
  <div className="step">\r
    Toggle on "Allow customers to cancel subscriptions".\r
  </div>\r
  <div className="step">Add the products and prices that you want.</div>\r
  <div className="step">\r
    Set up the required business information and links.\r
  </div>\r
</div>\r
`,p=`---\r
title: Supabase\r
description: Configuring your supabase instance\r
---\r
\r
Welcome to the docs! You can start writing documents in \`/content/docs\`.\r
\r
## What is Next?\r
\r
<Cards>\r
  <Card title="Learn more about Next.js" href="https://nextjs.org/docs" />\r
  <Card title="Learn more about Fumadocs" href="https://fumadocs.vercel.app" />\r
</Cards>\r
`,m=`---\r
title: Local Development using Supabase\r
description: Setting up Supabase Locally\r
---\r
\r
import { Step, Steps } from 'fumadocs-ui/components/steps';\r
\r
## Develop locally\r
\r
If you haven't already done so, clone your Github repository to your local machine.\r
\r
### Configure Auth\r
\r
Follow [this guide](https://supabase.com/docs/guides/auth/social-login/auth-github) to set up an OAuth app with GitHub and configure Supabase to use it as an auth provider.\r
\r
In your Supabase project, navigate to [auth > URL configuration](https://app.supabase.com/project/_/auth/url-configuration) and set your main production URL (e.g. https://your-deployment-url.vercel.app) as the site url.\r
\r
Next, in your Vercel deployment settings, add a new **Production** environment variable called \`NEXT_PUBLIC_SITE_URL\` and set it to the same URL. Make sure to deselect preview and development environments to make sure that preview branches and local development work correctly.\r
\r
### Install dependencies\r
\r
Ensure you have [pnpm](https://pnpm.io/installation) installed and run:\r
\`\`\`bash\r
pnpm install\r
\`\`\`\r
\r
### Local Development with Supabase\r
\r
#### Prerequisites\r
\r
<div className="steps">\r
  <div className="step">\r
    **Install Docker**: Download and install Docker from\r
    [here](https://www.docker.com/get-started/).\r
  </div>\r
  <div className="step">\r
    **Setup Environment Files**: Copy or rename \`.env.local.example\` to\r
    \`.env.local\`. Copy or rename \`.env.example\` to \`.env\`.\r
  </div>\r
</div>\r
\r
#### Starting Local Supabase Instance\r
\r
<div className="steps">\r
  <div className="step">\r
    **Start Supabase**: Open your terminal. Run the following command to start a\r
    local Supabase instance and set up the database schema:\r
\r
    \`\`\`bash\r
    npx supabase start\r
    \`\`\`\r
\r
    Note the URLs provided in the terminal output for\r
    accessing different services within the Supabase stack.\r
  </div>\r
  <div className="step">\r
    **Configure Environment Variables**: Copy the value of \`service_role_key\`\r
    from the terminal output. Open your \`.env.local\` file. Set\r
    \`SUPABASE_SERVICE_ROLE_KEY\` in your \`.env.local\` file with the copied value.\r
  </div>\r
  <div className="step">\r
    **Print Supabase URLs**: Open your terminal. Run the following command to\r
    print out the URLs:\r
\r
    \`\`\`bash\r
    npx supabase status\r
    \`\`\`\r
\r
    This will print the\r
    following keys that we will use in our environment variables. Copy these\r
    values and paste them in your \`.env.local\` file:\r
    \`\`\`bash\r
    # NEXT_PUBLIC_SUPABASE_URL\r
    API URL: http://127.0.0.1:54321\r
\r
    # NEXT_PUBLIC_SUPABASE_ANON_KEY\r
    anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ******xad\r
\r
    # SUPABASE_SERVICE_ROLE_KEY\r
    service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9*******sad\r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Link Local Supabase Instance to Project**: Open your terminal. Run the\r
    following command:\r
\r
    \`\`\`bash\r
    npx supabase link\r
    \`\`\`\r
\r
    Navigate to the Supabase\r
    project you created. Enter your database password when prompted.\r
  </div>\r
</div>\r
\r
#### Database Password Reset\r
\r
<div className="steps">\r
  <div className="step">\r
    **Reset Database Password**: Visit your [database\r
    settings](https://supabase.com/dashboard/project/_/settings/database). Click\r
    "Reset database password". Copy the new password and store it in a password\r
    manager.\r
  </div>\r
</div>\r
\r
#### Schema Changes and Data Seeding\r
\r
<div className="steps">\r
  <div className="step">\r
    **Pull Schema Changes**: Open your terminal. Run the following command to\r
    pull schema changes from your remote database:\r
\r
    \`\`\`bash\r
    npx supabase db pull\r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Seed Local Database**: Open your terminal. Run the following commands to\r
    generate seed data:\r
\r
    \`\`\`bash\r
    npx supabase db dump --data-only -f supabase/seed.sql\r
    npx supabase db reset\r
    \`\`\`\r
  </div>\r
</div>\r
\r
#### Generating Types and Migrations\r
\r
<div className="steps">\r
  <div className="step">\r
    **Generate TypeScript Types**: Open your terminal. Run the following command\r
    to generate TypeScript types to match your schema:\r
\r
    \`\`\`bash\r
    npx supabase gen types typescript --local --schema public > types_db.ts\r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Generate Migration File**: Open your terminal. Run the following command\r
    to automatically generate a migration file with all the changes you've made\r
    to your local database schema:\r
\r
    \`\`\`bash\r
    npx supabase db diff | npx supabase migration new\r
    \`\`\`\r
\r
    Push those changes to your remote database with:\r
\r
    \`\`\`bash\r
    npx supabase db push\r
    \`\`\`\r
  </div>\r
</div>\r
\r
### Use the Stripe CLI to Test Webhooks\r
\r
#### Setting Up Stripe CLI\r
\r
<div className="steps">\r
  <div className="step">\r
    **Login to Stripe Account**: Use the Stripe CLI to [login to your Stripe\r
    account](https://stripe.com/docs/stripe-cli#login-account):\r
\r
    \`\`\`bash\r
    pnpm stripe:login\r
    \`\`\`\r
\r
    This will print a URL to navigate to in your browser and\r
    provide access to your Stripe account.\r
  </div>\r
  <div className="step">\r
    **Start Local Webhook Forwarding**: Run the following command:\r
\r
    \`\`\`bash\r
    pnpm stripe:listen\r
    \`\`\`\r
\r
    This will print a webhook secret (such as \`whsec_***\`) to\r
    the console. Set \`STRIPE_WEBHOOK_SECRET\` to this value in your \`.env.local\`\r
    file. If you haven't already, set \`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\` and\r
    \`STRIPE_SECRET_KEY\` in your \`.env.local\` file using the **test mode** keys\r
    from your Stripe dashboard.\r
  </div>\r
</div>\r
\r
### Final environment variables\r
\r
By now your environment variables should look like this:\r
\r
\`\`\`bash title=".env"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_REDIRECT_URI="http://127.0.0.1:54321/auth/v1/callback"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="Ov23li********Q"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="96e4**************************34d"\r
\`\`\`\r
\r
\`\`\`bash title=".env.local"\r
NEXT_PUBLIC_APP_URL="http://localhost:3000"\r
\r
# These environment variables are used for Supabase Local Dev\r
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR************************************WNReilDMblYTn_I0"\r
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"\r
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1Ni******************************************Zx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"\r
\r
# Get these from Stripe dashboard\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
\r
# Optional just to keep your database safe! :D\r
DB_PASSWORD="W23**********s8e"\r
\`\`\`\r
\r
### Run the Next.js Client\r
\r
<div className="steps">\r
  <div className="step">\r
    **Start Development Server**: Open a separate terminal. Run the following\r
    command to start the development server:\r
\r
    \`\`\`bash\r
    pnpm dev\r
    \`\`\`\r
\r
    Note that webhook forwarding and the development server must be running concurrently\r
    in two separate terminals for the application to work correctly.\r
  </div>\r
  <div className="step">\r
    **View Application**: Navigate to\r
    [http://localhost:3000](http://localhost:3000) in your browser to see the\r
    application rendered.\r
  </div>\r
</div>\r
`,h=`---\r
title: Development in Production for Supabase\r
description: Setting up Supabase for Production\r
---\r
\r
## Develop locally\r
\r
If you haven't already done so, clone your Github repository to your local machine.\r
\r
### Configure Auth\r
\r
Follow [this guide](https://supabase.com/docs/guides/auth/social-login/auth-github) to set up an OAuth app with GitHub and configure Supabase to use it as an auth provider.\r
\r
In your Supabase project, navigate to [auth > URL configuration](https://app.supabase.com/project/_/auth/url-configuration) and set your main production URL (e.g. https://your-deployment-url.vercel.app) as the site url.\r
\r
Next, in your Vercel deployment settings, add a new **Production** environment variable called \`NEXT_PUBLIC_SITE_URL\` and set it to the same URL. Make sure to deselect preview and development environments to make sure that preview branches and local development work correctly.\r
\r
### Install dependencies\r
\r
Ensure you have [pnpm](https://pnpm.io/installation) installed and run:\r
\r
\`\`\`bash\r
pnpm install\r
\`\`\`\r
\r
### Local Development with Supabase\r
\r
#### Prerequisites\r
\r
<div className="steps">\r
  <div className="step">\r
    **Install Docker**: \r
    - Download and install Docker from [here](https://www.docker.com/get-started/).\r
  </div>\r
  <div className="step">\r
    **Setup Environment Files**: \r
    - Copy or rename \`.env.local.example\` to \`.env.local\`. \r
    - Copy or rename \`.env.example\` to \`.env\`.\r
  </div>\r
</div>\r
\r
#### Starting Local Supabase Instance\r
\r
<div className="steps">\r
  <div className="step">\r
    **Start Supabase**: \r
    - Open your terminal. \r
    - Run the following command to start a local Supabase instance and set up the database schema: \r
    \`\`\`bash \r
    pnpm supabase:start \r
    \`\`\` \r
    - Note the URLs provided in the terminal output for accessing different services within the Supabase stack.\r
  </div>\r
  <div className="step">\r
    **Configure Environment Variables**: \r
    - Copy the value of \`service_role_key\` from the terminal output. \r
    - Open your \`.env.local\` file. \r
    - Set \`SUPABASE_SERVICE_ROLE_KEY\` in your \`.env.local\` file with the copied value.\r
  </div>\r
  <div className="step">\r
    **Print Supabase URLs**: \r
    - Open your terminal. \r
    - Run the following command to print out the URLs: \r
    \`\`\`bash \r
    pnpm supabase:status \r
    \`\`\` \r
    - This will print the following keys that we will use in our environment variables. Copy these values and paste them in your \`.env.local\` file: \r
    \`\`\`bash title=".env.local"\r
    API URL: http://127.0.0.1:54321 # NEXT_PUBLIC_SUPABASE_URL \r
    anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ******xad # NEXT_PUBLIC_SUPABASE_ANON_KEY \r
    service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9*******sad # SUPABASE_SERVICE_ROLE_KEY \r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Link Local Supabase Instance to Project**: \r
    - Open your terminal. \r
    - Run the following command: \r
    \`\`\`bash \r
    pnpm supabase:link \r
    \`\`\` \r
    - Navigate to the Supabase project you created. \r
    - Enter your database password when prompted.\r
  </div>\r
</div>\r
\r
#### Database Password Reset\r
\r
<div className="steps">\r
  <div className="step">\r
    **Reset Database Password**: \r
    - Visit your [database settings](https://supabase.com/dashboard/project/_/settings/database). \r
    - Click "Reset database password". \r
    - Copy the new password and store it in a password manager.\r
  </div>\r
</div>\r
\r
#### Schema Changes and Data Seeding\r
\r
<div className="steps">\r
  <div className="step">\r
    **Pull Schema Changes**: \r
    - Open your terminal. \r
    - Run the following command to pull schema changes from your remote database: \r
    \`\`\`bash \r
    pnpm supabase:pull \r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Seed Local Database**: \r
    - Open your terminal. \r
    - Run the following command to generate seed data: \r
    \`\`\`bash \r
    pnpm supabase:generate-seed \r
    pnpm supabase:reset \r
    \`\`\`\r
  </div>\r
</div>\r
\r
#### Generating Types and Migrations\r
\r
<div className="steps">\r
  <div className="step">\r
    **Generate TypeScript Types**: \r
    - Open your terminal. \r
    - Run the following command to generate TypeScript types to match your schema: \r
    \`\`\`bash \r
    pnpm supabase:generate-types \r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **Generate Migration File**: \r
    - Open your terminal. \r
    - Run the following command to automatically generate a migration file with all the changes you've made to your local database schema: \r
    \`\`\`bash \r
    pnpm supabase:generate-migration \r
    \`\`\` \r
    - Push those changes to your remote database with: \r
    \`\`\`bash \r
    pnpm supabase:push \r
    \`\`\`\r
  </div>\r
</div>\r
\r
### Use the Stripe CLI to Test Webhooks\r
\r
#### Setting Up Stripe CLI\r
\r
<div className="steps">\r
  <div className="step">\r
    **Login to Stripe Account**: \r
    - Use the Stripe CLI to [login to your Stripe account](https://stripe.com/docs/stripe-cli#login-account): \r
    \`\`\`bash \r
    pnpm stripe:login \r
    \`\`\` \r
    - This will print a URL to navigate to in your browser and provide access to your Stripe account.\r
  </div>\r
  <div className="step">\r
    **Start Local Webhook Forwarding**: \r
    - Run the following command: \r
    \`\`\`bash \r
    pnpm stripe:listen \r
    \`\`\` \r
    - This will print a webhook secret (such as \`whsec_***\`) to the console. \r
    - Set \`STRIPE_WEBHOOK_SECRET\` to this value in your \`.env.local\` file. \r
    - If you haven't already, set \`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\` and \`STRIPE_SECRET_KEY\` in your \`.env.local\` file using the **test mode** keys from your Stripe dashboard.\r
  </div>\r
</div>\r
\r
### Final environment variables\r
\r
By now your environment variables should look like this:\r
\r
\`\`\`bash title=".env"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_REDIRECT_URI="http://127.0.0.1:54321/auth/v1/callback"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="Ov23li********Q"\r
SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="96e4**************************34d"\r
\`\`\`\r
\r
\`\`\`bash title=".env.local"\r
NEXT_PUBLIC_APP_URL="http://localhost:3000"\r
\r
# These environment variables are used for Supabase Local Dev\r
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR************************************WNReilDMblYTn_I0"\r
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"\r
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1Ni******************************************Zx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"\r
\r
# Get these from Stripe dashboard\r
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_51PXT**********************************PpPple1"\r
STRIPE_SECRET_KEY="sk_test_5********************************************I7h"\r
STRIPE_WEBHOOK_SECRET="whsec_483**********************************d2118"\r
\r
# Optional just to keep your database safe! :D\r
DB_PASSWORD="W23**********s8e"\r
\`\`\`\r
\r
### Run the Next.js Client\r
\r
<div className="steps">\r
  <div className="step">\r
    **Start Development Server**: \r
    - Open a separate terminal. \r
    - Run the following command to start the development server: \r
    \`\`\`bash \r
    pnpm dev \r
    \`\`\` \r
    - Note that webhook forwarding and the development server must be running concurrently in two separate terminals for the application to work correctly.\r
  </div>\r
  <div className="step">\r
    **View Application**: \r
    - Navigate to [http://localhost:3000](http://localhost:3000) in your browser to see the application rendered.\r
  </div>\r
</div>\r
\r
## Going live\r
\r
### Archive testing products\r
\r
Archive all test mode Stripe products before going live. Before creating your live mode products, make sure to follow the steps below to set up your live mode env vars and webhooks.\r
\r
### Configure production environment variables\r
\r
To run the project in live mode and process payments with Stripe, switch Stripe from "test mode" to "production mode." Your Stripe API keys will be different in production mode, and you will have to create a separate production mode webhook. Copy these values and paste them into Vercel, replacing the test mode values.`,g=`---\r
title: Vercel\r
description: Setting up Vercel\r
---\r
\r
import { Step, Steps } from 'fumadocs-ui/components/steps';\r
\r
## Develop locally\r
\r
If you haven't already done so, clone your Github repository to your local machine.\r
\r
### Configure Auth\r
\r
Follow [this guide](https://supabase.com/docs/guides/auth/social-login/auth-github) to set up an OAuth app with GitHub and configure Supabase to use it as an auth provider.\r
\r
In your Supabase project, navigate to [auth > URL configuration](https://app.supabase.com/project/_/auth/url-configuration) and set your main production URL (e.g. https://your-deployment-url.vercel.app) as the site url.\r
\r
Next, in your Vercel deployment settings, add a new **Production** environment variable called \`NEXT_PUBLIC_SITE_URL\` and set it to the same URL. Make sure to deselect preview and development environments to make sure that preview branches and local development work correctly.\r
\r
### Install dependencies\r
\r
Ensure you have [pnpm](https://pnpm.io/installation) installed and run:\r
\r
\`\`\`bash\r
pnpm install\r
\`\`\`\r
\r
### Local development with Supabase\r
\r
It's highly recommended to use a local Supabase instance for development and testing. We have provided a set of custom commands for this in \`package.json\`.\r
\r
First, you will need to install [Docker](https://www.docker.com/get-started/). You should also copy or rename:\r
\r
- \`.env.local.example\` -> \`.env.local\`\r
- \`.env.example\` -> \`.env\`\r
\r
Next, run the following command to start a local Supabase instance and run the migrations to set up the database schema:\r
\r
\`\`\`bash\r
pnpm supabase:start\r
\`\`\`\r
\r
The terminal output will provide you with URLs to access the different services within the Supabase stack. The Supabase Studio is where you can make changes to your local database instance.\r
\r
Copy the value for the \`service_role_key\` and paste it as the value for the \`SUPABASE_SERVICE_ROLE_KEY\` in your \`.env.local\` file.\r
\r
You can print out these URLs at any time with the following command:\r
\r
\`\`\`bash\r
pnpm supabase:status\r
\`\`\`\r
\r
To link your local Supabase instance to your project, run the following command, navigate to the Supabase project you created above, and enter your database password.\r
\r
\`\`\`bash\r
pnpm supabase:link\r
\`\`\`\r
\r
If you need to reset your database password, head over to [your database settings](https://supabase.com/dashboard/project/_/settings/database) and click "Reset database password", and this time copy it across to a password manager! 😄\r
\r
🚧 Warning: This links our Local Development instance to the project we are using for \`production\`. Currently, it only has test records, but once it has customer data, we recommend using [Branching](https://supabase.com/docs/guides/platform/branching) or manually creating a separate \`preview\` or \`staging\` environment, to ensure your customer's data is not used locally, and schema changes/migrations can be thoroughly tested before shipping to \`production\`.\r
\r
Once you've linked your project, you can pull down any schema changes you made in your remote database with:\r
\r
\`\`\`bash\r
pnpm supabase:pull\r
\`\`\`\r
\r
You can seed your local database with any data you added in your remote database with:\r
\r
\`\`\`bash\r
pnpm supabase:generate-seed\r
pnpm supabase:reset\r
\`\`\`\r
\r
🚧 Warning: this is seeding data from the \`production\` database. Currently, this only contains test data, but we recommend using [Branching](https://supabase.com/docs/guides/platform/branching) or manually setting up a \`preview\` or \`staging\` environment once this contains real customer data.\r
\r
You can make changes to the database schema in your local Supabase Studio and run the following command to generate TypeScript types to match your schema:\r
\r
\`\`\`bash\r
pnpm supabase:generate-types\r
\`\`\`\r
\r
You can also automatically generate a migration file with all the changes you've made to your local database schema with the following command:\r
\r
\`\`\`bash\r
pnpm supabase:generate-migration\r
\`\`\`\r
\r
And push those changes to your remote database with:\r
\r
\`\`\`bash\r
pnpm supabase:push\r
\`\`\`\r
\r
Remember to test your changes thoroughly in your \`local\` and \`staging\` or \`preview\` environments before deploying them to \`production\`!\r
\r
### Use the Stripe CLI to test webhooks\r
\r
Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to [login to your Stripe account](https://stripe.com/docs/stripe-cli#login-account):\r
\r
\`\`\`bash\r
pnpm stripe:login\r
\`\`\`\r
\r
This will print a URL to navigate to in your browser and provide access to your Stripe account.\r
\r
Next, start local webhook forwarding:\r
\r
\`\`\`bash\r
pnpm stripe:listen\r
\`\`\`\r
\r
Running this Stripe command will print a webhook secret (such as, \`whsec_***\`) to the console. Set \`STRIPE_WEBHOOK_SECRET\` to this value in your \`.env.local\` file. If you haven't already, you should also set \`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\` and \`STRIPE_SECRET_KEY\` in your \`.env.local\` file using the **test mode**(!) keys from your Stripe dashboard.\r
\r
### Run the Next.js client\r
\r
In a separate terminal, run the following command to start the development server:\r
\r
\`\`\`bash\r
pnpm dev\r
\`\`\`\r
\r
Note that webhook forwarding and the development server must be running concurrently in two separate terminals for the application to work correctly.\r
\r
Finally, navigate to [http://localhost:3000](http://localhost:3000) in your browser to see the application rendered.\r
\r
## Going live\r
\r
### Archive testing products\r
\r
Archive all test mode Stripe products before going live. Before creating your live mode products, make sure to follow the steps below to set up your live mode env vars and webhooks.\r
\r
### Configure production environment variables\r
\r
To run the project in live mode and process payments with Stripe, switch Stripe from "test mode" to "production mode." Your Stripe API keys will be different in production mode, and you will have to create a separate production mode webhook. Copy these values and paste them into Vercel, replacing the test mode values.\r
`,_=`---\r
title: Introduction\r
description: Short love letter\r
icon: Album\r
---\r
\r
Welcome to Hikari, my open source project for building a SaaS application with Next.js.\r
\r
This project is a Next.js starter kit that is designed to help you get up and running with your next SaaS project. Special thanks to the following projects for making this possible:\r
\r
- [Supabase](https://github.com/supabase/supabase)\r
- [Stripe](https://github.com/stripe)\r
- [Vercel](https://github.com/vercel/vercel)\r
- [MagicUI](https://github.com/magicuidesign/magicui)\r
- [SyntaxUI](https://github.com/SyntaxUI/syntaxui)\r
- [Fumadocs](https://github.com/fuma-nama/fumadocs)\r
\r
## Configuring your Environment Variables\r
\r
<Cards>\r
  <Card\r
    title="Configure Supabase"\r
    href="/docs/configure/supabase"\r
    description="Learn how to develop with supabase locally and in production"\r
  />\r
  <Card\r
    title="Configure Stripe"\r
    href="/docs/configure/stripe"\r
    description="Learn how to use stripe in your SaaS application"\r
  />\r
</Cards>\r
`,v=`---\r
title: Quick Start\r
description: Getting Started with Hikari\r
icon: Album\r
---\r
\r
## Dependencies\r
\r
This package uses the following softwares and tools. You will need to install them before you can get started:\r
\r
- **PNPM** - Package Manager\r
- **Docker** - Containerization. Don't worry you won't touch this very much. _wink wink_\r
- **Stripe CLI** - Command Line Interface for Stripe\r
- **Supabase CLI** - Command Line Interface for Supabase\r
\r
<div className="steps">\r
  <div className="step">\r
    **Install PNPM**: Download and install PNPM from\r
    [here](https://pnpm.io/installation), or install it using npm or brew:\r
    \`\`\`bash title="terminal" npm install -g pnpm # brew install pnpm \`\`\`\r
  </div>\r
  <div className="step">\r
    **Install Docker**: Download and install Docker from\r
    [here](https://www.docker.com/get-started/).\r
  </div>\r
  <div className="step">\r
    **Install Stripe CLI**: Download and install Stripe CLI from\r
    [here](https://stripe.com/docs/stripe-cli).\r
  </div>\r
  <div className="step">\r
    **Install Supabase CLI**: Download and install Supabase CLI from\r
    [here](https://supabase.com/docs/guides/cli/getting-started#installing-the-supabase-cli).\r
  </div>\r
</div>\r
\r
## Configuring your Environment Variables\r
\r
<Cards>\r
  <Card\r
    title="Configure Supabase"\r
    href="/docs/configure/supabase"\r
    description="Learn how to develop with supabase locally and in production"\r
  />\r
  <Card\r
    title="Configure Stripe"\r
    href="/docs/configure/stripe"\r
    description="Learn how to use stripe in your SaaS application"\r
  />\r
</Cards>\r
`,y=`---\r
title: Example - Updating your user avatar\r
description: Updating your user avatar using supabase storage\r
---\r
\r
import Image from "next/image";\r
\r
## Updating your user avatar\r
\r
Go to \`http://localhost:3000/dashboard/account\` and you will see a \`Avatar Image\` form under the \`Personal Information\` section.\r
\r
<Image src="/images/supabase-storage-4.png" alt="Supabase Storage" width={600} height={400} />\r
\r
Now that you have set up your supabase storage, you should be able to upload an image to your supabase storage, and replace your avatar image with your new uploaded image.\r
\r
<Image src="/images/supabase-storage-5.png" alt="Supabase Storage" width={600} height={400} />\r
\r
## But wait, how does this work?\r
\r
### Image Upload Component\r
\r
The \`ImageUpload\` component allows users to select and upload a new avatar image. Here's a breakdown of the key parts of the code:\r
\r
\`\`\`typescript title="app/(dashboard)/dashboard/account/image-upload.tsx"\r
'use client'\r
import { ChangeEvent, useRef, useState, useTransition } from "react";\r
import { toast } from "@/components/ui/use-toast";\r
import Image from "next/image";\r
import { uploadImage } from "@/utils/supabase/storage/client";\r
import { convertBlobUrlToFile } from "@/lib/utils";\r
import { Button } from "@/components/ui/button";\r
import { useRouter } from 'next/navigation';\r
\r
export function ImageUpload({ user }: { user: any }) {\r
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);\r
  const [imageUrl, setImageUrl] = useState("");\r
  const imageInputRef = useRef<HTMLInputElement>(null);\r
  const [isPending, startTransition] = useTransition();\r
  const router = useRouter();\r
\r
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {\r
    if (e.target.files) {\r
      const file = e.target.files[0];\r
      const newImageUrl = URL.createObjectURL(file);\r
      setImageUrl(newImageUrl);\r
    }\r
  };\r
\r
  const handleClickUploadImagesButton = async () => {\r
    if (!user) {\r
      toast({\r
        title: "You need to be logged in to upload image",\r
        variant: "destructive",\r
      });\r
      return;\r
    }\r
\r
    if (!imageUrl.length) {\r
      toast({\r
        title: "Please select an image to upload",\r
        variant: "destructive",\r
      });\r
      return;\r
    }\r
\r
    startTransition(async () => {\r
      const imageFile = await convertBlobUrlToFile(imageUrl);\r
      const { imageUrl: uploadedImageUrl, error } = await uploadImage({\r
        file: imageFile,\r
        bucket: "avatar",\r
        folder: user.id,\r
      });\r
\r
      if (error) {\r
        toast({\r
          title: error,\r
          variant: "destructive",\r
        });\r
        return;\r
      }\r
\r
      if (uploadedImageUrl) {\r
        setAvatarUrl(uploadedImageUrl);\r
        await fetch('/api/update-avatar', {\r
          method: 'POST',\r
          headers: { 'Content-Type': 'application/json' },\r
          body: JSON.stringify({ userId: user.id, avatarUrl: uploadedImageUrl }),\r
        });\r
\r
        toast({\r
          title: "Successfully uploaded image",\r
          variant: "default",\r
        });\r
        setImageUrl("");\r
        router.refresh();\r
      }\r
    });\r
  };\r
\r
  return (\r
    <div className="flex flex-col gap-4 justify-center items-left py-6">\r
      <span className="text-sm font-medium">Avatar Image</span>\r
      <div className="ml-1 w-24 h-24 rounded-lg overflow-hidden border-2 border-primary p-0.5">\r
        <Image\r
          src={imageUrl || avatarUrl || '/default-avatar.png'}\r
          width={96}\r
          height={96}\r
          alt="User Avatar"\r
          className="object-cover rounded-lg"\r
        />\r
      </div>\r
      <input\r
        type="file"\r
        hidden\r
        ref={imageInputRef}\r
        onChange={handleImageChange}\r
        disabled={isPending}\r
      />\r
      <div className="space-y-2">\r
        <Button\r
          variant="outline"\r
          onClick={() => imageInputRef.current?.click()}\r
          disabled={isPending}\r
          className="mt-2"\r
        >\r
          Select New Image\r
        </Button>\r
        {imageUrl && (\r
          <Button\r
            onClick={handleClickUploadImagesButton}\r
            variant="default"\r
            disabled={isPending}\r
            className="ml-2"\r
          >\r
            {isPending ? "Uploading..." : "Upload Image"}\r
          </Button>\r
        )}\r
      </div>\r
      <p className="text-sm text-gray-500">\r
        {!imageUrl && !isPending && "Select a new image to update your avatar."}\r
        {imageUrl && !isPending && "Click 'Upload Image' to set your new avatar."}\r
        {isPending && "Uploading your new avatar..."}\r
      </p>\r
    </div>\r
  );\r
}\r
\`\`\`\r
\r
### API Route for Updating Avatar\r
\r
To update the user's avatar in the database, we use an API route:\r
\r
\`\`\`typescript title="app/api/update-avatar/route.ts"\r
import { NextResponse } from 'next/server';\r
import { createClient } from '@/utils/supabase/server';\r
\r
export async function POST(request: Request) {\r
  const supabase = createClient();\r
  const { userId, avatarUrl }: { userId: string; avatarUrl: string } = await request.json();\r
\r
  const { data, error } = await supabase\r
    .from('users')\r
    .update({ avatar_url: avatarUrl })\r
    .eq('id', userId);\r
\r
  if (error) {\r
    return NextResponse.json({ error: error.message }, { status: 400 });\r
  }\r
\r
  return NextResponse.json({ data });\r
}\r
\`\`\`\r
\r
This setup allows users to upload a new avatar image, which is then stored in Supabase Storage and the URL is updated in the user's profile in the database.`,b=`---\r
title: Setting up Policies \r
description: Implementing supabase storage in your project\r
---\r
\r
import Image from "next/image";\r
\r
Only continue with this section if you have already set up supabase locally in your project. If you have \r
not yet set up supabase locally, please refer to the [previous section](/docs/configure/supabase/local) for instructions.\r
\r
In order to set up supabase storage in your project, you need to follow these steps:\r
\r
1. First, go to your local instance of Supabase client and create a new bucket. If you followed the steps in the [previous section](/docs/configure/supabase/local), \r
the url should be \`http://127.0.0.1:54323/project/default/storage/\`.\r
<Image src="/images/supabase-storage-1.png" alt="Supabase Storage" width={600} height={400} />\r
\r
2. Configure the bucket with the name "images" and the following settings, then click on the "Save" button:\r
\r
<Image src="/images/supabase-storage-2.png" alt="Supabase Storage" width={600} height={400} />\r
\r
3. Click on "Policies" tab in the same page and create a new policy for the bucket "images". Now we will need to add two policies here. \r
We are adding Row Level Security (RLS) policies to our Supabase storage to control who can insert, select, update, and delete assets within our bucket.\r
\r
<Image src="/images/supabase-storage-3.png" alt="Supabase Storage" width={600} height={400} />\r
\r
4. Click "Get started quickly" and choose the following options:\r
- "Allow access to JPG images in a public folder to anonymous users". Click \`Select\` for the allowed operation, and choose \`anon\` for the target roles. Click "Review" and then "Save policy".\r
\r
<Image src="/images/policy-anonymous-1.png" alt="Policy for Anonymous Users" width={600} height={400} />\r
\r
- "Give users access to a folder only to authenticated users". Click all options under the allowed operations and choose \`authenticated\` for the target roles. Click "Review" and then "Save policy".\r
\r
<Image src="/images/policy-authenticated-1.png" alt="Policy for Authenticated Users" width={600} height={400} />\r
\r
Once you've saved the policies, "Authenticated" users should be able to upload/edit/delete files in the \`images\` folder. \r
\r
`,x=`---\r
title: Components\r
description: Components\r
---\r
\r
## Code Block\r
\r
\`\`\`js\r
console.log('Hello World');\r
\`\`\`\r
\r
## Cards\r
\r
<Cards>\r
  <Card title="Learn more about Next.js" href="https://nextjs.org/docs" />\r
  <Card title="Learn more about Fumadocs" href="https://fumadocs.vercel.app" />\r
</Cards>\r
`,S=`---\r
title: Example - Creating and editing posts using tRPC\r
description: Implementing tRPC in your Supabase Project\r
---\r
\r
import Image from "next/image";\r
\r
## Using tRPC in Your Application\r
\r
### 1. Defining Routes and Mutations\r
\r
In your \`server/api/routers/posts.ts\`, you define routes using \`createTRPCRouter\`. Each route can be a query or a mutation. For example, to create a post, you define a mutation like this:\r
\r
\`\`\`typescript\r
import { z } from "zod";\r
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";\r
import { createClient } from "@/utils/supabase/server";\r
import { TRPCError } from "@trpc/server";\r
\r
export const postsRouter = createTRPCRouter({\r
  create: protectedProcedure\r
    .input(z.object({ title: z.string().min(1), content: z.string().nullable() }))\r
    .mutation(async ({ input, ctx }) => {\r
      const { data, error } = await createClient()\r
        .from('posts')\r
        .insert({\r
          user_id: ctx.user.id,\r
          title: input.title,\r
          content: input.content,\r
          created_at: new Date().toISOString(),\r
          updated_at: new Date().toISOString(),\r
        })\r
        .select()\r
        .single();\r
\r
      if (error) {\r
        console.error("Error creating post:", error);\r
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });\r
      }\r
      return data;\r
    }),\r
});\r
\`\`\`\r
\r
If you have already noticed, we use a **protectedProcedure** in the above example. This is because we use the \`auth.session()\` middleware in the \`server/api/trpc/context.ts\` file. This is a simple check to ensure that the user is authenticated before they can create or edit a post.\r
\r
If you are using any database operation that requires authentication, you will need to use the \`protectedProcedure\` wrapper.\r
\r
To edit a post, you would use a similar mutation with the necessary input parameters:\r
\r
\`\`\`typescript\r
  update: protectedProcedure\r
    .input(z.object({ id: z.number(), title: z.string().min(1), content: z.string().nullable() }))\r
    .mutation(async ({ input, ctx }) => {\r
      const { data, error } = await createClient()\r
        .from('posts')\r
        .update({ \r
          title: input.title, \r
          content: input.content, \r
          updated_at: new Date().toISOString() \r
        })\r
        .eq('id', input.id)\r
        .eq('user_id', ctx.user.id)\r
        .select()\r
        .single();\r
\r
      if (error) {\r
        console.error("Error updating post:", error);\r
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });\r
      }\r
      return data;\r
    }),\r
\`\`\`\r
\r
And finally, to get all posts, you would use a query:\r
\r
\`\`\`typescript\r
  getAll: protectedProcedure\r
    .query(async ({ ctx }) => {\r
      const { data, error } = await createClient()\r
        .from('posts')\r
        .select('*')\r
        .eq('user_id', ctx.user.id)\r
        .order('created_at', { ascending: false });\r
\r
      if (error) {\r
        console.error("Error fetching posts:", error);\r
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });\r
      }\r
      \r
      return data ?? [];\r
    }),\r
\`\`\`\r
\r
The structure of building API's with tRPC is simple. If you want to see the rest of the code for the posts router, you can view it [here](https://github.com/antoineross/hikari/server/api/routers/posts.ts).\r
\r
### 2. Calling tRPC in the Client\r
\r
In your client component, such as \`components/posts.tsx\`, you can call these routes using hooks provided by tRPC. For example, to fetch all posts, you would use:\r
\r
\`\`\`typescript\r
import { useQuery } from "@tanstack/react-query";\r
import { trpc } from "@/utils/trpc";\r
\r
// Getting the posts\r
\r
const { data: posts, isLoading, error: fetchError } = api.posts.getAll.useQuery()\r
\r
// Creating a post\r
const createPost = api.posts.create.useMutation({\r
  onSuccess: async () => {\r
    await utils.posts.getAll.invalidate()\r
    setNewPost({ title: '', content: '' })\r
    toast({\r
      title: "Success",\r
      description: "Post created successfully!",\r
    })\r
  },\r
})\r
\r
// Updating a post\r
const updatePost = api.posts.update.useMutation({\r
  onSuccess: async () => {\r
    await utils.posts.getAll.invalidate()\r
    setEditingPost(null)\r
    toast({\r
      title: "Success",\r
      description: "Post updated successfully!",\r
    })\r
  },\r
})\r
\r
// Deleting a post\r
const deletePost = api.posts.delete.useMutation({\r
  onSuccess: async () => {\r
    await utils.posts.getAll.invalidate()\r
    toast({\r
      title: "Success",\r
      description: "Post deleted successfully!",\r
    })\r
  },\r
})\r
\`\`\`\r
\r
### 3. Benefits of Using tRPC\r
\r
tRPC streamlines the development process by allowing you to define your API routes and types in one place, reducing the need for boilerplate code. This leads to quicker development cycles and a more cohesive codebase compared to traditional REST APIs. With tRPC, you can easily manage your API calls and ensure type safety across your application.\r
\r
### Important Note\r
\r
A new SQL file for the posts has been added. If anyone from a previous version of Hikari wants to try it locally, they need to run [this](https://github.com/antoineross/hikari/blob/main/supabase/migrations/20240918141953_posts.sql) SQL file to set up the necessary database structure.\r
`,ne=`---\r
title: Setting up tRPC \r
description: Implementing tRPC in your Supabase Project\r
---\r
\r
import Image from "next/image";\r
\r
## Installation\r
\r
In order to set up tRPC in your project, you need to add the following dependencies to your project:\r
\r
\`\`\`bash\r
pnpm install @trpc/server @trpc/client @trpc/next @trpc/react-query @tanstack/react-query\r
\`\`\`\r
\r
## Setting up tRPC in your project\r
\r
There are two folders of note when it comes to tRPC in your project. These are:\r
\r
<div className="steps">\r
  <div className="step">\r
    **server/**: This folder contains the tRPC API routes. You will primarily work here to define your API procedures and handle requests.\r
  </div>\r
  <div className="step">\r
    **trpc/**:  This folder is for tRPC configuration, including the setup of routers and context. Changes here are less frequent unless you're adding new procedures or modifying the configuration.\r
  </div>\r
  <div className="step">\r
    **app/layout.tsx**: In order to use tRPC in your project, you will need to add the TRPCReactProvider to your project. This is done in the \`app/layout.tsx\` file.\r
\r
    \`\`\`tsx title="app/layout.tsx"\r
      import { TRPCReactProvider } from "@/trpc/react";\r
\r
      export default function RootLayout({\r
        children,\r
      }: {\r
        children: React.ReactNode;\r
      }) {\r
        return (\r
            <html lang="en">\r
              <body>\r
                <TRPCReactProvider>\r
                  {children}\r
                </TRPCReactProvider>\r
              </body>\r
            </html>\r
        );\r
      }\r
    \`\`\`\r
  </div>\r
  <div className="step">\r
    **app/api/trpc/[trpc]route.ts**: This file is the entry point for tRPC. It is used to create the tRPC router and handle requests.\r
    \r
    \`\`\`tsx title="app/api/trpc/[trpc]route.ts"\r
      import { fetchRequestHandler } from "@trpc/server/adapters/fetch";\r
      import { type NextRequest } from "next/server";\r
\r
      import { env } from "@/env";\r
      import { appRouter } from "@/server/api/root";\r
      import { createTRPCContext } from "@/server/api/trpc";\r
\r
      /**\r
       * This wraps the \`createTRPCContext\` helper and provides the required context for the tRPC API when\r
       * handling a HTTP request (e.g. when you make requests from Client Components).\r
       */\r
      const createContext = async (req: NextRequest) => {\r
        return createTRPCContext({\r
          headers: req.headers,\r
        });\r
      };\r
\r
      const handler = (req: NextRequest) =>\r
        fetchRequestHandler({\r
          endpoint: "/api/trpc",\r
          req,\r
          router: appRouter,\r
          createContext: () => createContext(req),\r
          onError:\r
            env.NODE_ENV === "development"\r
              ? ({ path, error }) => {\r
                  console.error(\r
                    \`❌ tRPC failed on \${path ?? "<no-path>"}: \${error.message}\`\r
                  );\r
                }\r
              : undefined,\r
        });\r
\r
export { handler as GET, handler as POST };\r
\r
    \`\`\`\r
\r
      This file uses a local **env.js** file to store your environment variables. So make sure to add that in your project. [Here](https://github.com/antoineross/hikari/blob/main/env.js) is an example of what the env file should look like. \r
\r
  </div>\r
\r
</div>\r
\r
\r
\r
## Creating a tRPC Router\r
tRPC shines by enabling you to create a router that links your frontend and backend effortlessly. When you change props or types between the two, those updates are automatically reflected in the router. This feature *accelerates* your development cycles.\r
\r
This router is essential for managing all your API requests. You can find the \`router.ts\` file in the \`trpc/\` folder. This is where you'll define your API procedures.\r
\r
`,C=Object.assign({"../../content/blog/complete-setup.mdx":a,"../../content/blog/integration-supacrawler.mdx":o,"../../content/blog/introduction.mdx":s,"../../content/blog/roadmap.mdx":c,"../../content/blog/what-is-hikari.mdx":l,"../../content/blog/why-build-hikari.mdx":u}),w=Object.assign({"../../content/docs/configure/index.mdx":d,"../../content/docs/configure/stripe/index.mdx":f,"../../content/docs/configure/stripe/local.mdx":ee,"../../content/docs/configure/stripe/production.mdx":te,"../../content/docs/configure/supabase/index.mdx":p,"../../content/docs/configure/supabase/local.mdx":m,"../../content/docs/configure/supabase/supabase.mdx":h,"../../content/docs/configure/vercel.mdx":g,"../../content/docs/index.mdx":_,"../../content/docs/quick-start.mdx":v,"../../content/docs/storage/example.mdx":y,"../../content/docs/storage/setting-up.mdx":b,"../../content/docs/test.mdx":x,"../../content/docs/trpc/example.mdx":S,"../../content/docs/trpc/setup.mdx":ne});function T(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#039;`)}function E(e){return T(e).replaceAll("`",`&#096;`)}function re(e){let t=e.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);return t?{data:t[1].split(/\r?\n/).reduce((e,t)=>{let n=t.indexOf(`:`);if(n===-1)return e;let r=t.slice(0,n).trim();return e[r]=t.slice(n+1).trim().replace(/^["']|["']$/g,``),e},{}),body:t[2].trim()}:{data:{},body:e.trim()}}function ie(e){return e.toLowerCase().trim().replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)}function ae(e,t){let n=ie(e)||`section`,r=t.get(n)??0;return t.set(n,r+1),r===0?n:`${n}-${r+1}`}function D(e){let t=[],n=T(e);return n=n.replace(/`([^`]+)`/g,(e,n)=>{let r=`__INLINE_CODE_${t.length}__`;return t.push(`<code>${n}</code>`),r}),n=n.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(e,t,n)=>`<a href="${E(n)}">${t}</a>`),n=n.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`),t.forEach((e,t)=>{n=n.replace(`__INLINE_CODE_${t}__`,e)}),n}function oe(e){let t={};for(let n of e.matchAll(/(\w+)=["']([^"']*)["']/g))t[n[1]]=n[2];return t}function O(e){let t=[...e.matchAll(/<Card\s+([^>]+?)\/>/g)].map(e=>oe(e[1]));return t.length?[`<div class="docs-card-grid">`,...t.map(e=>{let t=T(e.title??`Open page`),n=e.description?`<span class="docs-card-description">${T(e.description)}</span>`:``;return`<a class="docs-card" href="${E(e.href??`#`)}"><span class="docs-card-title">${t}</span>${n}</a>`}),`</div>`].join(``):``}function k(e){let t=new Map,n=e.replace(/<Cards>([\s\S]*?)<\/Cards>/g,(e,n)=>{let r=`__DOC_CARD_BLOCK_${t.size}__`;return t.set(r,O(n)),`\n${r}\n`}),r=[],i=[],a=new Map;for(let e of n.split(/\n{2,}/)){let n=e.trim();if(!n)continue;if(t.has(n)){r.push(n);continue}if(n.startsWith("```")){let e=n.replace(/^```[^\n]*\n?/,``).replace(/\n?```$/,``);r.push(`<pre><code>${T(e)}</code></pre>`);continue}let o=n.match(/^(#{1,3})\s+(.+)$/);if(o){let e=o[1].length,t=o[2].trim(),n=ae(t,a);i.push({depth:e,id:n,text:t}),r.push(`<h${e} id="${n}">${D(t)}</h${e}>`);continue}if(/^[-*]\s+/m.test(n)){r.push(`<ul>${n.split(/\r?\n/).map(e=>`<li>${D(e.replace(/^[-*]\s+/,``))}</li>`).join(``)}</ul>`);continue}r.push(`<p>${D(n.replace(/\r?\n/g,` `))}</p>`)}let o=r.join(`
`);for(let[e,n]of t.entries())o=o.replaceAll(e,n);return{html:o,toc:i}}function A(e,t){let[,n=``]=e.replace(/\\/g,`/`).split(`/content/${t}/`),r=n.replace(/\.mdx$/,``).split(`/`);return r.at(-1)===`index`&&r.pop(),r.join(`/`)}function j(e){let t=e.replace(/```[\s\S]*?```/g,``);for(let e of t.split(/\r?\n/)){let t=e.trim();if(!(!t||t.startsWith(`#`)||t.startsWith(`<`)||t.startsWith(`- `)||/^\d+\.\s/.test(t)))return t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,`$1`).replace(/[*`]/g,``).slice(0,180)}return``}function M(e,t,n,r){let{data:i,body:a}=re(t),o=A(e,n),s=k(a),c=i.title??o.split(`/`).at(-1)??`Untitled`,l=i.description??j(a);return{slug:o,href:o?`${r}/${o}`:r,title:c,description:l,date:i.date,author:i.author,excerpt:l,bodyHtml:s.html,toc:s.toc}}function N(e){let t=Object.entries(C).map(([e,t])=>{let{bodyHtml:n,toc:r,...i}=M(e,t,`blog`,`/blog`);return i}).sort((e,t)=>new Date(t.date??t.slug).getTime()-new Date(e.date??e.slug).getTime());return typeof e==`number`?t.slice(0,e):t}function P(e){let t=Object.entries(C).find(([t])=>A(t,`blog`)===e);if(!t)throw Error(`Blog post not found`);return M(t[0],t[1],`blog`,`/blog`)}function F(e){let t=Object.entries(w).find(([t])=>A(t,`docs`)===e);if(!t)throw Error(`Doc page not found`);return M(t[0],t[1],`docs`,`/docs`)}async function I(e){let t=new URL(e,window.location.origin);if(t.pathname===`/api/content/blog`){let e=Number(t.searchParams.get(`limit`));return N(Number.isFinite(e)&&e>0?e:void 0)}if(t.pathname.startsWith(`/api/content/blog/`))return P(decodeURIComponent(t.pathname.replace(`/api/content/blog/`,``)));if(t.pathname===`/api/content/docs`)return F(``);if(t.pathname.startsWith(`/api/content/docs/`))return F(decodeURIComponent(t.pathname.replace(`/api/content/docs/`,``)));throw Error(`Unsupported content URL: ${e}`)}t(),e();var L=new Map,R=`enlearn_access_token`,z=`enlearn_refresh_token`,B=null;function V(){return`http://localhost:3002/api`.replace(/\/+$/,``)}function H(e){return e.replace(/^\/api/,``)}function U(){return localStorage.getItem(R)||``}function W(){return localStorage.getItem(z)||``}function G(e){let t=e?.session;t?.access_token&&(localStorage.setItem(R,t.access_token),t.refresh_token&&localStorage.setItem(z,t.refresh_token))}function K(){localStorage.removeItem(R),localStorage.removeItem(z)}function q(e,t){if(!t)return e;let n=new URL(e,window.location.origin);for(let[e,r]of Object.entries(t))r!=null&&n.searchParams.set(e,String(r));return n.pathname+n.search+n.hash}function J(e){if(!e)return null;try{return JSON.parse(e)}catch{return{message:e}}}function se(e,t){if(typeof e==`string`)return e;if(!e||typeof e!=`object`)return t;let n=e,r=Array.isArray(n.message)?n.message.filter(Boolean).join(`, `):n.message;return String(r??n.statusMessage??n.error??t)}function Y(e,t){let n=t.toLowerCase();return e===401||n.includes(`jwt expired`)||n.includes(`invalid jwt`)||n.includes(`invalid token`)||n.includes(`authentication required`)}function ce(e){return!e.startsWith(`/auth/refresh`)&&!e.startsWith(`/auth/signin`)&&!e.startsWith(`/auth/signup`)}function le(){window.location.pathname!==`/signin`&&$(`/signin`).catch(()=>{window.location.href=`/signin`})}function X(){let e=!!(U()||W());K(),(e||window.location.pathname.startsWith(`/dashboard`))&&le()}async function ue(){let e=W();return e?(B||=(async()=>{let t=await fetch(`${V()}/auth/refresh`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({refreshToken:e})}),n=J(await t.text());return t.ok?(G(n),!!n?.session?.access_token):!1})().catch(()=>!1).finally(()=>{B=null}),B):!1}async function Z(e,t={},n=!1){let r=H(q(e,t.query)),{query:i,body:a,...o}=t,s=new Headers(t.headers),c=U();c&&!s.has(`Authorization`)&&s.set(`Authorization`,`Bearer ${c}`),a!==void 0&&!(a instanceof FormData)&&s.set(`Content-Type`,s.get(`Content-Type`)||`application/json`);let l=await fetch(`${V()}${r}`,{...o,headers:s,body:a===void 0||a instanceof FormData?a:JSON.stringify(a)}),u=J(await l.text());if(!l.ok){let i=se(u,l.statusText);if(!n&&Y(l.status,i)&&ce(r)&&await ue())return Z(e,t,!0);throw Y(l.status,i)&&X(),Q({statusCode:l.status,statusMessage:i})}return(r.startsWith(`/auth/signin`)||r.startsWith(`/auth/signup`)||r.startsWith(`/auth/session`))&&G(u),r.startsWith(`/auth/signout`)&&K(),u}async function de(e,t={}){let n=H(e),r=String(t.method??`GET`).toUpperCase(),i=n.match(/^\/posts\/([^/]+)$/)?.[1];return r===`GET`&&n===`/posts`?Z(`/api/service`,{method:`POST`,body:{serviceName:`posts`,serviceMethod:`list`,postData:{}}}):r===`POST`&&n===`/posts`?Z(`/api/service`,{method:`POST`,body:{serviceName:`posts`,serviceMethod:`create`,postData:t.body??{}}}):r===`PUT`&&i?Z(`/api/service`,{method:`POST`,body:{serviceName:`posts`,serviceMethod:`update`,postData:{id:i,...t.body}}}):r===`DELETE`&&i?Z(`/api/service`,{method:`POST`,body:{serviceName:`posts`,serviceMethod:`delete`,postData:{id:i}}}):Z(e,t)}function fe(e,t){return L.has(e)||L.set(e,r(t())),L.get(e)}function Q(e){let t=Error(e.statusMessage??e.message??`Application error`);return t.statusCode=e.statusCode,t.statusMessage=e.statusMessage,t}async function $(e){let{router:t}=await i(async()=>{let{router:e}=await import(`./index-ChtNaXUk.js`).then(e=>e.t);return{router:e}},__vite__mapDeps([0,1,2,3,4,5]));return t.push(e)}function pe(e){let t=e.title,r=e.description,i=typeof t==`function`?n(t).value:t,a=typeof r==`function`?n(r).value:r;if(i&&(document.title=String(i)),a){let e=document.querySelector(`meta[name="description"]`);e||(e=document.createElement(`meta`),e.name=`description`,document.head.appendChild(e)),e.content=String(a)}}async function me(e,t,n={}){let i=r(n.default?n.default():null),a=r(null);try{i.value=await t()}catch(e){a.value=e}return{data:i,error:a}}async function he(e,t={}){let n=q(e,t.query);return n.startsWith(`/api/content/`)?I(n):n===`/api/auth/socket-token`?{token:U(),socketBaseUrl:`http://localhost:3002`}:n.startsWith(`/api/posts`)?de(n,t):Z(n,t)}export{pe as a,me as i,Q as n,fe as o,$ as r,he as t};