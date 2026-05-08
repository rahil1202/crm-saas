import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  campaignCustomers,
  campaigns,
  customers,
  deals,
  documents,
  emailAnalyticsDaily,
  emailAccounts,
  emailTrackingEvents,
  followUps,
  formResponses,
  forms,
  leads,
  meetings,
  partnerCompanies,
  profiles,
  socialAccounts,
  socialConversations,
  tasks,
  whatsappWorkspaces,
} from "@/db/schema";
import { ok } from "@/lib/api";
import type { ReportDashboardQuery, ReportSummaryQuery } from "@/modules/reports/schema";

function toCountItems(items: Map<string, number>) {
  return Array.from(items.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function increment(items: Map<string, number>, key: string) {
  items.set(key, (items.get(key) ?? 0) + 1);
}

function getMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getForecastMonths(forecastMonths: number) {
  const now = new Date();
  const months: Array<{ month: string; label: string }> = [];

  for (let offset = 0; offset < forecastMonths; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const month = getMonthKey(date);
    months.push({ month, label: getMonthLabel(month) });
  }

  return months;
}

function getRate(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(1));
}

function dataPointAverage(values: number[]) {
  const usableValues = values.filter((value) => Number.isFinite(value));
  if (usableValues.length === 0) {
    return 0;
  }

  return usableValues.reduce((total, value) => total + value, 0) / usableValues.length;
}

function getWeekStart(date: Date) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

function getWeekLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getRelativeStatusTone(input: { dueAt?: string | Date | null; status?: string | null }, now: Date) {
  if (input.status === "done" || input.status === "completed" || input.status === "won") {
    return "good";
  }

  if (input.dueAt && new Date(input.dueAt) < now) {
    return "risk";
  }

  return "neutral";
}

export function getReportOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "reports",
    capabilities: [
      "dashboard-insights",
      "lead-reports",
      "deal-reports",
      "revenue-forecast",
      "partner-performance",
      "campaign-performance",
    ],
  });
}

export async function getDashboardInsights(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ReportDashboardQuery;
  const now = new Date();
  const periodStart = new Date(Date.now() - query.periodDays * 24 * 60 * 60 * 1000);
  const forecastRange = getForecastMonths(query.forecastMonths);

  const [
    leadRows,
    customerRows,
    dealRows,
    taskRows,
    followUpRows,
    partnerRows,
    campaignRows,
    meetingRows,
    documentRows,
    formRows,
    formResponseRows,
    socialAccountRows,
    socialConversationRows,
    emailAccountRows,
    whatsappWorkspaceRows,
  ] = await Promise.all([
    db
      .select({
        id: leads.id,
        title: leads.title,
        fullName: leads.fullName,
        assignedToUserId: leads.assignedToUserId,
        source: leads.source,
        status: leads.status,
        score: leads.score,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
      .orderBy(desc(leads.createdAt)),
    db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(and(eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
      .orderBy(desc(customers.createdAt)),
    db
      .select({
        id: deals.id,
        title: deals.title,
        status: deals.status,
        pipeline: deals.pipeline,
        stage: deals.stage,
        value: deals.value,
        assignedToUserId: deals.assignedToUserId,
        expectedCloseDate: deals.expectedCloseDate,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
      })
      .from(deals)
      .where(and(eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
      .orderBy(desc(deals.updatedAt), desc(deals.createdAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        assignedToUserId: tasks.assignedToUserId,
        status: tasks.status,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt)),
    db
      .select({
        id: followUps.id,
        subject: followUps.subject,
        channel: followUps.channel,
        status: followUps.status,
        scheduledAt: followUps.scheduledAt,
        createdAt: followUps.createdAt,
      })
      .from(followUps)
      .where(and(eq(followUps.companyId, tenant.companyId), isNull(followUps.deletedAt)))
      .orderBy(desc(followUps.scheduledAt), desc(followUps.createdAt)),
    db
      .select({
        id: partnerCompanies.id,
        name: partnerCompanies.name,
        status: partnerCompanies.status,
      })
      .from(partnerCompanies)
      .where(and(eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt))),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        channel: campaigns.channel,
        status: campaigns.status,
        sentCount: campaigns.sentCount,
        deliveredCount: campaigns.deliveredCount,
        openedCount: campaigns.openedCount,
        clickedCount: campaigns.clickedCount,
        replyCount: campaigns.replyCount,
        bounceCount: campaigns.bounceCount,
        engagementScore: campaigns.engagementScore,
        createdAt: campaigns.createdAt,
        launchedAt: campaigns.launchedAt,
      })
      .from(campaigns)
      .where(and(eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
      .orderBy(desc(campaigns.createdAt)),
    db
      .select({
        id: meetings.id,
        title: meetings.title,
        source: meetings.source,
        status: meetings.status,
        startsAt: meetings.startsAt,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .where(and(eq(meetings.companyId, tenant.companyId), isNull(meetings.deletedAt)))
      .orderBy(desc(meetings.startsAt)),
    db
      .select({
        id: documents.id,
        originalName: documents.originalName,
        folder: documents.folder,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt)),
    db
      .select({
        id: forms.id,
        status: forms.status,
        publishedAt: forms.publishedAt,
        updatedAt: forms.updatedAt,
      })
      .from(forms)
      .where(and(eq(forms.companyId, tenant.companyId), isNull(forms.deletedAt))),
    db
      .select({
        id: formResponses.id,
        linkedLeadId: formResponses.linkedLeadId,
        submittedAt: formResponses.submittedAt,
      })
      .from(formResponses)
      .where(eq(formResponses.companyId, tenant.companyId))
      .orderBy(desc(formResponses.submittedAt)),
    db
      .select({
        id: socialAccounts.id,
        platform: socialAccounts.platform,
        status: socialAccounts.status,
      })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, tenant.companyId), isNull(socialAccounts.deletedAt))),
    db
      .select({
        id: socialConversations.id,
        status: socialConversations.status,
        unreadCount: socialConversations.unreadCount,
        lastMessageAt: socialConversations.lastMessageAt,
      })
      .from(socialConversations)
      .where(and(eq(socialConversations.companyId, tenant.companyId), isNull(socialConversations.deletedAt)))
      .orderBy(desc(socialConversations.lastMessageAt)),
    db
      .select({
        id: emailAccounts.id,
        status: emailAccounts.status,
        isDefault: emailAccounts.isDefault,
      })
      .from(emailAccounts)
      .where(and(eq(emailAccounts.companyId, tenant.companyId), isNull(emailAccounts.deletedAt))),
    db
      .select({
        id: whatsappWorkspaces.id,
        isActive: whatsappWorkspaces.isActive,
        isVerified: whatsappWorkspaces.isVerified,
        webhookKey: whatsappWorkspaces.webhookKey,
      })
      .from(whatsappWorkspaces)
      .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), isNull(whatsappWorkspaces.deletedAt))),
  ]);

  const recentLeads = leadRows.filter((lead) => new Date(lead.createdAt) >= periodStart);
  const recentCustomers = customerRows.filter((customer) => new Date(customer.createdAt) >= periodStart);
  const recentDeals = dealRows.filter((deal) => new Date(deal.createdAt) >= periodStart);
  const recentMeetings = meetingRows.filter((meeting) => new Date(meeting.createdAt) >= periodStart);
  const recentDocuments = documentRows.filter((document) => new Date(document.createdAt) >= periodStart);
  const pendingFollowUps = followUpRows.filter((followUp) => followUp.status === "pending");
  const openDeals = dealRows.filter((deal) => deal.status === "open");
  const wonDeals = dealRows.filter((deal) => deal.status === "won");
  const completedTasks = taskRows.filter((task) => task.status === "done");
  const openTasks = taskRows.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) < now);
  const dueTodayTasks = openTasks.filter((task) => task.dueAt && getDateKey(new Date(task.dueAt)) === getDateKey(now));
  const upcomingMeetings = meetingRows.filter(
    (meeting) => meeting.status === "scheduled" && new Date(meeting.startsAt) >= now,
  );
  const completedMeetings = meetingRows.filter((meeting) => meeting.status === "completed");
  const activeCampaigns = campaignRows.filter((campaign) => campaign.status === "active");
  const activePartners = partnerRows.filter((partner) => partner.status === "active");
  const forecastBuckets = new Map<string, { totalValue: number; dealCount: number }>();

  for (const month of forecastRange) {
    forecastBuckets.set(month.month, { totalValue: 0, dealCount: 0 });
  }

  const pipelineStageCounts = new Map<string, { count: number; value: number }>();
  const leadSourceCounts = new Map<string, number>();
  const taskStatusCounts = new Map<string, number>();
  const taskPriorityCounts = new Map<string, number>();

  for (const lead of recentLeads) {
    increment(leadSourceCounts, lead.source ?? "unknown");
  }

  let wonRevenue = 0;
  let forecastValue = 0;
  for (const deal of dealRows) {
    const currentStage = pipelineStageCounts.get(deal.stage) ?? { count: 0, value: 0 };
    currentStage.count += 1;
    currentStage.value += deal.value;
    pipelineStageCounts.set(deal.stage, currentStage);

    if (deal.status === "won") {
      wonRevenue += deal.value;
    }

    if (deal.status === "open" && deal.expectedCloseDate) {
      const monthKey = getMonthKey(new Date(deal.expectedCloseDate));
      const bucket = forecastBuckets.get(monthKey);
      if (bucket) {
        bucket.totalValue += deal.value;
        bucket.dealCount += 1;
      }
    }
  }

  for (const task of taskRows) {
    increment(taskStatusCounts, task.status);
    increment(taskPriorityCounts, task.priority ?? "normal");
  }

  const forecastItems = forecastRange.map((month) => {
    const bucket = forecastBuckets.get(month.month) ?? { totalValue: 0, dealCount: 0 };
    forecastValue += bucket.totalValue;

    return {
      month: month.month,
      label: month.label,
      totalValue: bucket.totalValue,
      dealCount: bucket.dealCount,
    };
  });

  const weeklyLeadVelocity = (() => {
    const currentWeekStart = getWeekStart(now);
    const buckets: Array<{ weekStart: string; label: string; leads: number; customers: number }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(currentWeekStart);
      date.setUTCDate(date.getUTCDate() - offset * 7);
      buckets.push({
        weekStart: getDateKey(date),
        label: getWeekLabel(date),
        leads: 0,
        customers: 0,
      });
    }

    const bucketMap = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]));

    for (const lead of recentLeads) {
      const weekStart = getDateKey(getWeekStart(new Date(lead.createdAt)));
      const bucket = bucketMap.get(weekStart);
      if (bucket) {
        bucket.leads += 1;
      }
    }

    for (const customer of recentCustomers) {
      const weekStart = getDateKey(getWeekStart(new Date(customer.createdAt)));
      const bucket = bucketMap.get(weekStart);
      if (bucket) {
        bucket.customers += 1;
      }
    }

    return buckets;
  })();

  const partnerRevenue = new Map<string, { wonRevenue: number; activeDeals: number }>();
  for (const partner of partnerRows) {
    partnerRevenue.set(partner.id, { wonRevenue: 0, activeDeals: 0 });
  }

  for (const deal of dealRows) {
    if (!("partnerCompanyId" in deal)) {
      continue;
    }
  }

  const dashboardActivity = [
    ...leadRows.slice(0, 6).map((lead) => ({
      id: `lead-${lead.id}`,
      type: "lead",
      title: lead.fullName || lead.title || "New lead",
      detail: `${lead.status} lead${lead.source ? ` from ${lead.source}` : ""}`,
      timestamp: lead.createdAt,
      tone: lead.status === "won" ? "good" : "neutral",
    })),
    ...dealRows.slice(0, 6).map((deal) => ({
      id: `deal-${deal.id}`,
      type: "deal",
      title: deal.title,
      detail: `${deal.stage} stage`,
      timestamp: deal.updatedAt,
      tone: deal.status === "won" ? "good" : deal.status === "lost" ? "risk" : "neutral",
      amount: deal.value,
    })),
    ...taskRows.slice(0, 6).map((task) => ({
      id: `task-${task.id}`,
      type: "task",
      title: task.title,
      detail: `${task.status.replaceAll("_", " ")} task`,
      timestamp: task.dueAt ?? task.createdAt,
      tone: getRelativeStatusTone(task, now),
    })),
    ...meetingRows.slice(0, 4).map((meeting) => ({
      id: `meeting-${meeting.id}`,
      type: "meeting",
      title: meeting.title,
      detail: `${meeting.status.replaceAll("_", " ")} meeting`,
      timestamp: meeting.startsAt,
      tone: meeting.status === "completed" ? "good" : "neutral",
    })),
    ...documentRows.slice(0, 4).map((document) => ({
      id: `document-${document.id}`,
      type: "document",
      title: document.originalName,
      detail: `${document.folder} upload`,
      timestamp: document.createdAt,
      tone: "neutral",
      amount: document.sizeBytes,
    })),
  ]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, query.activityLimit);

  const campaignTotals = campaignRows.reduce(
    (accumulator, campaign) => ({
      sent: accumulator.sent + campaign.sentCount,
      delivered: accumulator.delivered + campaign.deliveredCount,
      opened: accumulator.opened + campaign.openedCount,
      clicked: accumulator.clicked + campaign.clickedCount,
      replied: accumulator.replied + campaign.replyCount,
      bounced: accumulator.bounced + campaign.bounceCount,
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 },
  );

  const topDeals = dealRows
    .slice()
    .sort((left, right) => right.value - left.value || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, query.topDealsLimit)
    .map((deal) => ({
      id: deal.id,
      title: deal.title,
      stage: deal.stage,
      status: deal.status,
      value: deal.value,
      expectedCloseDate: deal.expectedCloseDate,
    }));

  const cancelledOrNoShowMeetings = meetingRows.filter((meeting) => meeting.status === "cancelled" || meeting.status === "no_show");
  const lowDeliveryCampaigns = campaignRows.filter((campaign) => campaign.sentCount > 0 && getRate(campaign.deliveredCount, campaign.sentCount) < 80);
  const openConversations = socialConversationRows.filter((conversation) => conversation.status === "open");
  const assignedConversations = socialConversationRows.filter((conversation) => conversation.status === "assigned");
  const unreadConversations = socialConversationRows.filter((conversation) => conversation.unreadCount > 0);
  const unreadMessages = socialConversationRows.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const staleDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const openDealsWithoutCloseDate = openDeals.filter((deal) => !deal.expectedCloseDate);
  const staleOpenDeals = openDeals.filter((deal) => new Date(deal.updatedAt) < staleDate);
  const averageOpenDealValue = openDeals.length > 0 ? openDeals.reduce((total, deal) => total + deal.value, 0) / openDeals.length : 0;
  const highValueOpenDeals = openDeals.filter((deal) => deal.value >= Math.max(averageOpenDealValue, 1));
  const openPipelineValue = openDeals.reduce((total, deal) => total + deal.value, 0);
  const forecastConfidence = Math.round(
    Math.min(100, Math.max(0, dataPointAverage([getRate(forecastValue, openPipelineValue), getRate(wonDeals.length, dealRows.length), getRate(openDeals.length - openDealsWithoutCloseDate.length, openDeals.length)]))),
  );
  const publishedForms = formRows.filter((form) => form.status === "published");
  const formConversions = formResponseRows.filter((response) => response.linkedLeadId).length;
  const connectedEmailAccounts = emailAccountRows.filter((account) => account.status === "connected");
  const activeWhatsappWorkspaces = whatsappWorkspaceRows.filter((workspace) => workspace.isActive);
  const verifiedWhatsappWorkspaces = activeWhatsappWorkspaces.filter((workspace) => workspace.isVerified && workspace.webhookKey);
  const connectedSocialAccounts = socialAccountRows.filter((account) => account.status === "connected");
  const assigneeScores = new Map<
    string,
    {
      userId: string | null;
      openTasks: number;
      overdueTasks: number;
      dueTodayTasks: number;
      openDeals: number;
      assignedLeads: number;
      pressureScore: number;
    }
  >();
  const getAssigneeScore = (userId: string | null) => {
    const key = userId ?? "unassigned";
    const existing =
      assigneeScores.get(key) ??
      {
        userId,
        openTasks: 0,
        overdueTasks: 0,
        dueTodayTasks: 0,
        openDeals: 0,
        assignedLeads: 0,
        pressureScore: 0,
      };
    assigneeScores.set(key, existing);
    return existing;
  };

  for (const task of openTasks) {
    const score = getAssigneeScore(task.assignedToUserId ?? null);
    score.openTasks += 1;
    score.pressureScore += 2;
    if (task.dueAt && new Date(task.dueAt) < now) {
      score.overdueTasks += 1;
      score.pressureScore += 3;
    }
    if (task.dueAt && getDateKey(new Date(task.dueAt)) === getDateKey(now)) {
      score.dueTodayTasks += 1;
      score.pressureScore += 2;
    }
  }

  for (const deal of openDeals) {
    const score = getAssigneeScore(deal.assignedToUserId ?? null);
    score.openDeals += 1;
    score.pressureScore += 2;
  }

  for (const lead of leadRows.filter((lead) => lead.status === "new" || lead.status === "qualified")) {
    const score = getAssigneeScore(lead.assignedToUserId ?? null);
    score.assignedLeads += 1;
    score.pressureScore += 1;
  }

  const workloadProfileIds = Array.from(assigneeScores.values())
    .map((item) => item.userId)
    .filter((userId): userId is string => Boolean(userId));
  const workloadProfiles =
    workloadProfileIds.length === 0
      ? []
      : await db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            email: profiles.email,
          })
          .from(profiles)
          .where(inArray(profiles.id, workloadProfileIds));
  const workloadProfileMap = new Map(workloadProfiles.map((profile) => [profile.id, profile]));

  return ok(c, {
    generatedAt: now.toISOString(),
    periodDays: query.periodDays,
    forecastMonths: query.forecastMonths,
    overview: {
      totalLeads: leadRows.length,
      newLeads: recentLeads.length,
      totalCustomers: customerRows.length,
      newCustomers: recentCustomers.length,
      openDeals: openDeals.length,
      wonDeals: wonDeals.length,
      overdueTasks: overdueTasks.length,
      dueTodayTasks: dueTodayTasks.length,
      pendingFollowUps: pendingFollowUps.length,
      scheduledMeetings: upcomingMeetings.length,
      activeCampaigns: activeCampaigns.length,
      activePartners: activePartners.length,
      documentCount: documentRows.length,
      recentDocuments: recentDocuments.length,
      recentMeetings: recentMeetings.length,
      forecastValue,
      wonRevenue,
      averageDealValue:
        dealRows.length > 0 ? Math.round(dealRows.reduce((total, deal) => total + deal.value, 0) / dealRows.length) : 0,
    },
    conversion: {
      leadToCustomerRate: getRate(customerRows.length, leadRows.length),
      openDealWinRate: getRate(wonDeals.length, dealRows.length),
      taskCompletionRate: getRate(completedTasks.length, taskRows.length),
      campaignDeliveryRate: getRate(campaignTotals.delivered, campaignTotals.sent),
      campaignEngagementRate: getRate(campaignTotals.opened, campaignTotals.delivered),
      meetingCompletionRate: getRate(completedMeetings.length, meetingRows.length),
    },
    pipeline: {
      byStage: Array.from(pipelineStageCounts.entries())
        .map(([stage, value]) => ({
          key: stage,
          count: value.count,
          value: value.value,
        }))
        .sort((left, right) => right.value - left.value || right.count - left.count),
      forecast: forecastItems,
    },
    leadVelocity: {
      byWeek: weeklyLeadVelocity,
      bySource: toCountItems(leadSourceCounts),
    },
    taskHealth: {
      byStatus: toCountItems(taskStatusCounts),
      byPriority: toCountItems(taskPriorityCounts),
      openCount: openTasks.length,
      overdueCount: overdueTasks.length,
      dueTodayCount: dueTodayTasks.length,
    },
    campaignHealth: {
      totals: {
        sentCount: campaignTotals.sent,
        deliveredCount: campaignTotals.delivered,
        openedCount: campaignTotals.opened,
        clickedCount: campaignTotals.clicked,
        repliedCount: campaignTotals.replied,
        bouncedCount: campaignTotals.bounced,
      },
      ranking: campaignRows
        .slice()
        .sort((left, right) => right.engagementScore - left.engagementScore || right.openedCount - left.openedCount)
        .slice(0, 5)
        .map((campaign) => ({
          campaignId: campaign.id,
          name: campaign.name,
          channel: campaign.channel,
          status: campaign.status,
          engagementScore: campaign.engagementScore,
          deliveryRate: getRate(campaign.deliveredCount, campaign.sentCount),
          openRate: getRate(campaign.openedCount, campaign.deliveredCount),
          clickRate: getRate(campaign.clickedCount, campaign.openedCount),
        })),
    },
    meetingOverview: {
      upcomingCount: upcomingMeetings.length,
      completedCount: completedMeetings.length,
      items: upcomingMeetings.slice(0, 5).map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        source: meeting.source,
        status: meeting.status,
        startsAt: meeting.startsAt,
      })),
    },
    topDeals,
    activityFeed: dashboardActivity,
    signals: {
      attention: {
        overdueTasks: overdueTasks.length,
        dueTodayTasks: dueTodayTasks.length,
        pendingFollowUps: pendingFollowUps.length,
        cancelledOrNoShowMeetings: cancelledOrNoShowMeetings.length,
        lowDeliveryCampaigns: lowDeliveryCampaigns.length,
        unreadConversations: unreadConversations.length,
        unreadMessages,
      },
      pipelineRisk: {
        openPipelineValue,
        openDealsWithoutCloseDate: openDealsWithoutCloseDate.length,
        staleOpenDeals: staleOpenDeals.length,
        highValueOpenDeals: highValueOpenDeals.length,
        forecastConfidence,
      },
      forms: {
        totalCount: formRows.length,
        publishedCount: publishedForms.length,
        submissions: formResponseRows.length,
        conversions: formConversions,
        lastSubmissionAt: formResponseRows[0]?.submittedAt ?? null,
      },
      social: {
        connectedAccounts: connectedSocialAccounts.length,
        openConversations: openConversations.length,
        assignedConversations: assignedConversations.length,
        unreadConversations: unreadConversations.length,
        unreadMessages,
        lastMessageAt: socialConversationRows[0]?.lastMessageAt ?? null,
      },
      readiness: {
        email: {
          accountCount: emailAccountRows.length,
          connectedAccounts: connectedEmailAccounts.length,
          defaultAccountCount: connectedEmailAccounts.filter((account) => account.isDefault).length,
        },
        whatsapp: {
          workspaceCount: whatsappWorkspaceRows.length,
          activeWorkspaceCount: activeWhatsappWorkspaces.length,
          verifiedWorkspaceCount: verifiedWhatsappWorkspaces.length,
        },
      },
      workload: Array.from(assigneeScores.values())
        .sort((left, right) => right.pressureScore - left.pressureScore || right.overdueTasks - left.overdueTasks)
        .slice(0, 4)
        .map((item) => {
          const profile = item.userId ? workloadProfileMap.get(item.userId) : null;
          return {
            userId: item.userId,
            name: profile?.fullName || profile?.email || "Unassigned",
            openTasks: item.openTasks,
            overdueTasks: item.overdueTasks,
            dueTodayTasks: item.dueTodayTasks,
            openDeals: item.openDeals,
            assignedLeads: item.assignedLeads,
            pressureScore: item.pressureScore,
          };
        }),
    },
  });
}

export async function getReportSummary(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ReportSummaryQuery;
  const periodStart = new Date(Date.now() - query.periodDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [leadRows, dealRows, taskRows, partnerRows, campaignRows, emailAnalyticsRows, emailEventRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        status: leads.status,
        source: leads.source,
        score: leads.score,
        assignedToUserId: leads.assignedToUserId,
        partnerCompanyId: leads.partnerCompanyId,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt))),
    db
      .select({
        id: deals.id,
        status: deals.status,
        pipeline: deals.pipeline,
        stage: deals.stage,
        leadId: deals.leadId,
        customerId: deals.customerId,
        value: deals.value,
        assignedToUserId: deals.assignedToUserId,
        partnerCompanyId: deals.partnerCompanyId,
        expectedCloseDate: deals.expectedCloseDate,
        createdAt: deals.createdAt,
      })
      .from(deals)
      .where(and(eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt))),
    db
      .select({
        id: tasks.id,
        status: tasks.status,
        assignedToUserId: tasks.assignedToUserId,
        dueAt: tasks.dueAt,
      })
      .from(tasks)
      .where(and(eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt))),
    db
      .select({
        id: partnerCompanies.id,
        name: partnerCompanies.name,
        status: partnerCompanies.status,
      })
      .from(partnerCompanies)
      .where(and(eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt))),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        channel: campaigns.channel,
        sentCount: campaigns.sentCount,
        deliveredCount: campaigns.deliveredCount,
        openedCount: campaigns.openedCount,
        clickedCount: campaigns.clickedCount,
        replyCount: campaigns.replyCount,
        bounceCount: campaigns.bounceCount,
        engagementScore: campaigns.engagementScore,
        scheduledAt: campaigns.scheduledAt,
        launchedAt: campaigns.launchedAt,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(and(eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
      .orderBy(desc(campaigns.createdAt)),
    db.select().from(emailAnalyticsDaily).where(and(eq(emailAnalyticsDaily.companyId, tenant.companyId))),
    db
      .select({
        eventType: emailTrackingEvents.eventType,
        occurredAt: emailTrackingEvents.occurredAt,
      })
      .from(emailTrackingEvents)
      .where(and(eq(emailTrackingEvents.companyId, tenant.companyId))),
  ]);

  const campaignIds = campaignRows.map((campaign) => campaign.id);
  const campaignAudienceRows =
    campaignIds.length === 0
      ? []
      : await db
          .select({
            campaignId: campaignCustomers.campaignId,
          })
          .from(campaignCustomers)
          .where(and(eq(campaignCustomers.companyId, tenant.companyId), inArray(campaignCustomers.campaignId, campaignIds)));

  const customerRows = await db
    .select({
      id: customers.id,
      leadId: customers.leadId,
      assignedToUserId: customers.assignedToUserId,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)));

  const leadStatusCounts = new Map<string, number>();
  const leadSourceCounts = new Map<string, number>();
  const dealStatusCounts = new Map<string, number>();
  const pipelineCounts = new Map<string, number>();
  const forecastBuckets = new Map<string, { totalValue: number; dealCount: number }>();
  const forecastMonths = getForecastMonths(query.forecastMonths);

  for (const month of forecastMonths) {
    forecastBuckets.set(month.month, { totalValue: 0, dealCount: 0 });
  }

  const recentLeads = leadRows.filter((lead) => new Date(lead.createdAt) >= periodStart);
  const recentDeals = dealRows.filter((deal) => new Date(deal.createdAt) >= periodStart);
  const recentCustomers = customerRows.filter((customer) => new Date(customer.createdAt) >= periodStart);
  const openTasks = taskRows.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) < now);
  const dueTodayTasks = openTasks.filter((task) => {
    if (!task.dueAt) {
      return false;
    }

    return getDateKey(new Date(task.dueAt)) === getDateKey(now);
  });
  const openDeals = dealRows.filter((deal) => deal.status === "open");
  const wonDeals = dealRows.filter((deal) => deal.status === "won");
  const lostDeals = dealRows.filter((deal) => deal.status === "lost");
  const qualifiedLeads = leadRows.filter((lead) => lead.status === "qualified" || lead.status === "proposal" || lead.status === "won");
  const hotLeads = leadRows.filter((lead) => lead.score >= 75);
  const leadIdsWithDeal = new Set(dealRows.map((deal) => deal.leadId).filter(Boolean));
  const convertedLeadIds = new Set(customerRows.map((customer) => customer.leadId).filter(Boolean));

  for (const lead of recentLeads) {
    increment(leadStatusCounts, lead.status);
    increment(leadSourceCounts, lead.source ?? "unknown");
  }

  const ownerStats = new Map<
    string,
    {
      userId: string | null;
      leads: number;
      hotLeads: number;
      customers: number;
      openDeals: number;
      wonDeals: number;
      lostDeals: number;
      openValue: number;
      wonRevenue: number;
      overdueTasks: number;
    }
  >();
  const getOwnerStats = (userId: string | null) => {
    const key = userId ?? "unassigned";
    const existing = ownerStats.get(key);
    if (existing) return existing;
    const created = {
      userId,
      leads: 0,
      hotLeads: 0,
      customers: 0,
      openDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      openValue: 0,
      wonRevenue: 0,
      overdueTasks: 0,
    };
    ownerStats.set(key, created);
    return created;
  };

  for (const lead of leadRows) {
    const owner = getOwnerStats(lead.assignedToUserId ?? null);
    owner.leads += 1;
    if (lead.score >= 75) owner.hotLeads += 1;
  }

  for (const customer of customerRows) {
    getOwnerStats(customer.assignedToUserId ?? null).customers += 1;
  }

  let openValue = 0;
  let wonValue = 0;
  let lostValue = 0;

  for (const deal of dealRows) {
    increment(dealStatusCounts, deal.status);
    increment(pipelineCounts, deal.pipeline);

    if (deal.status === "open") {
      openValue += deal.value;
      const owner = getOwnerStats(deal.assignedToUserId ?? null);
      owner.openDeals += 1;
      owner.openValue += deal.value;
    }
    if (deal.status === "won") {
      wonValue += deal.value;
      const owner = getOwnerStats(deal.assignedToUserId ?? null);
      owner.wonDeals += 1;
      owner.wonRevenue += deal.value;
    }
    if (deal.status === "lost") {
      lostValue += deal.value;
      getOwnerStats(deal.assignedToUserId ?? null).lostDeals += 1;
    }

    if (deal.status !== "open" || !deal.expectedCloseDate) {
      continue;
    }

    const monthKey = getMonthKey(new Date(deal.expectedCloseDate));
    const bucket = forecastBuckets.get(monthKey);
    if (!bucket) {
      continue;
    }

    bucket.totalValue += deal.value;
    bucket.dealCount += 1;
  }

  for (const task of overdueTasks) {
    getOwnerStats(task.assignedToUserId ?? null).overdueTasks += 1;
  }

  const ownerProfileIds = Array.from(ownerStats.values())
    .map((item) => item.userId)
    .filter((userId): userId is string => Boolean(userId));
  const ownerProfiles =
    ownerProfileIds.length === 0
      ? []
      : await db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            email: profiles.email,
          })
          .from(profiles)
          .where(inArray(profiles.id, ownerProfileIds));
  const ownerProfileMap = new Map(ownerProfiles.map((profile) => [profile.id, profile]));

  const partnerLeadCounts = new Map<string, number>();
  const partnerDealOpenCounts = new Map<string, number>();
  const partnerDealWonCounts = new Map<string, number>();
  const partnerWonValues = new Map<string, number>();

  for (const lead of leadRows) {
    if (lead.partnerCompanyId) {
      increment(partnerLeadCounts, lead.partnerCompanyId);
    }
  }

  for (const deal of dealRows) {
    if (!deal.partnerCompanyId) {
      continue;
    }

    if (deal.status === "open") {
      increment(partnerDealOpenCounts, deal.partnerCompanyId);
    }
    if (deal.status === "won") {
      increment(partnerDealWonCounts, deal.partnerCompanyId);
      partnerWonValues.set(deal.partnerCompanyId, (partnerWonValues.get(deal.partnerCompanyId) ?? 0) + deal.value);
    }
  }

  const audienceByCampaign = new Map<string, number>();
  for (const row of campaignAudienceRows) {
    audienceByCampaign.set(row.campaignId, (audienceByCampaign.get(row.campaignId) ?? 0) + 1);
  }

  const forecastItems = forecastMonths.map((month) => ({
    month: month.month,
    label: month.label,
    totalValue: forecastBuckets.get(month.month)?.totalValue ?? 0,
    dealCount: forecastBuckets.get(month.month)?.dealCount ?? 0,
  }));

  const forecastValue = forecastItems.reduce((total, item) => total + item.totalValue, 0);
  const averageDealValue =
    dealRows.length > 0 ? Math.round(dealRows.reduce((total, deal) => total + deal.value, 0) / dealRows.length) : 0;

  const analyticsStart = new Date(periodStart.toISOString().slice(0, 10));
  const filteredAnalytics = emailAnalyticsRows.filter((row) => new Date(row.day) >= analyticsStart);
  const analyticsTotals = filteredAnalytics.reduce(
    (accumulator, row) => ({
      sent: accumulator.sent + row.sentCount,
      delivered: accumulator.delivered + row.deliveredCount,
      opened: accumulator.opened + row.openedCount,
      clicked: accumulator.clicked + row.clickedCount,
      replied: accumulator.replied + row.repliedCount,
      bounced: accumulator.bounced + row.bouncedCount,
      engagement: accumulator.engagement + row.engagementScore,
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, engagement: 0 },
  );
  const eventTrend = new Map<string, { opened: number; clicked: number; replied: number; bounced: number }>();
  for (const event of emailEventRows) {
    const day = new Date(event.occurredAt).toISOString().slice(0, 10);
    if (new Date(day) < analyticsStart) {
      continue;
    }
    const bucket = eventTrend.get(day) ?? { opened: 0, clicked: 0, replied: 0, bounced: 0 };
    if (event.eventType === "opened") bucket.opened += 1;
    if (event.eventType === "clicked") bucket.clicked += 1;
    if (event.eventType === "replied") bucket.replied += 1;
    if (event.eventType === "failed") bucket.bounced += 1;
    eventTrend.set(day, bucket);
  }
  const trend = Array.from(eventTrend.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, values]) => ({ day, ...values }));

  return ok(c, {
    generatedAt: now.toISOString(),
    periodDays: query.periodDays,
    forecastMonths: query.forecastMonths,
    dashboard: {
      totalLeads: leadRows.length,
      leadsInPeriod: recentLeads.length,
      openDeals: dealRows.filter((deal) => deal.status === "open").length,
      customersWithDeals: new Set(dealRows.map((deal) => deal.customerId).filter((customerId) => customerId)).size,
      overdueTasks: overdueTasks.length,
      dueTodayTasks: dueTodayTasks.length,
      activeCampaigns: campaignRows.filter((campaign) => campaign.status === "active").length,
      activePartners: partnerRows.filter((partner) => partner.status === "active").length,
      forecastValue,
      wonValue,
    },
    generalReport: {
      totals: {
        leads: leadRows.length,
        leadsInPeriod: recentLeads.length,
        customers: customerRows.length,
        customersInPeriod: recentCustomers.length,
        deals: dealRows.length,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        hotLeads: hotLeads.length,
        overdueTasks: overdueTasks.length,
      },
      sourceMix: toCountItems(leadSourceCounts),
      statusMix: toCountItems(leadStatusCounts),
    },
    funnelAnalytics: {
      stages: [
        { key: "leads", label: "Leads", count: leadRows.length, rateFromPrevious: 100, rateFromLead: 100 },
        {
          key: "qualified",
          label: "Qualified",
          count: qualifiedLeads.length,
          rateFromPrevious: getRate(qualifiedLeads.length, leadRows.length),
          rateFromLead: getRate(qualifiedLeads.length, leadRows.length),
        },
        {
          key: "customers",
          label: "Customers",
          count: customerRows.length,
          rateFromPrevious: getRate(customerRows.length, qualifiedLeads.length),
          rateFromLead: getRate(customerRows.length, leadRows.length),
        },
        {
          key: "deals",
          label: "Deals",
          count: leadIdsWithDeal.size,
          rateFromPrevious: getRate(leadIdsWithDeal.size, customerRows.length),
          rateFromLead: getRate(leadIdsWithDeal.size, leadRows.length),
        },
        {
          key: "won",
          label: "Won",
          count: wonDeals.length,
          rateFromPrevious: getRate(wonDeals.length, dealRows.length),
          rateFromLead: getRate(wonDeals.length, leadRows.length),
        },
      ],
      bySource: toCountItems(leadSourceCounts).map((source) => {
        const sourceLeads = leadRows.filter((lead) => (lead.source ?? "unknown") === source.key);
        const sourceLeadIds = new Set(sourceLeads.map((lead) => lead.id));
        const sourceDeals = dealRows.filter((deal) => deal.leadId && sourceLeadIds.has(deal.leadId));
        const sourceCustomers = sourceLeads.filter((lead) => convertedLeadIds.has(lead.id)).length;
        const sourceWins = sourceDeals.filter((deal) => deal.status === "won").length;
        return {
          key: source.key,
          leads: sourceLeads.length,
          customers: sourceCustomers,
          deals: sourceDeals.length,
          wonDeals: sourceWins,
          conversionRate: getRate(sourceCustomers, sourceLeads.length),
          winRate: getRate(sourceWins, sourceDeals.length),
        };
      }),
    },
    ownerAnalytics: Array.from(ownerStats.values())
      .map((owner) => {
        const profile = owner.userId ? ownerProfileMap.get(owner.userId) : null;
        return {
          userId: owner.userId,
          name: profile?.fullName || profile?.email || "Unassigned",
          leads: owner.leads,
          hotLeads: owner.hotLeads,
          customers: owner.customers,
          openDeals: owner.openDeals,
          wonDeals: owner.wonDeals,
          lostDeals: owner.lostDeals,
          openValue: owner.openValue,
          wonRevenue: owner.wonRevenue,
          overdueTasks: owner.overdueTasks,
          leadToCustomerRate: getRate(owner.customers, owner.leads),
          winRate: getRate(owner.wonDeals, owner.wonDeals + owner.lostDeals),
        };
      })
      .sort((left, right) => right.wonRevenue - left.wonRevenue || right.hotLeads - left.hotLeads || right.leads - left.leads),
    conversionAnalytics: {
      rates: {
        leadToCustomer: getRate(customerRows.length, leadRows.length),
        leadToDeal: getRate(leadIdsWithDeal.size, leadRows.length),
        dealWin: getRate(wonDeals.length, dealRows.length),
        dealLoss: getRate(lostDeals.length, dealRows.length),
        hotLeadShare: getRate(hotLeads.length, leadRows.length),
        periodLeadToCustomer: getRate(recentCustomers.length, recentLeads.length),
      },
      counts: {
        leads: leadRows.length,
        convertedLeads: convertedLeadIds.size,
        dealsFromLeads: leadIdsWithDeal.size,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
      },
    },
    leadReport: {
      total: recentLeads.length,
      byStatus: toCountItems(leadStatusCounts),
      bySource: toCountItems(leadSourceCounts),
    },
    dealReport: {
      total: recentDeals.length,
      byStatus: toCountItems(dealStatusCounts),
      byPipeline: toCountItems(pipelineCounts),
      openValue,
      wonValue,
      lostValue,
      averageDealValue,
      forecastValue,
    },
    revenueForecast: {
      totalValue: forecastValue,
      months: forecastItems,
    },
    emailAnalytics: {
      totals: {
        sentCount: analyticsTotals.sent,
        deliveredCount: analyticsTotals.delivered,
        openedCount: analyticsTotals.opened,
        clickedCount: analyticsTotals.clicked,
        repliedCount: analyticsTotals.replied,
        bouncedCount: analyticsTotals.bounced,
      },
      rates: {
        openRate: getRate(analyticsTotals.opened, analyticsTotals.delivered),
        clickRate: getRate(analyticsTotals.clicked, analyticsTotals.opened),
        replyRate: getRate(analyticsTotals.replied, analyticsTotals.delivered),
        bounceRate: getRate(analyticsTotals.bounced, analyticsTotals.sent),
      },
      engagementScore: analyticsTotals.engagement,
      trend,
      ranking: campaignRows
        .slice()
        .sort((left, right) => right.engagementScore - left.engagementScore || right.openedCount - left.openedCount)
        .slice(0, 10)
        .map((campaign) => ({
          campaignId: campaign.id,
          name: campaign.name,
          engagementScore: campaign.engagementScore,
          openRate: getRate(campaign.openedCount, campaign.deliveredCount),
          clickRate: getRate(campaign.clickedCount, campaign.openedCount),
          replyRate: getRate(campaign.replyCount, campaign.deliveredCount),
          bounceRate: getRate(campaign.bounceCount, campaign.sentCount),
        })),
    },
    partnerPerformance: partnerRows
      .map((partner) => {
        const leadCount = partnerLeadCounts.get(partner.id) ?? 0;
        const openDealCount = partnerDealOpenCounts.get(partner.id) ?? 0;
        const wonDealCount = partnerDealWonCounts.get(partner.id) ?? 0;
        const wonRevenue = partnerWonValues.get(partner.id) ?? 0;

        return {
          partnerId: partner.id,
          name: partner.name,
          status: partner.status,
          leadCount,
          openDealCount,
          wonDealCount,
          wonRevenue,
        };
      })
      .sort((left, right) => right.wonRevenue - left.wonRevenue || right.leadCount - left.leadCount)
      .slice(0, 10),
    campaignPerformance: campaignRows.slice(0, 10).map((campaign) => {
      const audienceCount = audienceByCampaign.get(campaign.id) ?? 0;
      return {
        campaignId: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        status: campaign.status,
        audienceCount,
        sentCount: campaign.sentCount,
        deliveredCount: campaign.deliveredCount,
        openedCount: campaign.openedCount,
        clickedCount: campaign.clickedCount,
        replyCount: campaign.replyCount,
        bounceCount: campaign.bounceCount,
        engagementScore: campaign.engagementScore,
        deliveryRate: getRate(campaign.deliveredCount, campaign.sentCount),
        openRate: getRate(campaign.openedCount, campaign.deliveredCount),
        clickRate: getRate(campaign.clickedCount, campaign.openedCount),
        replyRate: getRate(campaign.replyCount, campaign.deliveredCount),
        bounceRate: getRate(campaign.bounceCount, campaign.sentCount),
        scheduledAt: campaign.scheduledAt,
        launchedAt: campaign.launchedAt,
        createdAt: campaign.createdAt,
      };
    }),
  });
}
