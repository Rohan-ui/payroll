/**
 * RND Technosoft Smart Multi-Channel Cold Marketing Funnel (30 Days)
 * "RND Gold Funnel" — WhatsApp + Email + LinkedIn + Phone
 *
 * 8 Touchpoints, 3 Platforms, 1 Discovery Call
 * Layer 1: 30-Day Multi-Channel Funnel
 * Layer 2: Industry-Specific Customizations
 * Layer 3: Reply-Based Branching Strategies
 */

import { whatsAppChatUrl, whatsAppDigits } from './outreach-channels';

export type CadenceChannel = 'WHATSAPP' | 'EMAIL' | 'LINKEDIN' | 'PHONE';

export interface CadenceTemplate {
  linkedin?: {
    actionType: 'CONNECT' | 'ENGAGE_POST' | 'SHARE_POST' | 'FAREWELL';
    message?: string;
    actionNote?: string;
  };
  email?: {
    subject: string;
    body: string;
  };
  whatsapp?: {
    message: string;
  };
  phone?: {
    pitchScript: string;
    afterCallTakenWhatsApp: string;
    missedCallWhatsApp: string;
  };
}

export interface CadenceStep {
  stepIndex: number;
  dayNumber: number; // 1, 5, 10, 15, 20, 25, 30
  dayOffset: number; // 0, 4, 9, 14, 19, 24, 29 days from enrollment
  title: string;
  goal: string;
  channels: CadenceChannel[];
  timingGuide: string;
  roleNote: string;
  templates: CadenceTemplate;
}

export interface IndustryConfig {
  key: string;
  name: string;
  tagline: string;
  portfolioHighlight: string;
  valueTip: string;
  auditHook: string;
}

export interface ReplyBranch {
  key: string;
  label: string;
  triggerCondition: string;
  nextLeadTemperature: 'WARM' | 'HOT' | 'COLD' | 'LOST';
  suggestedAction: string;
  recommendedResponseScript: string;
  whatsappMessage: string;
  emailMessage?: {
    subject: string;
    body: string;
  };
}

export interface CadenceState {
  funnelName: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'BRANCHED' | 'CONVERTED';
  enrolledAt: string; // ISO date
  /** The date Day 1 was set to start on at import (YYYY-MM-DD), when one was given. */
  startDate?: string;
  industry: string;
  currentStepIndex: number;
  currentDay: number;
  nextDueAt: string;
  completedSteps: Array<{
    /** The playbook step (CRM Masters) completed; absent on records made before it was kept. */
    stepId?: string;
    stepIndex: number;
    dayNumber: number;
    completedAt: string;
    channelsUsed: CadenceChannel[];
    notes?: string;
  }>;
  branchReply?: {
    branchKey: string;
    repliedAt: string;
    leadFeedback: string;
    actionTaken: string;
  };
  convertedToOpportunity?: boolean;
  convertedAt?: string;
  opportunityDealValue?: number;
  opportunityPipelineId?: string;
  opportunityStageId?: string;
  /**
   * What was done on each channel of a touchpoint, by day ("1", "10"…). A
   * channel can be done while its day is still open: the day completes only
   * when it is marked complete. Kept after the day completes, as its record.
   */
  channelActions?: Record<string, Partial<Record<CadenceChannel, CadenceChannelAction>>>;
}

/**
 * One channel of one touchpoint. Email: SENDING while the send is in flight,
 * then SENT or FAILED. WhatsApp and LinkedIn, sent by hand outside the CRM:
 * OPENED (the chat or profile was opened), COPIED (the message was copied),
 * and SENT only when the member confirms sending it (confirmation USER).
 */
export type CadenceChannelAction = {
  /** NOT_AVAILABLE: the lead has no profile or number there (marked by a member), so the day doesn't wait for it. */
  status: 'SENDING' | 'SENT' | 'FAILED' | 'OPENED' | 'COPIED' | 'NOT_AVAILABLE';
  attempt: number;
  executedBy: { memberId: string; name: string };
  startedAt: string;
  sentAt?: string;
  failedAt?: string;
  /** A failure reason that names no account details. */
  failure?: string;
  from?: { name: string | null; email: string };
  to?: string;
  subject?: string;
  messageId?: string | null;
  activityId?: string;
  openedAt?: string;
  copiedAt?: string;
  /** WhatsApp and LinkedIn: SENT is the member's confirmation that they sent it there (the CRM can't see it). */
  confirmation?: 'USER';
  /** WhatsApp and LinkedIn: the message as sent (clipped). */
  message?: string;
  /** NOT_AVAILABLE: when it was marked, and why. */
  markedAt?: string;
  reason?: string;
  /** LinkedIn: whether a conversation or the profile (or another LinkedIn page) was opened. */
  destination?: 'CONVERSATION' | 'PROFILE' | 'PAGE';
};

// -------------------------------------------------------------------------
// LAYER 2: INDUSTRY-SPECIFIC DICTIONARY
// -------------------------------------------------------------------------
export const CADENCE_INDUSTRIES: Record<string, IndustryConfig> = {
  manufacturing: {
    key: 'manufacturing',
    name: 'Manufacturing & Industrial',
    tagline: 'machinery manufacturers, engineering works, and industrial equipment plants',
    portfolioHighlight: 'custom B2B product catalogs, plant virtual tours, and export-ready websites',
    valueTip: '82% of industrial buyers research vendor certifications online before placing an RFQ.',
    auditHook: 'manufacturing website layout, Google Maps plant visibility, and RFQ inquiry funnel'
  },
  healthcare: {
    key: 'healthcare',
    name: 'Hospital, Healthcare & Pharma',
    tagline: 'multi-speciality hospitals, diagnostic chains, pharma exporters, and clinics',
    portfolioHighlight: 'NABH-compliant hospital portals, doctor appointment booking systems, and patient inquiry workflows',
    valueTip: 'Over 70% of patients check Google reviews and doctor credentials before scheduling a consultation.',
    auditHook: 'doctor profiling, mobile appointment UX, and local Google My Business health rating'
  },
  travel: {
    key: 'travel',
    name: 'Travel, Tourism & Hospitality',
    tagline: 'destination management companies, luxury resorts, and tour operators',
    portfolioHighlight: 'dynamic tour itinerary builders, fast-loading resort booking engines, and multi-currency checkout',
    valueTip: 'Travellers make instant booking decisions based on visual storytelling and mobile page speed under 2.5 seconds.',
    auditHook: 'itinerary showcase UX, mobile booking speed, and Google travel ranking'
  },
  school: {
    key: 'school',
    name: 'School, Coaching & Higher Education',
    tagline: 'private schools, coaching academies, universities, and colleges',
    portfolioHighlight: 'admission inquiry funnels, student fee portals, and alumni management systems',
    valueTip: 'Parents evaluate school infrastructure, faculty achievements, and admission forms on mobile during admission season.',
    auditHook: 'admission landing page conversion rate, parent portal responsiveness, and campus showcase'
  },
  finance: {
    key: 'finance',
    name: 'Finance, CA, Banking & FinTech',
    tagline: 'chartered accountants, wealth advisory firms, NBFCs, and fintech services',
    portfolioHighlight: 'secure client document portals, tax advisory landing pages, and lead-to-consultation pipelines',
    valueTip: 'High-net-worth clients prioritize data security, SSL trust badges, and authoritative thought leadership.',
    auditHook: 'brand credibility indicators, lead capture privacy, and financial advisory trust score'
  },
  chemical: {
    key: 'chemical',
    name: 'Chemical, Petrochem & Polymers',
    tagline: 'specialty chemical manufacturers, bulk pharma suppliers, and polymer exporters',
    portfolioHighlight: 'TDS/MSDS document download portals, regulatory compliance showcases, and overseas distributor inquiries',
    valueTip: 'International importers check REACH/ISO certifications and response time on quotation forms before initiating contact.',
    auditHook: 'technical specification downloads, international SEO visibility, and export lead forms'
  },
  textile: {
    key: 'textile',
    name: 'Textile, Apparel & Garments',
    tagline: 'fabric mills, garment exporters, ethnic wear brands, and apparel manufacturers',
    portfolioHighlight: 'lookbook product galleries, fabric specification filters, and B2B wholesale order inquiry portals',
    valueTip: 'Wholesale textile buyers look for clear fabric GSM details, pattern galleries, and one-click WhatsApp sample requests.',
    auditHook: 'digital lookbook loading speed, wholesale inquiry form UX, and Instagram-to-web sync'
  },
  real_estate: {
    key: 'real_estate',
    name: 'Real Estate, Builders & Luxury Resorts',
    tagline: 'property developers, luxury resorts, brokers, and holiday home projects',
    portfolioHighlight: '3D virtual walkthroughs, project masterplans, brochure downloads, and high-converting site-visit booking',
    valueTip: 'Property investors expect high-definition site videos and interactive unit availability before requesting a site visit.',
    auditHook: 'site-visit lead capture velocity, high-res gallery performance, and brochure download forms'
  },
  ecommerce: {
    key: 'ecommerce',
    name: 'E-Commerce, D2C & Retail Brands',
    tagline: 'direct-to-consumer brands, retail chains, and multi-vendor online stores',
    portfolioHighlight: 'conversion-optimized Shopify/WooCommerce stores, abandon-cart recovery, and omnichannel catalog sync',
    valueTip: 'D2C brands scale profitably by optimizing checkout conversion rate and instant WhatsApp order tracking.',
    auditHook: 'e-commerce page load speed, checkout funnel friction, and Meta ROAS tracking'
  },
  jewelry: {
    key: 'jewelry',
    name: 'Jewelry, Gems & Luxury Lifestyle',
    tagline: 'fine jewelry showrooms, diamond exporters, and luxury accessory brands',
    portfolioHighlight: 'virtual diamond try-on portals, high-definition 360 jewelry viewer, and private appointment scheduler',
    valueTip: 'High-ticket jewelry buyers demand trust certificates (IGI/GIA) and seamless video-shopping consultations.',
    auditHook: 'luxury aesthetic branding, mobile video-shopping UX, and trust badging'
  },
  logistics: {
    key: 'logistics',
    name: 'Logistics, Freight & Supply Chain',
    tagline: 'freight forwarders, 3PL warehouse operators, and transportation fleets',
    portfolioHighlight: 'instant freight rate calculators, shipment container tracking, and B2B client shipment portals',
    valueTip: 'B2B shippers choose forwarders with digital tracking transparency and responsive quote turnarounds.',
    auditHook: 'freight quote calculator responsiveness, shipment tracking UX, and corporate trust'
  },
  architecture: {
    key: 'architecture',
    name: 'Architecture, Interior & Construction',
    tagline: 'architectural studios, turnkey interior contractors, and civil engineers',
    portfolioHighlight: 'immersive architectural portfolio, 3D render galleries, and project cost estimation funnels',
    valueTip: 'Prospective homeowners decide to contact architects after viewing real before-and-after project photos.',
    auditHook: 'high-resolution project portfolio, mobile aesthetic, and lead consultation form'
  },
  food_beverage: {
    key: 'food_beverage',
    name: 'Food, Beverages, FMCG & Agro',
    tagline: 'FMCG manufacturers, cloud kitchens, gourmet food brands, and agro exporters',
    portfolioHighlight: 'institutional distributor enquiry portals, recipe blogs, and branded D2C grocery storefronts',
    valueTip: 'Retail distributors judge FMCG suppliers by factory hygiene standards, certifications, and product catalog clarity.',
    auditHook: 'product nutrition showcases, distributor inquiry forms, and brand packaging photography'
  },
  automotive: {
    key: 'automotive',
    name: 'Automotive, Dealerships & Parts',
    tagline: 'auto component manufacturers, car/bike dealerships, and EV startups',
    portfolioHighlight: 'test-drive booking systems, OEM spare parts search, and vehicle comparison engines',
    valueTip: 'Automotive buyers research vehicle specifications and loan EMI calculators before visiting a physical showroom.',
    auditHook: 'test-drive lead flow, EMI calculator UX, and local Google Maps dealership rankings'
  },
  legal: {
    key: 'legal',
    name: 'Legal, Corporate Advisory & Tax',
    tagline: 'law firms, corporate advocates, intellectual property agents, and audit consultants',
    portfolioHighlight: 'practice area portals, case evaluation intake forms, and attorney profile showcases',
    valueTip: 'Corporate clients select law firms based on partner credentials, published case studies, and discreet consultation booking.',
    auditHook: 'confidential consultation forms, legal expertise content, and professional authority'
  },
  solar_energy: {
    key: 'solar_energy',
    name: 'Renewable Energy, Solar & CleanTech',
    tagline: 'rooftop solar installers, commercial EPC contractors, and clean energy developers',
    portfolioHighlight: 'solar savings ROI calculators, EPC project case studies, and government subsidy inquiry funnels',
    valueTip: 'Commercial solar buyers prioritize net metering calculations and projected payback period analysis.',
    auditHook: 'solar ROI calculator usability, commercial rooftop portfolio, and subsidy guide downloads'
  },
  electronics: {
    key: 'electronics',
    name: 'Hardware, Electronics & IoT',
    tagline: 'consumer electronics brands, IoT hardware makers, and industrial automation providers',
    portfolioHighlight: 'product specification sheets, firmware download centers, and OEM/ODM distributor request forms',
    valueTip: 'Industrial IoT clients need downloadable technical whitepapers, schematics, and developer API docs.',
    auditHook: 'technical documentation repository, distributor request funnel, and video product demos'
  },
  media_events: {
    key: 'media_events',
    name: 'Media, Entertainment & Events',
    tagline: 'event management companies, production houses, and artist agencies',
    portfolioHighlight: 'showreel video showcases, ticket reservation engines, and corporate event inquiry portals',
    valueTip: 'Event organizers win corporate contracts through dynamic video showreels and verified client testimonials.',
    auditHook: 'full-bleed video playback speed, celebrity/event portfolio gallery, and VIP inquiry forms'
  },
  wellness: {
    key: 'wellness',
    name: 'Fitness, Wellness, Spa & Salons',
    tagline: 'premium gym chains, wellness retreats, aesthetic clinics, and luxury salons',
    portfolioHighlight: 'membership signup engines, class booking schedules, and before/after transformation galleries',
    valueTip: 'Fitness and salon clients book appointments via smartphone within 60 seconds of seeing transformation stories.',
    auditHook: 'instant WhatsApp booking button, Instagram feed integration, and membership trial forms'
  },
  information_technology: {
    key: 'information_technology',
    name: 'Information Technology & Software',
    tagline: 'SaaS platforms, cloud providers, enterprise IT consultancies, and deep-tech startups',
    portfolioHighlight: 'microservices architecture, high-concurrency cloud deployments, multi-tenant SaaS dashboards, and SOC-2 compliant portals',
    valueTip: 'Enterprise IT decision-makers evaluate uptime SLA, SOC-2/ISO 27001 readiness, and modern API documentation before vendor shortlisting.',
    auditHook: 'cloud architecture scalability, API performance benchmarks, and SOC-2 data compliance showcase'
  },
  software_it: {
    key: 'software_it',
    name: 'Software & IT Services',
    tagline: 'custom software developers, AI/ML firms, and enterprise ERP consultancies',
    portfolioHighlight: 'custom ERP modernisation, automated CI/CD pipelines, and high-performance React/Node web applications',
    valueTip: 'Technology buyers prioritize transparent sprint delivery timelines and proven enterprise case studies.',
    auditHook: 'code architecture audit, mobile responsiveness, and client case study metrics'
  },
  general: {
    key: 'general',
    name: 'Corporate, IT & Technology',
    tagline: 'growing enterprise businesses, SaaS startups, and corporate organizations',
    portfolioHighlight: 'modern responsive websites, high-ranking SEO frameworks, and AI automated customer workflows',
    valueTip: 'Modern prospects decide whether to trust a company within 5 seconds of opening its website or Google profile.',
    auditHook: 'overall digital credibility, mobile responsiveness, and organic Google visibility'
  }
};

// -------------------------------------------------------------------------
// LAYER 3: REPLY-BASED BRANCHING STRATEGY
// -------------------------------------------------------------------------
export const CADENCE_REPLY_BRANCHES: Record<string, ReplyBranch> = {
  already_have_website: {
    key: 'already_have_website',
    label: 'Already have a website',
    triggerCondition: 'Prospect says: "We already have a website" or "Site is already made"',
    nextLeadTemperature: 'WARM',
    suggestedAction: 'Offer complementary Speed/SEO Audit or custom ERP/Portal integration rather than a basic website rewrite.',
    recommendedResponseScript: `Understood {{First Name}}! Most of our premier clients already had established websites when we first connected.

We usually assist existing businesses with:
1. Modern UI/UX redesign & mobile speed optimization (< 2 sec loading)
2. Google First-Page SEO ranking to capture active buyer searches
3. Custom client/dealer portals or ERP automation to eliminate manual work

If you're open to it, I can share a quick 3-minute video/PDF audit highlighting speed and Google search opportunities for {{Company Name}}'s current website.

Would you like me to send it over?`,
    whatsappMessage: `Understood {{First Name}}! Most of our clients already had websites when we connected.

We usually help with mobile speed optimization, Google First-Page SEO ranking, or building custom client/ERP portals.

If you'd like, I can run a quick complimentary speed & SEO health check on your current site and send it here. Would that be helpful? 😊`,
    emailMessage: {
      subject: `Complimentary website performance & Google visibility check for {{Company Name}}`,
      body: `Dear {{First Name}},

Thank you for letting me know. Many of the forward-thinking companies we work with already have functional websites.

Rather than just rebuilding websites, RND Technosoft focuses on measurable growth:
• Speed & Core Web Vitals optimization (converting more visitors into direct inquiries)
• Targeted Google SEO to rank your high-margin services on Page 1
• Custom web applications, CRM integrations, and client portals

I would be delighted to prepare a brief, complimentary Speed & Google Visibility Audit for {{Company Name}}. 

Would it be fine if I share the report here for your review?

Best regards,
{{Assignee Name}} | RND Technosoft`
    }
  },

  send_details: {
    key: 'send_details',
    label: 'Send company profile / details',
    triggerCondition: 'Prospect says: "Send details", "Share profile", or "Email me company info"',
    nextLeadTemperature: 'HOT',
    suggestedAction: 'Send curated profile immediately, follow up on WhatsApp, and pitch a 15-minute discovery call.',
    recommendedResponseScript: `Delighted to share our profile, {{First Name}}!

I have just emailed our complete RND Technosoft company profile along with recent case studies from the {{Industry}} sector.

Here is also our direct digital portfolio link:
📁 {{Portfolio Link}}

To suggest the most relevant solutions for {{Company Name}}, could we schedule a brief 10 to 15-minute discovery call this week? Let me know which day suits you best.`,
    whatsappMessage: `Hi {{First Name}}! Just sent our company profile and {{Industry}} case studies to your email.

You can also browse our live portfolio here:
📁 {{Portfolio Link}}

Could we schedule a quick 10-minute discovery call this week to understand your current digital goals? Let me know what time works best for you! 🙏`,
    emailMessage: {
      subject: `RND Technosoft Company Profile & Case Studies for {{Company Name}}`,
      body: `Dear {{First Name}},

Thank you for your interest in RND Technosoft!

As requested, I am pleased to share our complete company profile and relevant project case studies:
📁 Live Portfolio: {{Portfolio Link}}

Over the past decade, we have helped 250+ enterprises scale their digital infrastructure through high-performance web development, SEO, custom software, and AI automation.

Could we schedule a short 15-minute discovery call this Thursday or Friday to discuss {{Company Name}}'s upcoming requirements?

Looking forward to your response.

Warm regards,
{{Assignee Name}} | RND Technosoft`
    }
  },

  call_me_later: {
    key: 'call_me_later',
    label: 'Call me later / Busy now',
    triggerCondition: 'Prospect says: "Currently traveling", "Busy in meetings", or "Call next week/month"',
    nextLeadTemperature: 'WARM',
    suggestedAction: 'Acknowledge gracefully, set precise reminder date, and avoid intermediate messaging.',
    recommendedResponseScript: `Completely understand, {{First Name}}. No problem at all!

I will set a calendar reminder on my end so I do not disturb you during your busy schedule.

Would connecting next week around Tuesday or Wednesday morning work better for you?

Wishing you a productive week ahead!`,
    whatsappMessage: `Completely understand, {{First Name}}! No worries at all.

I'll set a reminder on my calendar so I don't disturb your busy schedule. 

Could you let me know if connecting early next week would be better? Thank you! 😊`
  },

  interested_in_seo: {
    key: 'interested_in_seo',
    label: 'Interested in SEO / Google rank only',
    triggerCondition: 'Prospect asks: "Do you do SEO?", "Can you rank our website?", or "Only need Google leads"',
    nextLeadTemperature: 'HOT',
    suggestedAction: 'Send ranking case studies with keyword proof, offer free keyword gap analysis.',
    recommendedResponseScript: `Yes absolutely, {{First Name}}! Organic Google SEO and high-intent buyer acquisition is one of our primary specializations.

We have ranked over 1,500+ commercial keywords in top Google search spots for Indian & international B2B companies.

I can run a quick Keyword & Competitor Gap Analysis to show which search terms your competitors are capturing today.

Can I prepare and send that analysis here?`,
    whatsappMessage: `Yes absolutely, {{First Name}}! SEO & organic Google lead generation is one of our core specialties.

We've helped multiple businesses achieve top-3 Google rankings on high-intent buyer keywords.

I'd be glad to share a quick Competitor Keyword Analysis for {{Company Name}}. Can I send it here? 😊`
  },

  not_interested: {
    key: 'not_interested',
    label: 'Not interested at this time',
    triggerCondition: 'Prospect says: "Not required", "No need", or "We do not need any services"',
    nextLeadTemperature: 'LOST',
    suggestedAction: 'Send polite and professional closing note, pause cadence, leave door open for the future.',
    recommendedResponseScript: `Understood completely, {{First Name}}. Thank you for your honest feedback!

I have paused our outreach so you won't receive further follow-up messages.

Whenever {{Company Name}} needs support with web development, SEO, custom software, or AI automation down the road, RND Technosoft will always be here to assist.

Wishing you and your company continued success!`,
    whatsappMessage: `Understood completely, {{First Name}}. Thank you for letting me know!

I'll close the follow-up from my side. Whenever your business needs web, SEO, or software support in the future, feel free to reach out.

Wishing you continued business success! 🙏`
  }
};

// -------------------------------------------------------------------------
// LAYER 1: 30-DAY MULTI-CHANNEL CADENCE DEFINITION
// -------------------------------------------------------------------------
export const CADENCE_STEPS_MASTER: CadenceStep[] = [
  // DAY 1
  {
    stepIndex: 0,
    dayNumber: 1,
    dayOffset: 0,
    title: 'Triple Platform Launch',
    goal: 'Make the First Impression',
    channels: ['LINKEDIN', 'EMAIL', 'WHATSAPP'],
    timingGuide: 'LinkedIn (9:30 AM), Email (11:00 AM), WhatsApp (4:00 PM)',
    roleNote: 'LinkedIn: Connect professionally | Email: Introduce company | WhatsApp: Friendly connect',
    templates: {
      linkedin: {
        actionType: 'CONNECT',
        message: `Hi {{First Name}},

Came across {{Company Name}} while exploring businesses in the {{Industry}} sector.

Would love to connect and stay in touch regarding technology and digital growth.`
      },
      email: {
        subject: `Connecting with {{Company Name}} | RND Technosoft`,
        body: `Dear {{First Name}},

I'm {{Assignee Name}} from RND Technosoft, Vapi.

We help businesses improve their digital presence through websites, SEO, branding, software development and AI automation.

Sharing our company profile for your reference:
📁 {{Portfolio Link}}

Looking forward to connecting professionally.

Warm regards,
{{Assignee Name}}
Business Development | RND Technosoft`
      },
      whatsapp: {
        message: `Hi {{First Name}} 👋

I'm {{Assignee Name}} from RND Technosoft.

I just sent a short email introducing our company.

Thought I'd connect here as well. Whenever you have any digital requirement, we'd be happy to help.

Thank you!`
      }
    }
  },

  // DAY 5
  {
    stepIndex: 1,
    dayNumber: 5,
    dayOffset: 4,
    title: 'Trust & Portfolio Showcase',
    goal: 'Build Trust (Not Sell)',
    channels: ['WHATSAPP', 'LINKEDIN'],
    timingGuide: 'LinkedIn (Morning), WhatsApp (2:30 PM - 4:00 PM)',
    roleNote: 'WhatsApp: Portfolio + industry relevance | LinkedIn: View profile & like/comment on 1 post (No DM)',
    templates: {
      linkedin: {
        actionType: 'ENGAGE_POST',
        actionNote: `Like one recent post on their profile. If they posted something, leave a professional comment. DO NOT send another LinkedIn DM. This creates visibility without messaging.`
      },
      whatsapp: {
        message: `Hi {{First Name}},

Hope you're doing well.

Sharing our portfolio so you can see the type of work we do for businesses across India.

📁 {{Portfolio Link}}

If you're exploring {{Industry}} projects, I can also share similar client case studies.`
      }
    }
  },

  // DAY 10
  {
    stepIndex: 2,
    dayNumber: 10,
    dayOffset: 9,
    title: 'Business Value & Digital Insight',
    goal: 'Give Business Value',
    channels: ['EMAIL', 'WHATSAPP'],
    timingGuide: 'Email (10:30 AM), WhatsApp Teaser (12:00 PM)',
    roleNote: 'Email: Educational insight | WhatsApp: Short teaser to boost email open rate',
    templates: {
      email: {
        subject: `One digital tip that helps businesses generate more enquiries`,
        body: `Dear {{First Name}},

One common observation we see across many businesses in the {{Industry}} sector:

Customers often decide whether to trust a company within a few seconds of visiting its website or Google profile.

A few improvements in design, mobile speed, and search visibility can create a much stronger first impression and direct buyer inquiries.

Thought this insight might be useful for {{Company Name}}.

Best regards,
{{Assignee Name}} | RND Technosoft`
      },
      whatsapp: {
        message: `Hi {{First Name}},

Just shared one useful email about improving business credibility online.

It's not a sales email, just a practical digital tip for businesses.

Hope you find it useful. 😊`
      }
    }
  },

  // DAY 15
  {
    stepIndex: 3,
    dayNumber: 15,
    dayOffset: 14,
    title: 'Engagement & Free Audit Offer',
    goal: 'Start Engagement',
    channels: ['WHATSAPP', 'LINKEDIN'],
    timingGuide: 'LinkedIn Post (Morning), WhatsApp Audit Offer (3:00 PM)',
    roleNote: 'WhatsApp: Free Audit Offer | LinkedIn: Share valuable industry post (No DM required)',
    templates: {
      linkedin: {
        actionType: 'SHARE_POST',
        actionNote: `Share an educational post on LinkedIn (e.g., "5 Website Mistakes Manufacturing Companies Make" or "How SEO Drives B2B Inquiries"). No DM required.`
      },
      whatsapp: {
        message: `Hi {{First Name}},

I had a quick look at {{Company Name}} online.

I'd be happy to prepare a FREE Digital Presence Audit with practical suggestions for your website and Google visibility.

Would you like me to send it here?`
      }
    }
  },

  // DAY 20
  {
    stepIndex: 4,
    dayNumber: 20,
    dayOffset: 19,
    title: 'Social Proof & Client Success Story',
    goal: 'Build Social Proof',
    channels: ['EMAIL', 'WHATSAPP'],
    timingGuide: 'Email (11:00 AM), WhatsApp Teaser (1:30 PM)',
    roleNote: 'Email: Client success story | WhatsApp: Short success teaser',
    templates: {
      email: {
        subject: `A quick success story from RND Technosoft`,
        body: `Dear {{First Name}},

We recently worked with a business that wanted to improve its online presence.

Instead of just redesigning the website, we improved branding, SEO and overall digital credibility.

The result was a much stronger online impression and better customer enquiries.

This is the approach we follow for every client at RND Technosoft.

Thought sharing this might give you confidence in how we deliver tangible results.

Best regards,
{{Assignee Name}} | RND Technosoft`
      },
      whatsapp: {
        message: `Hi {{First Name}},

Just shared a short success story over email.

Thought it might give you an idea of how we approach digital growth projects.`
      }
    }
  },

  // DAY 25
  {
    stepIndex: 5,
    dayNumber: 25,
    dayOffset: 24,
    title: 'Discovery Qualification Call',
    goal: 'Qualify Requirement (Discovery Call)',
    channels: ['PHONE', 'WHATSAPP'],
    timingGuide: 'Phone Call (11:30 AM - 1:00 PM), WhatsApp Follow-up immediately after',
    roleNote: 'Phone: 2-minute qualification pitch | WhatsApp: Follow-up message after call or missed call',
    templates: {
      phone: {
        pitchScript: `Good Morning Sir/Madam.

{{Assignee Name}} from RND Technosoft.

I had shared our company profile and a few messages over the last couple of weeks.

I just wanted to check if there's any current or upcoming digital requirement at {{Company Name}} where we can assist?

If yes, I'd love to schedule a short 15-minute discovery call to share ideas.`,
        afterCallTakenWhatsApp: `Hi {{First Name}},

Thank you for taking my call today.

As discussed, whenever it's convenient, we can schedule a 15-minute discovery call to understand your business and suggest suitable digital solutions.`,
        missedCallWhatsApp: `Hi {{First Name}},

Tried reaching you today, probably you were busy.

No worries at all.

Whenever convenient, let me know and I'll connect at your preferred time.`
      },
      whatsapp: {
        message: `Hi {{First Name}}, tried reaching you today. Let me know when is a good time to connect for a quick 2-minute discussion!`
      }
    }
  },

  // DAY 30
  {
    stepIndex: 6,
    dayNumber: 30,
    dayOffset: 29,
    title: 'Respectful Exit & Door Opener',
    goal: 'Discovery Call or Respectful Exit',
    channels: ['WHATSAPP', 'EMAIL', 'LINKEDIN'],
    timingGuide: 'Email (10:00 AM), WhatsApp (2:00 PM), LinkedIn (4:30 PM)',
    roleNote: 'WhatsApp: Final follow-up | Email: Thank you note | LinkedIn: Stay connected message (No Selling)',
    templates: {
      whatsapp: {
        message: `Hi {{First Name}},

This is my final follow-up from my side.

I completely understand this may not be the right time.

Whenever your business needs support with website development, SEO, branding, software or AI automation, RND Technosoft will be happy to assist.

Thank you for your time. 🙏`
      },
      email: {
        subject: `Thank you for connecting with RND Technosoft`,
        body: `Dear {{First Name}},

Thank you for taking the time to go through our emails over the past few weeks.

I'll close my follow-up from my side for now.

Whenever your business has any digital requirement, we'd be happy to connect.

Wishing you and {{Company Name}} continued business growth.

Warm regards,
{{Assignee Name}}
RND Technosoft, Vapi`
      },
      linkedin: {
        actionType: 'FAREWELL',
        message: `Thank you for staying connected here on LinkedIn.

Looking forward to staying in touch and sharing useful business insights in the future.`
      }
    }
  }
];

// -------------------------------------------------------------------------
// TEMPLATE INTERPOLATION & HELPER UTILITIES
// -------------------------------------------------------------------------
export interface InterpolationVariables {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  designation?: string;
  industry?: string;
  portfolioLink?: string;
  phone?: string;
  email?: string;
  assigneeName?: string;
  senderName?: string;
  senderDesignation?: string;
}

export const DEFAULT_PORTFOLIO_LINK = 'https://rndtechnosoft.com/portfolio';

export function interpolateText(text: string, vars: InterpolationVariables): string {
  if (!text) return '';
  const firstName = (vars.firstName || '').trim() || 'Sir/Madam';
  const lastName = (vars.lastName || '').trim();
  const fullName = vars.fullName || [firstName !== 'Sir/Madam' ? firstName : '', lastName].filter(Boolean).join(' ') || firstName;
  const companyName = (vars.companyName || '').trim() || 'your company';
  const designation = (vars.designation || '').trim() || 'Decision Maker';
  const industryKey = (vars.industry || 'general').toLowerCase();
  const industryConfig = CADENCE_INDUSTRIES[industryKey] || CADENCE_INDUSTRIES.general;
  const industryName = industryConfig ? industryConfig.name : 'Business';
  const portfolioLink = vars.portfolioLink || DEFAULT_PORTFOLIO_LINK;
  const assigneeName = (vars.assigneeName || vars.senderName || 'Saloni Shah').trim();
  const senderDesignation = (vars.senderDesignation || 'Director of Sales & Business Development').trim();

  return text
    .replace(/\{\{First Name\}\}/gi, firstName)
    .replace(/\{\{Last Name\}\}/gi, lastName)
    .replace(/\{\{Full Name\}\}/gi, fullName)
    .replace(/\{\{Company Name\}\}/gi, companyName)
    .replace(/\{\{Designation\}\}/gi, designation)
    .replace(/\{\{Industry\}\}/gi, industryName)
    .replace(/\{\{Portfolio Link\}\}/gi, portfolioLink)
    .replace(/\{\{Assignee Name\}\}/gi, assigneeName)
    .replace(/\{\{Sales Head Name\}\}/gi, assigneeName)
    .replace(/\{\{Sender Name\}\}/gi, assigneeName)
    .replace(/\{\{Sender Designation\}\}/gi, senderDesignation);
}

/**
 * Calculates due date based on enrollment date and step offset (days)
 */
export function computeStepDueDate(enrolledAt: string | Date, dayOffset: number): Date {
  const base = new Date(enrolledAt);
  const target = new Date(base);
  target.setDate(target.getDate() + dayOffset);
  // Default to 10:30 AM local time for follow-up
  target.setHours(10, 30, 0, 0);
  return target;
}

/**
 * The step a lead in the cadence does next: in the playbook's order as set in
 * CRM Masters, the step after the furthest step the lead has completed (a
 * completed step is recognised by its id, or by its day for records made
 * before ids were kept). So a step added or moved before where the lead
 * already is never makes it go back, a removed step is simply skipped, and a
 * lead none of whose completed steps remain carries on from the first step
 * later than the last day it completed. Null when none is left.
 */
/** The channels a day's messages go out on; phone calls are logged, not sent. */
export const MESSAGE_CHANNELS = ['WHATSAPP', 'EMAIL', 'LINKEDIN'] as const;
const CHANNEL_NAMES: Record<(typeof MESSAGE_CHANNELS)[number], string> = { WHATSAPP: 'WhatsApp', EMAIL: 'email', LINKEDIN: 'LinkedIn' };

/**
 * The day's message channels not done yet: each channel the step uses and has
 * a message for must be sent, or (WhatsApp, LinkedIn) marked not available
 * for the lead. The day can be marked complete only when none is left.
 */
export function channelsStillToDo(
  step: Pick<CadenceStep, 'channels' | 'templates'>,
  actions: Partial<Record<CadenceChannel, Pick<CadenceChannelAction, 'status'>>> | undefined,
): (typeof MESSAGE_CHANNELS)[number][] {
  const hasMessage = { WHATSAPP: !!step.templates?.whatsapp, EMAIL: !!step.templates?.email, LINKEDIN: !!step.templates?.linkedin };
  return MESSAGE_CHANNELS.filter((channel) => step.channels.includes(channel) && hasMessage[channel])
    .filter((channel) => !['SENT', 'NOT_AVAILABLE'].includes(actions?.[channel]?.status ?? ''));
}

/** Why a day can't be completed yet, in words, or null when it can. */
export function dayNotReadyMessage(step: Pick<CadenceStep, 'dayNumber' | 'channels' | 'templates'>, actions: Parameters<typeof channelsStillToDo>[1]): string | null {
  const left = channelsStillToDo(step, actions);
  if (!left.length) return null;
  const names = left.map((c) => CHANNEL_NAMES[c]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Day ${step.dayNumber} can’t be marked complete yet: send the ${list} message${left.length === 1 ? '' : 's'} first${left.includes('LINKEDIN') ? ', or mark the lead as not on LinkedIn' : ''}.`;
}

export function nextCadenceStep<T extends CadenceStep & { id?: string }>(steps: T[], cadence: Pick<CadenceState, 'completedSteps'>): T | null {
  const done = cadence.completedSteps ?? [];
  if (done.length === 0) return steps[0] ?? null;
  // Default steps (ids "default-day-N") get new ids when a workspace first edits its playbook, so they match by day.
  const isDone = (step: T) => done.some((record) =>
    record.stepId && !record.stepId.startsWith('default-') ? record.stepId === step.id : record.dayNumber === step.dayNumber);
  let furthest = -1;
  steps.forEach((step, index) => { if (isDone(step)) furthest = index; });
  if (furthest >= 0) return steps[furthest + 1] ?? null;
  const lastDay = Math.max(0, ...done.map((record) => record.dayNumber || 0));
  return steps.find((step) => step.dayNumber > lastDay) ?? null;
}

/** The playbook as Client Outreach names it: by its last day ("30-Day Multi-Touch SOP"). */
export const sopName = (steps: { dayNumber: number }[]) => `${Math.max(0, ...steps.map((step) => step.dayNumber)) || 30}-Day Multi-Touch SOP`;

/**
 * Formats a Date object to YYYY-MM-DD HH:mm:ss for MySQL datetime
 */
export function formatMysqlDatetime(date: Date): string {
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

/**
 * Evaluates whether a cadence step is due, overdue, or upcoming relative to now
 */
export function evaluateStepDueStatus(dueDate: Date | string): 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' {
  const now = new Date();
  const due = new Date(dueDate);

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();

  if (dueDateOnly < nowDate) {
    return 'OVERDUE';
  } else if (dueDateOnly === nowDate) {
    return 'DUE_TODAY';
  } else {
    return 'UPCOMING';
  }
}

/**
 * A WhatsApp chat URL with the message filled in (see outreach-channels.ts for
 * why it is not a wa.me link). An empty string when the number is unusable.
 */
export function generateWhatsAppUrl(phone: string, text: string): string {
  const phoneDigits = whatsAppDigits(phone);
  return 'digits' in phoneDigits ? whatsAppChatUrl(phoneDigits.digits, text) : '';
}

/**
 * Generate a mailto link with encoded subject and body
 */
export function generateMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
