import type {
  Activity,
  AppNotification,
  Lead,
  LeadFormData,
  StockBooking,
  StockItem,
  StockItemStatus,
  StockProduct,
  StockQrLabel,
  StockRequest,
  StockRequestLine,
  StockRequestStatus,
  Tower,
  TowerOutage,
  User,
  UserFormData,
} from "@/lib/types";
import type {
  ActivityRow,
  AppNotificationRow,
  LeadRow,
  StockBookingRow,
  StockItemRow,
  StockProductRow,
  StockQrLabelRow,
  StockRequestLineRow,
  StockRequestRow,
  TeamMemberRow,
  TowerOutageRow,
  TowerRow,
} from "@/lib/supabase/database.types";
import { normalizeRoleAndDepartment } from "@/lib/permissions";

export function userFromRow(row: TeamMemberRow): User {
  const { role, department } = normalizeRoleAndDepartment(row.role, row.department);
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    role,
    department,
    color: row.color,
    avatarInitials: row.avatar_initials,
    title: row.title,
    monthlyRevenueTarget: Number(row.monthly_revenue_target),
    monthlyDealsTarget: Number(row.monthly_deals_target),
    authUserId: row.auth_user_id ?? undefined,
    active: (row as TeamMemberRow & { active?: boolean }).active !== false,
  };
}

export function userToRow(user: User): TeamMemberRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email || null,
    auth_user_id: user.authUserId ?? null,
    role: user.role,
    department: user.department,
    color: user.color,
    avatar_initials: user.avatarInitials,
    title: user.title,
    monthly_revenue_target: user.monthlyRevenueTarget,
    monthly_deals_target: user.monthlyDealsTarget,
    active: user.active !== false,
  };
}

export function userFormToRow(id: string, data: UserFormData): TeamMemberRow {
  return userToRow({ id, ...data });
}

export function userUpdatesToRow(updates: Partial<User>): Partial<TeamMemberRow> {
  const row: Partial<TeamMemberRow> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.email !== undefined) row.email = updates.email || null;
  if (updates.authUserId !== undefined) row.auth_user_id = updates.authUserId ?? null;
  if (updates.role !== undefined) row.role = updates.role;
  if (updates.department !== undefined) row.department = updates.department;
  if (updates.color !== undefined) row.color = updates.color;
  if (updates.avatarInitials !== undefined) row.avatar_initials = updates.avatarInitials;
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.monthlyRevenueTarget !== undefined) {
    row.monthly_revenue_target = updates.monthlyRevenueTarget;
  }
  if (updates.monthlyDealsTarget !== undefined) {
    row.monthly_deals_target = updates.monthlyDealsTarget;
  }
  if (updates.active !== undefined) row.active = updates.active;
  return row;
}

export function leadFromRow(row: LeadRow): Lead {
  return {
    id: row.id,
    clientName: row.client_name,
    company: row.company ?? undefined,
    phone: row.phone,
    email: row.email,
    serviceType: row.service_type as Lead["serviceType"],
    packageTier: row.package_tier,
    assignedToId: row.assigned_to_id,
    stage: row.stage as Lead["stage"],
    currentActivity: row.current_activity as Lead["currentActivity"],
    priority: row.priority as Lead["priority"],
    createdAt: row.created_at,
    stageEnteredAt: row.stage_entered_at,
    closedAt: row.closed_at ?? undefined,
    dealValue: row.deal_value ?? undefined,
    discount: row.discount ?? undefined,
    leadSource: row.lead_source as Lead["leadSource"],
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    deleted: row.deleted,
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    nextAction: row.next_action ?? undefined,
    coverageStatus: row.coverage_status as Lead["coverageStatus"],
    serviceZone: row.service_zone,
    siteSurveyDate: row.site_survey_date ?? undefined,
    siteSurveyNotes: row.site_survey_notes ?? undefined,
    lostReason: (row.lost_reason as Lead["lostReason"]) ?? undefined,
    installationStatus:
      (row.installation_status as Lead["installationStatus"]) ?? undefined,
    installationDate: row.installation_date ?? undefined,
    temperature: row.temperature as Lead["temperature"],
    stageHistory: row.stage_history ?? [],
    inboxDismissedAt: row.inbox_dismissed_at ?? undefined,
    towerId: row.tower_id ?? null,
  };
}

export function leadToRow(lead: Lead): LeadRow {
  return {
    id: lead.id,
    client_name: lead.clientName,
    company: lead.company ?? null,
    phone: lead.phone,
    email: lead.email,
    service_type: lead.serviceType,
    package_tier: lead.packageTier,
    assigned_to_id: lead.assignedToId,
    stage: lead.stage,
    current_activity: lead.currentActivity,
    priority: lead.priority,
    created_at: lead.createdAt,
    stage_entered_at: lead.stageEnteredAt,
    closed_at: lead.closedAt ?? null,
    deal_value: lead.dealValue ?? null,
    discount: lead.discount ?? null,
    lead_source: lead.leadSource,
    address: lead.address ?? null,
    notes: lead.notes ?? null,
    deleted: lead.deleted ?? false,
    next_follow_up_at: lead.nextFollowUpAt ?? null,
    next_action: lead.nextAction ?? null,
    coverage_status: lead.coverageStatus,
    service_zone: lead.serviceZone,
    site_survey_date: lead.siteSurveyDate ?? null,
    site_survey_notes: lead.siteSurveyNotes ?? null,
    lost_reason: lead.lostReason ?? null,
    installation_status: lead.installationStatus ?? null,
    installation_date: lead.installationDate ?? null,
    temperature: lead.temperature,
    stage_history: lead.stageHistory,
    inbox_dismissed_at: lead.inboxDismissedAt ?? null,
    tower_id: lead.towerId ?? null,
  };
}

export function leadUpdatesToRow(updates: Partial<Lead>): Partial<LeadRow> {
  const row: Partial<LeadRow> = {};
  if (updates.clientName !== undefined) row.client_name = updates.clientName;
  if (updates.company !== undefined) row.company = updates.company ?? null;
  if (updates.phone !== undefined) row.phone = updates.phone;
  if (updates.email !== undefined) row.email = updates.email;
  if (updates.serviceType !== undefined) row.service_type = updates.serviceType;
  if (updates.packageTier !== undefined) row.package_tier = updates.packageTier;
  if (updates.assignedToId !== undefined) row.assigned_to_id = updates.assignedToId;
  if (updates.stage !== undefined) row.stage = updates.stage;
  if (updates.currentActivity !== undefined) row.current_activity = updates.currentActivity;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.createdAt !== undefined) row.created_at = updates.createdAt;
  if (updates.stageEnteredAt !== undefined) row.stage_entered_at = updates.stageEnteredAt;
  if (updates.closedAt !== undefined) row.closed_at = updates.closedAt ?? null;
  if (updates.dealValue !== undefined) row.deal_value = updates.dealValue ?? null;
  if (updates.discount !== undefined) row.discount = updates.discount ?? null;
  if (updates.leadSource !== undefined) row.lead_source = updates.leadSource;
  if (updates.address !== undefined) row.address = updates.address ?? null;
  if (updates.notes !== undefined) row.notes = updates.notes ?? null;
  if (updates.deleted !== undefined) row.deleted = updates.deleted;
  if (updates.nextFollowUpAt !== undefined) {
    row.next_follow_up_at = updates.nextFollowUpAt ?? null;
  }
  if (updates.nextAction !== undefined) row.next_action = updates.nextAction ?? null;
  if (updates.coverageStatus !== undefined) row.coverage_status = updates.coverageStatus;
  if (updates.serviceZone !== undefined) row.service_zone = updates.serviceZone;
  if (updates.siteSurveyDate !== undefined) {
    row.site_survey_date = updates.siteSurveyDate ?? null;
  }
  if (updates.siteSurveyNotes !== undefined) {
    row.site_survey_notes = updates.siteSurveyNotes ?? null;
  }
  if (updates.lostReason !== undefined) row.lost_reason = updates.lostReason ?? null;
  if (updates.installationStatus !== undefined) {
    row.installation_status = updates.installationStatus ?? null;
  }
  if (updates.installationDate !== undefined) {
    row.installation_date = updates.installationDate ?? null;
  }
  if (updates.temperature !== undefined) row.temperature = updates.temperature;
  if (updates.stageHistory !== undefined) row.stage_history = updates.stageHistory;
  if (updates.inboxDismissedAt !== undefined) {
    row.inbox_dismissed_at = updates.inboxDismissedAt ?? null;
  }
  if (updates.towerId !== undefined) {
    row.tower_id = updates.towerId ?? null;
  }
  return row;
}

export function leadFormToLead(id: string, formData: LeadFormData, now: string): Lead {
  const stage = formData.stage ?? "new_lead";
  return {
    ...formData,
    id,
    createdAt: now,
    stageEnteredAt: now,
    stageHistory: [{ stage, enteredAt: now }],
    deleted: false,
  };
}

export function activityFromRow(row: ActivityRow): Activity {
  return {
    id: row.id,
    leadId: row.lead_id,
    type: row.type as Activity["type"],
    title: row.title,
    createdAt: row.created_at,
  };
}

export function activityToRow(activity: Activity): ActivityRow {
  return {
    id: activity.id,
    lead_id: activity.leadId,
    type: activity.type,
    title: activity.title,
    created_at: activity.createdAt,
  };
}

export function towerFromRow(row: TowerRow): Tower {
  return {
    id: row.id,
    name: row.name,
    serviceAreas: row.service_areas ?? [],
    status: row.status as Tower["status"],
    updatedAt: row.updated_at,
    updatedById: row.updated_by_id,
  };
}

export function towerToRow(tower: Tower): TowerRow {
  return {
    id: tower.id,
    name: tower.name,
    service_areas: tower.serviceAreas,
    status: tower.status,
    updated_at: tower.updatedAt,
    updated_by_id: tower.updatedById ?? null,
  };
}

export function towerUpdatesToRow(updates: Partial<Tower>): Partial<TowerRow> {
  const row: Partial<TowerRow> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.serviceAreas !== undefined) row.service_areas = updates.serviceAreas;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.updatedAt !== undefined) row.updated_at = updates.updatedAt;
  if (updates.updatedById !== undefined) row.updated_by_id = updates.updatedById ?? null;
  return row;
}

export function towerOutageFromRow(row: TowerOutageRow): TowerOutage {
  return {
    id: row.id,
    towerId: row.tower_id,
    title: row.title,
    message: row.message,
    affectedAreas: row.affected_areas ?? [],
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    createdById: row.created_by_id,
    isPublic: row.is_public,
  };
}

export function towerOutageToRow(outage: TowerOutage): TowerOutageRow {
  return {
    id: outage.id,
    tower_id: outage.towerId,
    title: outage.title,
    message: outage.message,
    affected_areas: outage.affectedAreas,
    started_at: outage.startedAt,
    resolved_at: outage.resolvedAt ?? null,
    created_by_id: outage.createdById ?? null,
    is_public: outage.isPublic,
  };
}

export function towerOutageUpdatesToRow(updates: Partial<TowerOutage>): Partial<TowerOutageRow> {
  const row: Partial<TowerOutageRow> = {};
  if (updates.towerId !== undefined) row.tower_id = updates.towerId;
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.message !== undefined) row.message = updates.message;
  if (updates.affectedAreas !== undefined) row.affected_areas = updates.affectedAreas;
  if (updates.startedAt !== undefined) row.started_at = updates.startedAt;
  if (updates.resolvedAt !== undefined) row.resolved_at = updates.resolvedAt ?? null;
  if (updates.createdById !== undefined) row.created_by_id = updates.createdById ?? null;
  if (updates.isPublic !== undefined) row.is_public = updates.isPublic;
  return row;
}

export function stockProductFromRow(row: StockProductRow): StockProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    brandDefault: row.brand_default,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function stockProductToRow(product: StockProduct): StockProductRow {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    brand_default: product.brandDefault,
    notes: product.notes,
    created_at: product.createdAt,
  };
}

export function stockItemFromRow(row: StockItemRow): StockItem {
  return {
    id: row.id,
    productId: row.product_id,
    qrToken: row.qr_token,
    brand: row.brand,
    deviceName: row.device_name,
    serialNumber: row.serial_number,
    clientName: row.client_name ?? "",
    clientPppoe: row.client_pppoe ?? "",
    wifiName: row.wifi_name ?? "",
    wifiPassword: row.wifi_password ?? "",
    status: row.status as StockItemStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function stockItemToRow(item: StockItem): StockItemRow {
  return {
    id: item.id,
    product_id: item.productId,
    qr_token: item.qrToken,
    brand: item.brand,
    device_name: item.deviceName,
    serial_number: item.serialNumber,
    client_name: item.clientName,
    client_pppoe: item.clientPppoe,
    wifi_name: item.wifiName,
    wifi_password: item.wifiPassword,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function stockItemUpdatesToRow(updates: Partial<StockItem>): Partial<StockItemRow> {
  const row: Partial<StockItemRow> = {};
  if (updates.productId !== undefined) row.product_id = updates.productId;
  if (updates.qrToken !== undefined) row.qr_token = updates.qrToken;
  if (updates.brand !== undefined) row.brand = updates.brand;
  if (updates.deviceName !== undefined) row.device_name = updates.deviceName;
  if (updates.serialNumber !== undefined) row.serial_number = updates.serialNumber;
  if (updates.clientName !== undefined) row.client_name = updates.clientName;
  if (updates.clientPppoe !== undefined) row.client_pppoe = updates.clientPppoe;
  if (updates.wifiName !== undefined) row.wifi_name = updates.wifiName;
  if (updates.wifiPassword !== undefined) row.wifi_password = updates.wifiPassword;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.updatedAt !== undefined) row.updated_at = updates.updatedAt;
  return row;
}

export function stockQrLabelFromRow(row: StockQrLabelRow): StockQrLabel {
  return {
    id: row.id,
    batchId: row.batch_id,
    productId: row.product_id,
    qrToken: row.qr_token,
    brand: row.brand,
    deviceName: row.device_name,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    claimedItemId: row.claimed_item_id,
  };
}

export function stockQrLabelToRow(label: StockQrLabel): StockQrLabelRow {
  return {
    id: label.id,
    batch_id: label.batchId,
    product_id: label.productId,
    qr_token: label.qrToken,
    brand: label.brand,
    device_name: label.deviceName,
    created_at: label.createdAt,
    claimed_at: label.claimedAt ?? null,
    claimed_item_id: label.claimedItemId ?? null,
  };
}

export function stockBookingFromRow(row: StockBookingRow): StockBooking {
  return {
    id: row.id,
    itemId: row.item_id,
    technicianId: row.technician_id,
    leadId: row.lead_id,
    requestId: row.request_id,
    bookedOutAt: row.booked_out_at,
    bookedOutBy: row.booked_out_by,
    returnedAt: row.returned_at,
    notes: row.notes,
  };
}

export function stockBookingToRow(booking: StockBooking): StockBookingRow {
  return {
    id: booking.id,
    item_id: booking.itemId,
    technician_id: booking.technicianId,
    lead_id: booking.leadId ?? null,
    request_id: booking.requestId ?? null,
    booked_out_at: booking.bookedOutAt,
    booked_out_by: booking.bookedOutBy ?? null,
    returned_at: booking.returnedAt ?? null,
    notes: booking.notes,
  };
}

export function stockRequestLineFromRow(row: StockRequestLineRow): StockRequestLine {
  return {
    id: row.id,
    requestId: row.request_id,
    productId: row.product_id,
    qtyNeeded: row.qty_needed,
    qtyFulfilled: row.qty_fulfilled,
  };
}

export function stockRequestLineToRow(line: StockRequestLine): StockRequestLineRow {
  return {
    id: line.id,
    request_id: line.requestId,
    product_id: line.productId,
    qty_needed: line.qtyNeeded,
    qty_fulfilled: line.qtyFulfilled,
  };
}

export function stockRequestFromRow(
  row: StockRequestRow,
  lines: StockRequestLineRow[] = []
): StockRequest {
  return {
    id: row.id,
    title: row.title,
    technicianId: row.technician_id,
    leadId: row.lead_id,
    status: row.status as StockRequestStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    notes: row.notes,
    lines: lines.map(stockRequestLineFromRow),
  };
}

export function stockRequestToRow(request: Omit<StockRequest, "lines">): StockRequestRow {
  return {
    id: request.id,
    title: request.title,
    technician_id: request.technicianId,
    lead_id: request.leadId ?? null,
    status: request.status,
    created_by: request.createdBy ?? null,
    created_at: request.createdAt,
    notes: request.notes,
  };
}

export function appNotificationFromRow(row: AppNotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    department: (row.department as AppNotification["department"]) ?? null,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    requestId: row.request_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function appNotificationToRow(n: AppNotification): AppNotificationRow {
  return {
    id: n.id,
    user_id: n.userId ?? null,
    department: n.department ?? null,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    request_id: n.requestId ?? null,
    read_at: n.readAt ?? null,
    created_at: n.createdAt,
  };
}
