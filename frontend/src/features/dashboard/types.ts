export interface DashboardInsightsResponse {
  generatedAt: string;
  periodDays: number;
  forecastMonths: number;
  overview: {
    totalLeads: number;
    newLeads: number;
    totalCustomers: number;
    newCustomers: number;
    openDeals: number;
    wonDeals: number;
    overdueTasks: number;
    dueTodayTasks: number;
    pendingFollowUps: number;
    scheduledMeetings: number;
    activeCampaigns: number;
    activePartners: number;
    documentCount: number;
    recentDocuments: number;
    recentMeetings: number;
    forecastValue: number;
    wonRevenue: number;
    averageDealValue: number;
  };
  conversion: {
    leadToCustomerRate: number;
    openDealWinRate: number;
    taskCompletionRate: number;
    campaignDeliveryRate: number;
    campaignEngagementRate: number;
    meetingCompletionRate: number;
  };
  pipeline: {
    byStage: Array<{
      key: string;
      count: number;
      value: number;
    }>;
    forecast: Array<{
      month: string;
      label: string;
      totalValue: number;
      dealCount: number;
    }>;
  };
  leadVelocity: {
    byWeek: Array<{
      weekStart: string;
      label: string;
      leads: number;
      customers: number;
    }>;
    bySource: Array<{
      key: string;
      count: number;
    }>;
  };
  taskHealth: {
    byStatus: Array<{
      key: string;
      count: number;
    }>;
    byPriority: Array<{
      key: string;
      count: number;
    }>;
    openCount: number;
    overdueCount: number;
    dueTodayCount: number;
  };
  campaignHealth: {
    totals: {
      sentCount: number;
      deliveredCount: number;
      openedCount: number;
      clickedCount: number;
      repliedCount: number;
      bouncedCount: number;
    };
    ranking: Array<{
      campaignId: string;
      name: string;
      channel: string;
      status: string;
      engagementScore: number;
      deliveryRate: number;
      openRate: number;
      clickRate: number;
    }>;
  };
  meetingOverview: {
    upcomingCount: number;
    completedCount: number;
    items: Array<{
      id: string;
      title: string;
      source: string;
      status: string;
      startsAt: string;
    }>;
  };
  topDeals: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    value: number;
    expectedCloseDate: string | null;
  }>;
  activityFeed: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    timestamp: string;
    tone: "good" | "neutral" | "risk";
    amount?: number;
  }>;
}

export interface ReportSummaryResponse {
  generatedAt: string;
  periodDays: number;
  forecastMonths: number;
  dashboard: {
    totalLeads: number;
    leadsInPeriod: number;
    openDeals: number;
    customersWithDeals: number;
    overdueTasks: number;
    dueTodayTasks: number;
    activeCampaigns: number;
    activePartners: number;
    forecastValue: number;
    wonValue: number;
  };
  leadReport: {
    total: number;
    byStatus: Array<{ key: string; count: number }>;
    bySource: Array<{ key: string; count: number }>;
  };
  dealReport: {
    total: number;
    byStatus: Array<{ key: string; count: number }>;
    byPipeline: Array<{ key: string; count: number }>;
    openValue: number;
    wonValue: number;
    lostValue: number;
    averageDealValue: number;
    forecastValue: number;
  };
  revenueForecast: {
    totalValue: number;
    months: Array<{
      month: string;
      label: string;
      totalValue: number;
      dealCount: number;
    }>;
  };
  emailAnalytics: {
    totals: {
      sentCount: number;
      deliveredCount: number;
      openedCount: number;
      clickedCount: number;
      repliedCount: number;
      bouncedCount: number;
    };
    rates: {
      openRate: number;
      clickRate: number;
      replyRate: number;
      bounceRate: number;
    };
    engagementScore: number;
    trend: Array<{
      day: string;
      opened: number;
      clicked: number;
      replied: number;
      bounced: number;
    }>;
    ranking: Array<{
      campaignId: string;
      name: string;
      engagementScore: number;
      openRate: number;
      clickRate: number;
      replyRate: number;
      bounceRate: number;
    }>;
  };
  partnerPerformance: Array<{
    partnerId: string;
    name: string;
    status: string;
    leadCount: number;
    openDealCount: number;
    wonDealCount: number;
    wonRevenue: number;
  }>;
  campaignPerformance: Array<{
    campaignId: string;
    name: string;
    channel: string;
    status: string;
    audienceCount: number;
    sentCount: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
    replyCount: number;
    bounceCount: number;
    engagementScore: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
    scheduledAt: string | null;
    launchedAt: string | null;
    createdAt: string;
  }>;
}

export interface PartnerDashboardResponse {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  partner: {
    partnerCompanyId: string;
    partnerCompanyName: string;
    partnerContactName: string | null;
    partnerEmail: string | null;
    partnerPhone: string | null;
    linkedAt: string;
    lastAccessAt: string | null;
    storeId: string | null;
    storeName: string | null;
  };
  summary: {
    assignedLeads: number;
    openDeals: number;
    wonDeals: number;
    wonRevenue: number;
    overdueTasks: number;
    dueTodayTasks: number;
    pendingFollowUps: number;
    completedFollowUps30d: number;
    activeCampaigns: number;
    availableTemplates: number;
  };
  recentLeads: Array<{
    id: string;
    title: string;
    fullName: string | null;
    email: string | null;
    status: string;
    assignedToUserId: string | null;
    createdAt: string;
  }>;
  openPipeline: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    value: number;
    expectedCloseDate: string | null;
    assignedToUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  recentWins: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    value: number;
    expectedCloseDate: string | null;
    assignedToUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  upcomingFollowUps: Array<{
    id: string;
    subject: string;
    channel: string;
    status: string;
    scheduledAt: string;
    leadId: string | null;
    dealId: string | null;
    createdAt: string;
  }>;
  assignedTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
  companyContacts: Array<{
    membershipId: string;
    userId: string;
    fullName: string | null;
    email: string | null;
    role: string;
    customRoleName: string | null;
    storeName: string | null;
  }>;
}
