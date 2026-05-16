"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Edit3, Eye, Filter, Mail, Plus, Search, SlidersHorizontal, Video, Image, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  notes: string | null;
  updatedAt: string;
};

type TemplateDraft = {
  id: string | null;
  name: string;
  subject: string;
  content: string;
  notes: string;
};

const emptyDraft: TemplateDraft = { id: null, name: "", subject: "", content: "", notes: "" };

function getTemplateMediaType(content: string): "image" | "video" | null {
  if (/<img/i.test(content)) return "image";
  if (/<video|youtube\.com|youtu\.be|vimeo\.com/i.test(content)) return "video";
  return null;
}

function getTemplateCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("onboard")) return "Onboarding";
  if (lower.includes("follow")) return "Follow-up";
  if (lower.includes("b2b") || lower.includes("business")) return "B2B";
  if (lower.includes("cold") || lower.includes("intro")) return "Cold Outreach";
  if (lower.includes("referral")) return "Referral";
  if (lower.includes("welcome")) return "Welcome";
  if (lower.includes("proposal")) return "Proposal";
  if (lower.includes("demo")) return "Demo";
  if (lower.includes("nurture")) return "Nurture";
  if (lower.includes("re-engage") || lower.includes("dormant") || lower.includes("re-engagement")) return "Re-engagement";
  if (lower.includes("event") || lower.includes("webinar") || lower.includes("invite")) return "Events";
  if (lower.includes("case study") || lower.includes("success story")) return "Social Proof";
  if (lower.includes("thank") || lower.includes("appreciation")) return "Thank You";
  if (lower.includes("upsell") || lower.includes("upgrade") || lower.includes("expansion")) return "Upsell";
  if (lower.includes("churn") || lower.includes("cancel") || lower.includes("win-back")) return "Retention";
  if (lower.includes("check-in") || lower.includes("check in") || lower.includes("checkin")) return "Check-in";
  if (lower.includes("announcement") || lower.includes("launch") || lower.includes("new feature")) return "Announcement";
  return "General";
}

const categoryColors: Record<string, string> = {
  Onboarding: "bg-emerald-100 text-emerald-800",
  "Follow-up": "bg-blue-100 text-blue-800",
  B2B: "bg-purple-100 text-purple-800",
  "Cold Outreach": "bg-orange-100 text-orange-800",
  Referral: "bg-pink-100 text-pink-800",
  Welcome: "bg-teal-100 text-teal-800",
  Proposal: "bg-indigo-100 text-indigo-800",
  Demo: "bg-yellow-100 text-yellow-800",
  Nurture: "bg-cyan-100 text-cyan-800",
  "Re-engagement": "bg-rose-100 text-rose-800",
  Events: "bg-violet-100 text-violet-800",
  "Social Proof": "bg-amber-100 text-amber-800",
  "Thank You": "bg-lime-100 text-lime-800",
  Upsell: "bg-sky-100 text-sky-800",
  Retention: "bg-red-100 text-red-800",
  "Check-in": "bg-fuchsia-100 text-fuchsia-800",
  Announcement: "bg-green-100 text-green-800",
  General: "bg-slate-100 text-slate-700",
};

const ALL_CATEGORIES = [
  "All",
  "Cold Outreach",
  "Follow-up",
  "B2B",
  "Onboarding",
  "Welcome",
  "Demo",
  "Proposal",
  "Nurture",
  "Re-engagement",
  "Referral",
  "Events",
  "Social Proof",
  "Thank You",
  "Upsell",
  "Retention",
  "Check-in",
  "Announcement",
  "General",
];

// ─── All built-in templates ───────────────────────────────────────────────────
const BUILTIN_TEMPLATES = [
  // Cold Outreach
  {
    name: "Cold Intro — Short & Direct",
    subject: "Quick question for {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I help companies like {{outreach.account.name}} streamline their sales process and close deals faster.</p><p>Would you be open to a 15-minute call this week?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Short cold outreach — works best for busy decision makers",
  },
  {
    name: "Cold Intro — Problem-Led",
    subject: "Struggling with [problem] at {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Many teams at companies like {{outreach.account.name}} tell us they struggle with [specific problem].</p><p>We've helped similar companies solve this in [timeframe]. Worth a quick chat?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Problem-led cold outreach — personalise the problem",
  },
  {
    name: "Cold Intro — Mutual Connection",
    subject: "[Mutual contact] suggested I reach out",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>[Mutual contact] mentioned you might be the right person to speak with about improving your team's outreach at {{outreach.account.name}}.</p><p>I'd love to share what we've been doing for similar companies. Do you have 15 minutes this week?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Warm intro via mutual connection",
  },
  // Follow-up
  {
    name: "Follow-up #1 — Gentle Bump",
    subject: "Following up — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to follow up on my previous email. I know your inbox is busy, so I'll keep this short.</p><p>We've helped similar companies reduce their sales cycle by 30%. Worth a quick chat?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "First follow-up after no reply",
  },
  {
    name: "Follow-up #2 — Add Value",
    subject: "One more thought for {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to share something that might be relevant for {{outreach.account.name}}: [brief insight or resource].</p><p>Happy to discuss how this applies to your situation. Do you have 10 minutes?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Second follow-up — add a value nugget",
  },
  {
    name: "Follow-up #3 — Last Touch",
    subject: "Last note — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'll make this my last email. If improving your team's outbound process isn't a priority right now, no worries at all.</p><p>If timing changes, feel free to reach out. I'll leave the door open.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Final breakup email",
  },
  {
    name: "Follow-up — After Meeting",
    subject: "Great speaking with you, {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Thanks for taking the time to chat today. I really enjoyed our conversation.</p><p>As discussed, here are the next steps:</p><ul><li>[Action item 1]</li><li>[Action item 2]</li></ul><p>Looking forward to moving this forward. Let me know if you have any questions.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Post-meeting follow-up",
  },
  // B2B
  {
    name: "B2B Intro — Decision Maker",
    subject: "Quick question for {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I help B2B companies like {{outreach.account.name}} streamline their sales process and close deals faster.</p><p>Would you be open to a 15-minute call this week to explore if there's a fit?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "B2B cold outreach to decision makers",
  },
  {
    name: "B2B — ROI-Focused",
    subject: "How {{outreach.account.name}} could save [X] hours/month",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Companies like {{outreach.account.name}} typically save [X] hours per month after implementing our solution — that's roughly [$ value] in recovered productivity.</p><p>I'd love to show you how. Do you have 20 minutes this week?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "ROI-focused B2B outreach",
  },
  {
    name: "B2B — Competitor Displacement",
    subject: "Switching from [Competitor] — worth it for {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I noticed {{outreach.account.name}} might be using [Competitor]. Many of our customers switched from [Competitor] and saw [specific benefit] within [timeframe].</p><p>Would it be worth a quick comparison call?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Competitor displacement email",
  },
  // Onboarding
  {
    name: "Onboarding — Welcome",
    subject: "Welcome to {{sender_company}} — let's get started",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Welcome aboard! We're thrilled to have {{outreach.account.name}} with us.</p><p>Here's what happens next:</p><ul><li>✅ Your account is being set up</li><li>📅 We'll schedule your onboarding call within 24 hours</li><li>📚 You'll receive our getting started guide shortly</li></ul><p>Any questions? Just reply to this email.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Welcome email for new customers",
  },
  {
    name: "Onboarding — Day 3 Check-in",
    subject: "Getting started at {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been a few days since you joined us — I wanted to check in and make sure you're off to a great start.</p><p>Have you had a chance to [key action]? If you need any help, I'm here.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Day 3 onboarding check-in",
  },
  {
    name: "Onboarding — Day 7 Check-in",
    subject: "How's everything going at {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been a week since you joined us — I wanted to check in and see how things are going.</p><p>Are you getting the value you expected? Any blockers we can help with?</p><p>Happy to jump on a quick call if that would help.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Day 7 onboarding check-in",
  },
  {
    name: "Onboarding — Day 30 Review",
    subject: "Your first month with {{sender_company}} — how are we doing?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been 30 days since {{outreach.account.name}} joined us. I'd love to hear how things are going.</p><p>A few questions:</p><ul><li>Are you achieving the goals you set out to?</li><li>Is there anything we could be doing better?</li><li>Would you be open to a quick review call?</li></ul><p>Best,<br/>{{sender_name}}</p>",
    notes: "30-day onboarding review",
  },
  // Demo
  {
    name: "Demo — Request Confirmation",
    subject: "Your demo is confirmed — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Your demo is confirmed for [DATE] at [TIME].</p><p>Here's the link to join: [LINK]</p><p>To make the most of our time, it would help to know:</p><ul><li>What's your biggest challenge right now?</li><li>Who else will be joining the call?</li></ul><p>See you then!</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Demo confirmation email",
  },
  {
    name: "Demo — Follow-up Recap",
    subject: "Your demo recap — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Thanks for joining our demo today! I hope it gave you a clear picture of how we can help {{outreach.account.name}}.</p><p>As discussed, here are the key points:</p><ul><li>Feature A — solves your X problem</li><li>Feature B — saves your team Y hours/week</li><li>Pricing — starts at Z/month</li></ul><p>Ready to move forward? I can have you set up within 24 hours.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Post-demo follow-up email",
  },
  {
    name: "Demo — No-Show Follow-up",
    subject: "Missed you — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I noticed you weren't able to make our demo today — no worries at all, things come up.</p><p>I'd love to reschedule at a time that works better for you. Here's my calendar: [LINK]</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Follow-up when prospect misses demo",
  },
  // Proposal
  {
    name: "Proposal — Sent",
    subject: "Proposal for {{outreach.account.name}} — next steps",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've sent over the proposal for {{outreach.account.name}}. Please find it attached.</p><p>The proposal covers:</p><ul><li>Scope of work</li><li>Timeline and milestones</li><li>Investment and ROI projections</li></ul><p>I'm available for a call this week to walk through any questions. What time works best for you?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Proposal delivery email",
  },
  {
    name: "Proposal — Follow-up",
    subject: "Any questions on the proposal, {{outreach.contact.fullName}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to follow up on the proposal I sent over for {{outreach.account.name}}.</p><p>Have you had a chance to review it? I'm happy to answer any questions or adjust anything to better fit your needs.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Follow-up after sending proposal",
  },
  // Nurture
  {
    name: "Nurture — Value Email",
    subject: "3 ways companies like {{outreach.account.name}} grow faster",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've been working with companies in your space and noticed three patterns that separate the fastest-growing teams:</p><ol><li><strong>Automated follow-up</strong> — never let a lead go cold</li><li><strong>Personalized outreach at scale</strong> — relevant messages, not blasts</li><li><strong>Clear pipeline visibility</strong> — know exactly where every deal stands</li></ol><p>Would any of these be useful for {{outreach.account.name}} right now?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Value-add nurture email",
  },
  {
    name: "Nurture — Industry Insight",
    subject: "What's changing in [industry] — relevant for {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've been tracking some interesting trends in [industry] that I thought might be relevant for {{outreach.account.name}}.</p><p>[2-3 sentence insight or trend]</p><p>Happy to discuss how this might affect your strategy. Worth a quick call?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Industry insight nurture email",
  },
  {
    name: "Nurture — Educational Resource",
    subject: "Thought this might help, {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I came across [resource/article/guide] and immediately thought of {{outreach.account.name}}.</p><p>[1-2 sentence summary of why it's relevant]</p><p>Hope you find it useful. Let me know if you'd like to discuss any of the ideas in it.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Educational resource sharing",
  },
  // Re-engagement
  {
    name: "Re-engagement — Dormant Lead",
    subject: "Still relevant for {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>We spoke a while back about improving your team's outreach process. I wanted to check in — is this still something on your radar?</p><p>A lot has changed on our end, and I think the timing might be better now.</p><p>Worth a quick 10-minute catch-up?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Re-engagement for dormant leads",
  },
  {
    name: "Re-engagement — New Feature",
    subject: "We've added something you'll love, {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been a while since we last spoke, and I wanted to reach out because we've just launched [new feature] — something I think would be particularly valuable for {{outreach.account.name}}.</p><p>[1-2 sentence description of the feature and its benefit]</p><p>Would you be open to a quick 15-minute call to see it in action?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Re-engagement using a new feature as a hook",
  },
  // Referral
  {
    name: "Referral — Ask",
    subject: "Quick favor — who should I talk to?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'm reaching out to a few people at {{outreach.account.name}} to find the right person to speak with about improving your sales workflow.</p><p>Would you be the right person, or could you point me in the right direction?</p><p>I promise to keep it brief.</p><p>Thanks,<br/>{{sender_name}}</p>",
    notes: "Referral/warm intro ask",
  },
  {
    name: "Referral — Thank You",
    subject: "Thank you for the introduction, {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I just wanted to say thank you for introducing me to [referred contact]. I really appreciate you thinking of me.</p><p>I'll make sure to take good care of them.</p><p>If there's ever anything I can do for you in return, please don't hesitate to ask.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Thank you for a referral",
  },
  // Events
  {
    name: "Event — Webinar Invite",
    subject: "Exclusive invite for {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'd like to personally invite you to our upcoming webinar: <strong>\"How to 3x Your Outbound Pipeline in 90 Days\"</strong></p><p>📅 Date: [DATE]<br/>⏰ Time: [TIME]<br/>🔗 Register: [LINK]</p><p>We'll cover real strategies used by top-performing sales teams. Seats are limited.</p><p>Hope to see you there!</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Webinar/event invitation",
  },
  {
    name: "Event — Post-Webinar Follow-up",
    subject: "Thanks for attending — resources inside",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Thanks for joining our webinar! I hope you found it valuable.</p><p>As promised, here are the resources we mentioned:</p><ul><li>📄 Slides: [LINK]</li><li>🎥 Recording: [LINK]</li><li>📚 Guide: [LINK]</li></ul><p>Any questions or want to discuss how this applies to {{outreach.account.name}}? I'm happy to chat.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Post-webinar follow-up with resources",
  },
  // Social Proof
  {
    name: "Case Study — Share",
    subject: "How [Company] achieved [Result] — relevant for {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I thought this might be relevant for {{outreach.account.name}}.</p><p>One of our customers — a company similar to yours — achieved [specific result] within [timeframe] using our platform.</p><p>Here's the short version: [2-3 sentence summary]</p><p>Would you like me to send the full case study?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Case study sharing email",
  },
  {
    name: "Social Proof — Testimonial",
    subject: "What [Customer] says about us — relevant for {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to share what [Customer Name], [Title] at [Company], had to say about working with us:</p><blockquote><em>\"[Testimonial quote here]\"</em></blockquote><p>I think {{outreach.account.name}} could see similar results. Would you be open to a quick call?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Testimonial-led outreach",
  },
  // Thank You
  {
    name: "Thank You — New Customer",
    subject: "Thank you for choosing {{sender_company}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>On behalf of the entire team at {{sender_company}}, I want to say thank you for choosing us.</p><p>We're committed to making sure {{outreach.account.name}} gets incredible value from our partnership.</p><p>If you ever need anything, I'm just an email away.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Thank you email for new customers",
  },
  {
    name: "Thank You — After Purchase",
    subject: "Your order is confirmed — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Thank you for your purchase! Your order has been confirmed and is being processed.</p><p>Here's what to expect next:</p><ul><li>[Step 1]</li><li>[Step 2]</li><li>[Step 3]</li></ul><p>Questions? Just reply to this email.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Post-purchase confirmation",
  },
  // Upsell
  {
    name: "Upsell — Feature Upgrade",
    subject: "Unlock more for {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've been looking at how {{outreach.account.name}} is using our platform, and I think you'd get a lot of value from upgrading to [plan/feature].</p><p>Here's what you'd unlock:</p><ul><li>[Benefit 1]</li><li>[Benefit 2]</li><li>[Benefit 3]</li></ul><p>Want me to set up a quick call to walk you through it?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Feature upgrade upsell",
  },
  {
    name: "Upsell — Expansion Opportunity",
    subject: "Growing your team at {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I noticed {{outreach.account.name}} has been growing — congratulations!</p><p>As your team expands, you might benefit from [expanded plan/feature]. It would allow you to [key benefit].</p><p>Happy to discuss the options. Do you have 15 minutes this week?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Expansion/upsell for growing accounts",
  },
  // Retention
  {
    name: "Retention — At-Risk Customer",
    subject: "Is everything okay at {{outreach.account.name}}?",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I noticed {{outreach.account.name}} hasn't been as active recently, and I wanted to check in.</p><p>Is there anything we could be doing better? I'd love to understand if there are any challenges we can help with.</p><p>Happy to jump on a call at your convenience.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Retention email for at-risk customers",
  },
  {
    name: "Retention — Win-Back",
    subject: "We miss you, {{outreach.contact.fullName}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been a while since we've heard from {{outreach.account.name}}, and we miss you.</p><p>We've made some significant improvements since you last used our platform, including [improvement 1] and [improvement 2].</p><p>Would you be open to a quick call to see what's new?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Win-back email for churned customers",
  },
  // Check-in
  {
    name: "Check-in — Quarterly Business Review",
    subject: "Quarterly check-in — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's that time of the quarter again! I'd love to schedule a brief review call with {{outreach.account.name}} to:</p><ul><li>Review progress against your goals</li><li>Share what's new on our end</li><li>Plan for the next quarter</li></ul><p>Does [DATE] at [TIME] work for you?</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Quarterly business review invitation",
  },
  {
    name: "Check-in — Annual Review",
    subject: "Your year in review — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>As we wrap up the year, I wanted to reach out and reflect on what {{outreach.account.name}} has accomplished with us.</p><p>[Key achievement 1]<br/>[Key achievement 2]<br/>[Key achievement 3]</p><p>I'd love to schedule a call to discuss your goals for next year and how we can support them.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Annual review email",
  },
  // Announcement
  {
    name: "Announcement — New Feature Launch",
    subject: "Introducing [Feature] — built for teams like {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'm excited to share that we've just launched [Feature Name] — and I think it's going to make a real difference for {{outreach.account.name}}.</p><p>Here's what it does: [1-2 sentence description]</p><p>You can try it now at [LINK], or I can walk you through it on a quick call.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "New feature announcement",
  },
  {
    name: "Announcement — Company News",
    subject: "Exciting news from {{sender_company}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to share some exciting news from {{sender_company}}: [announcement].</p><p>This means [benefit for the customer].</p><p>As always, thank you for being part of our journey. If you have any questions, I'm here.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Company news announcement",
  },
  // Welcome
  {
    name: "Welcome — Trial User",
    subject: "Your free trial is live — {{outreach.account.name}}",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Your free trial of {{sender_company}} is now active!</p><p>To get the most out of your trial, I recommend starting with:</p><ol><li>[First action]</li><li>[Second action]</li><li>[Third action]</li></ol><p>I'm here if you have any questions. Let's make this trial count!</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Trial activation welcome email",
  },
  {
    name: "Welcome — Newsletter Subscriber",
    subject: "Welcome to the {{sender_company}} community",
    content: "<p>Hi {{outreach.contact.fullName}},</p><p>Welcome to the {{sender_company}} community! We're glad to have you.</p><p>Here's what you can expect from us:</p><ul><li>📧 Weekly insights on [topic]</li><li>🎯 Actionable tips you can use right away</li><li>🔔 Early access to new features and content</li></ul><p>If there's a topic you'd love us to cover, just reply to this email.</p><p>Best,<br/>{{sender_name}}</p>",
    notes: "Newsletter welcome email",
  },
];

export function OutreachTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const seedOnceRef = useRef(false);

  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [editDraft, setEditDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-seed all templates on first load if none exist
  const autoSeed = async () => {
    if (seedOnceRef.current) return;
    seedOnceRef.current = true;
    setSeeding(true);
    try {
      // Seed built-in starter templates via API
      await apiRequest("/outreach/examples", {
        method: "POST",
        body: JSON.stringify({ templates: true, leads: false }),
        skipCache: true,
      }).catch(() => null); // ignore if already seeded

      // Seed all built-in templates
      for (const tmpl of BUILTIN_TEMPLATES) {
        await apiRequest("/templates", {
          method: "POST",
          body: JSON.stringify({ ...tmpl, type: "email" }),
          skipCache: true,
        }).catch(() => null); // skip duplicates silently
      }
      setSeeded(true);
      setReloadKey((v) => v + 1);
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type: "email", limit: "100", offset: "0" });
        if (q.trim()) params.set("q", q.trim());
        const response = await apiRequest<{ items: Template[] }>(`/templates/list?${params.toString()}`);
        if (!disposed) {
          setTemplates(response.items);
          // Auto-seed if no templates exist yet
          if (response.items.length === 0 && !seeded) {
            void autoSeed();
          }
        }
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load templates");
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    return () => { disposed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, reloadKey]);

  // Filtered templates
  const filteredTemplates = templates.filter((t) => {
    if (activeCategory === "All") return true;
    return getTemplateCategory(t.name) === activeCategory;
  });

  // Category counts
  const categoryCounts = templates.reduce<Record<string, number>>((acc, t) => {
    const cat = getTemplateCategory(t.name);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const openEdit = (template: Template) => {
    setEditDraft({
      id: template.id,
      name: template.name,
      subject: template.subject ?? "",
      content: template.content,
      notes: template.notes ?? "",
    });
  };

  const openNew = () => {
    setEditDraft({ ...emptyDraft });
  };

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editDraft) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: editDraft.name.trim(),
        type: "email",
        subject: editDraft.subject.trim() || undefined,
        content: editDraft.content.trim(),
        notes: editDraft.notes.trim() || undefined,
      };
      if (editDraft.id) {
        await apiRequest(`/templates/${editDraft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        setSuccess("Template updated.");
      } else {
        await apiRequest("/templates", { method: "POST", body: JSON.stringify(payload) });
        setSuccess("Template created.");
      }
      setEditDraft(null);
      setReloadKey((v) => v + 1);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Email Templates</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                {templates.length} template{templates.length !== 1 ? "s" : ""}
                {activeCategory !== "All" ? ` · ${filteredTemplates.length} in ${activeCategory}` : ""}
              </p>
            </div>
            <Button type="button" size="sm" onClick={openNew} className="gap-1.5">
              <Plus className="size-4" />
              Create Custom Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + filter bar */}
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates..." className="h-10 pl-9" />
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap gap-1.5">
            <div className="flex items-center gap-1 text-xs text-slate-500 mr-1">
              <Filter className="size-3" />
              Filter:
            </div>
            {ALL_CATEGORIES.map((cat) => {
              const count = cat === "All" ? templates.length : (categoryCounts[cat] ?? 0);
              if (cat !== "All" && count === 0) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-white text-slate-600 hover:border-primary/40 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                  <span className={`rounded-full px-1 text-[0.6rem] ${activeCategory === cat ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          {(loading || seeding) ? (
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {seeding ? "Setting up your template library..." : "Loading templates..."}
            </div>
          ) : null}

          {/* Template grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const category = getTemplateCategory(template.name);
              const mediaType = getTemplateMediaType(template.content);
              return (
                <div
                  key={template.id}
                  className="group relative flex flex-col rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{template.name}</div>
                      {template.subject ? (
                        <div className="mt-0.5 truncate text-xs text-slate-500">{template.subject}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {mediaType === "image" ? <Image className="size-3.5 text-sky-500" /> : null}
                      {mediaType === "video" ? <Video className="size-3.5 text-purple-500" /> : null}
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${categoryColors[category] ?? categoryColors.General}`}>
                      {category}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[0.68rem] text-slate-500">
                      <Mail className="size-2.5" />
                      Email
                    </span>
                  </div>

                  <div className="mb-3 line-clamp-3 flex-1 text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: template.content }} />

                  <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                    <span className="text-[0.68rem] text-slate-400">{new Date(template.updatedAt).toLocaleDateString()}</span>
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setPreviewTemplate(template)}>
                        <Eye className="size-3.5" />
                        Preview
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(template)}>
                        <Edit3 className="size-3.5" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && !seeding && filteredTemplates.length === 0 && templates.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center">
              <SlidersHorizontal className="mx-auto mb-3 size-7 text-slate-300" />
              <div className="text-sm font-medium text-slate-600">No templates in "{activeCategory}"</div>
              <p className="mt-1 text-xs text-slate-400">Try a different category or create a new template.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setActiveCategory("All")}>
                Show all templates
              </Button>
            </div>
          ) : null}

          {!loading && !seeding && templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
              <Mail className="mx-auto mb-3 size-8 text-slate-300" />
              <div className="text-sm font-medium text-slate-600">No templates yet</div>
              <p className="mt-1 text-xs text-slate-400">Create your first custom template to get started.</p>
              <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={openNew}>
                <Plus className="size-4" />
                Create Custom Template
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {previewTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewTemplate(null)}>
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-white px-5 py-4">
              <div>
                <div className="font-semibold text-slate-900">{previewTemplate.name}</div>
                {previewTemplate.subject ? (
                  <div className="mt-0.5 text-sm text-slate-500">Subject: {previewTemplate.subject}</div>
                ) : null}
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${categoryColors[getTemplateCategory(previewTemplate.name)] ?? categoryColors.General}`}>
                    {getTemplateCategory(previewTemplate.name)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { openEdit(previewTemplate); setPreviewTemplate(null); }} className="gap-1.5">
                  <Edit3 className="size-3.5" />
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewTemplate(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="p-5">
              <div className="prose prose-sm max-w-none text-slate-800" dangerouslySetInnerHTML={{ __html: previewTemplate.content }} />
              {previewTemplate.notes ? (
                <div className="mt-4 rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <strong>Notes:</strong> {previewTemplate.notes}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit / Create Modal */}
      {editDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-white px-5 py-4">
              <div>
                <div className="font-semibold text-slate-900">{editDraft.id ? "Edit Template" : "Create Custom Template"}</div>
                {!editDraft.id ? (
                  <p className="mt-0.5 text-xs text-slate-500">Build a reusable email template with dynamic variables</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setEditDraft(null)} disabled={saving}>
                <X className="size-4" />
              </Button>
            </div>
            <form className="grid gap-4 p-5" onSubmit={saveTemplate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Template Name</FieldLabel>
                  <Input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : d)}
                    placeholder="e.g. B2B Cold Intro"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Subject Line</FieldLabel>
                  <Input
                    value={editDraft.subject}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, subject: e.target.value } : d)}
                    placeholder="e.g. Quick question for {{outreach.account.name}}"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="mb-1.5 font-semibold text-slate-700">Insert variable:</div>
                <div className="flex flex-wrap gap-1">
                  {["{{outreach.contact.fullName}}", "{{outreach.account.name}}", "{{sender_name}}", "{{sender_company}}"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="rounded bg-white px-1.5 py-0.5 font-mono text-[0.65rem] border border-border/60 hover:bg-slate-100 hover:border-primary/40"
                      onClick={() => setEditDraft((d) => d ? { ...d, content: d.content + v } : d)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <Field>
                <FieldLabel>Body (HTML supported)</FieldLabel>
                <Textarea
                  value={editDraft.content}
                  onChange={(e) => setEditDraft((d) => d ? { ...d, content: e.target.value } : d)}
                  className="min-h-56 font-mono text-xs"
                  placeholder="<p>Hi {{outreach.contact.fullName}},</p><p>Your message here...</p>"
                  required
                />
                <div className="mt-1 text-xs text-slate-400">
                  Supports HTML. Add images with &lt;img src="..."&gt; or embed video links.
                </div>
              </Field>

              <Field>
                <FieldLabel>Notes (internal)</FieldLabel>
                <Textarea
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft((d) => d ? { ...d, notes: e.target.value } : d)}
                  className="min-h-16"
                  placeholder="When to use this template, target audience, tips..."
                />
              </Field>

              {editDraft.content.trim() ? (
                <div className="rounded-xl border border-border/60 bg-slate-50 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live Preview</div>
                  {editDraft.subject ? (
                    <div className="mb-2 text-sm font-semibold text-slate-900">Subject: {editDraft.subject}</div>
                  ) : null}
                  <div className="prose prose-sm max-w-none text-slate-800" dangerouslySetInnerHTML={{ __html: editDraft.content }} />
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDraft(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editDraft.name.trim() || !editDraft.content.trim()}>
                  {saving ? "Saving..." : editDraft.id ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
