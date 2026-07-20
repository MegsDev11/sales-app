"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchCrmDataFromSupabase,
  insertActivity,
  patchLead,
  patchUser,
  subscribeToCrmChanges,
  upsertLead,
  upsertUser,
} from "@/lib/supabase/data";
import { leadFormToLead } from "@/lib/supabase/mappers";
import { migrateLead } from "@/lib/utils/migrate";
import type {
  Activity,
  ActivityType,
  CrmData,
  Lead,
  LeadFormData,
  LeadStage,
  LostReason,
  User,
  UserFormData,
} from "@/lib/types";

const EMPTY_DATA: CrmData = { users: [], leads: [], activities: [] };

interface CrmStoreContextValue {
  users: User[];
  leads: Lead[];
  activities: Activity[];
  isLoaded: boolean;
  dbError: string | null;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  addLead: (data: LeadFormData) => string;
  deleteLead: (id: string) => void;
  restoreLead: (id: string) => void;
  moveLead: (id: string, stage: LeadStage, lostReason?: LostReason) => void;
  addActivity: (leadId: string, type: ActivityType, title: string) => void;
  reassignLead: (leadId: string, assignedToId: string | null) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  addUser: (data: UserFormData) => string;
  exportToCsv: () => void;
  importFromCsv: (csv: string) => void;
  getUserById: (id: string) => User | undefined;
  getLeadActivities: (leadId: string) => Activity[];
  getVisibleLeads: () => Lead[];
}

const CrmStoreContext = createContext<CrmStoreContextValue | null>(null);

function normalizeData(data: CrmData): CrmData {
  return {
    users: data.users.map((u) => ({
      ...u,
      monthlyRevenueTarget: u.monthlyRevenueTarget ?? 100000,
      monthlyDealsTarget: u.monthlyDealsTarget ?? 5,
    })),
    leads: data.leads.map((l) => migrateLead(l)),
    activities: data.activities,
  };
}

export function CrmStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CrmData>(EMPTY_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshFromSupabase = useCallback(async () => {
    try {
      const next = await fetchCrmDataFromSupabase();
      setData(normalizeData(next));
      setDbError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load from Supabase";
      setDbError(message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const next = await fetchCrmDataFromSupabase();
        if (!cancelled) {
          setData(normalizeData(next));
          setDbError(null);
          setIsLoaded(true);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to connect to Supabase";
        if (!cancelled) {
          setDbError(message);
          setData(EMPTY_DATA);
          setIsLoaded(true);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshFromSupabase();
      }, 300);
    };

    return subscribeToCrmChanges(scheduleRefresh);
  }, [isLoaded, refreshFromSupabase]);

  const updateLead = useCallback(
    (id: string, updates: Partial<Lead>) => {
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((lead) =>
          lead.id === id ? { ...lead, ...updates } : lead
        ),
      }));

      void patchLead(id, updates).catch((error) => {
        setDbError(error instanceof Error ? error.message : "Update failed");
        void refreshFromSupabase();
      });
    },
    [refreshFromSupabase]
  );

  const addLead = useCallback(
    (formData: LeadFormData): string => {
      const now = new Date().toISOString();
      const id = `lead-${Date.now()}`;
      const newLead = migrateLead(leadFormToLead(id, formData, now));
      const newActivity: Activity = {
        id: `act-${Date.now()}`,
        leadId: id,
        type: "task",
        title: "Lead created",
        createdAt: now,
      };

      setData((prev) => ({
        ...prev,
        leads: [newLead, ...prev.leads],
        activities: [newActivity, ...prev.activities],
      }));

      void (async () => {
        try {
          await upsertLead(newLead);
          await insertActivity(newActivity);
        } catch (error) {
          setDbError(error instanceof Error ? error.message : "Add lead failed");
          await refreshFromSupabase();
        }
      })();

      return id;
    },
    [refreshFromSupabase]
  );

  const deleteLead = useCallback(
    (id: string) => {
      updateLead(id, { deleted: true });
    },
    [updateLead]
  );

  const restoreLead = useCallback(
    (id: string) => {
      updateLead(id, { deleted: false });
    },
    [updateLead]
  );

  const moveLead = useCallback(
    (id: string, stage: LeadStage, lostReason?: LostReason) => {
      const now = new Date().toISOString();
      const stageLabel = stage.replace(/_/g, " ");
      const newActivity: Activity = {
        id: `act-${Date.now()}`,
        leadId: id,
        type: "task",
        title: `Moved to ${stageLabel}`,
        createdAt: now,
      };

      setData((prev) => {
        const lead = prev.leads.find((l) => l.id === id);
        if (!lead) return prev;

        const isClosed = stage === "closed_won" || stage === "closed_lost";
        const updatedLead: Lead = {
          ...lead,
          stage,
          stageEnteredAt: now,
          closedAt: isClosed ? now : lead.closedAt,
          lostReason:
            stage === "closed_lost" ? lostReason ?? lead.lostReason : lead.lostReason,
          installationStatus:
            stage === "closed_won" && !lead.installationStatus
              ? "scheduled"
              : lead.installationStatus,
          stageHistory: [...lead.stageHistory, { stage, enteredAt: now }],
        };

        void (async () => {
          try {
            await patchLead(id, {
              stage: updatedLead.stage,
              stageEnteredAt: updatedLead.stageEnteredAt,
              closedAt: updatedLead.closedAt,
              lostReason: updatedLead.lostReason,
              installationStatus: updatedLead.installationStatus,
              stageHistory: updatedLead.stageHistory,
            });
            await insertActivity(newActivity);
          } catch (error) {
            setDbError(error instanceof Error ? error.message : "Move failed");
            await refreshFromSupabase();
          }
        })();

        return {
          ...prev,
          leads: prev.leads.map((l) => (l.id === id ? updatedLead : l)),
          activities: [newActivity, ...prev.activities],
        };
      });
    },
    [refreshFromSupabase]
  );

  const addActivity = useCallback(
    (leadId: string, type: ActivityType, title: string) => {
      const now = new Date().toISOString();
      const newActivity: Activity = {
        id: `act-${Date.now()}`,
        leadId,
        type,
        title,
        createdAt: now,
      };

      setData((prev) => ({
        ...prev,
        activities: [newActivity, ...prev.activities],
        leads: prev.leads.map((lead) =>
          lead.id === leadId ? { ...lead, currentActivity: type } : lead
        ),
      }));

      void (async () => {
        try {
          await insertActivity(newActivity);
          await patchLead(leadId, { currentActivity: type });
        } catch (error) {
          setDbError(error instanceof Error ? error.message : "Activity failed");
          await refreshFromSupabase();
        }
      })();
    },
    [refreshFromSupabase]
  );

  const reassignLead = useCallback(
    (leadId: string, assignedToId: string | null) => {
      const now = new Date().toISOString();

      setData((prev) => {
        const user = assignedToId
          ? prev.users.find((u) => u.id === assignedToId)
          : null;
        const activityTitle = assignedToId
          ? `Reassigned to ${user?.name ?? "team member"}`
          : "Unassigned";

        const newActivity: Activity = {
          id: `act-${Date.now()}`,
          leadId,
          type: "task",
          title: activityTitle,
          createdAt: now,
        };

        void (async () => {
          try {
            await patchLead(leadId, { assignedToId });
            await insertActivity(newActivity);
          } catch (error) {
            setDbError(error instanceof Error ? error.message : "Reassign failed");
            await refreshFromSupabase();
          }
        })();

        return {
          ...prev,
          leads: prev.leads.map((lead) =>
            lead.id === leadId ? { ...lead, assignedToId } : lead
          ),
          activities: [newActivity, ...prev.activities],
        };
      });
    },
    [refreshFromSupabase]
  );

  const updateUser = useCallback(
    (id: string, updates: Partial<User>) => {
      setData((prev) => ({
        ...prev,
        users: prev.users.map((user) =>
          user.id === id ? { ...user, ...updates } : user
        ),
      }));

      void patchUser(id, updates).catch((error) => {
        setDbError(error instanceof Error ? error.message : "User update failed");
        void refreshFromSupabase();
      });
    },
    [refreshFromSupabase]
  );

  const addUser = useCallback(
    (formData: UserFormData): string => {
      const id = `rep-${Date.now()}`;
      const newUser: User = { id, ...formData };

      setData((prev) => ({
        ...prev,
        users: [...prev.users, newUser],
      }));

      void upsertUser(newUser).catch((error) => {
        setDbError(error instanceof Error ? error.message : "Add user failed");
        void refreshFromSupabase();
      });

      return id;
    },
    [refreshFromSupabase]
  );

  const getVisibleLeads = useCallback(
    () => data.leads.filter((l) => !l.deleted),
    [data.leads]
  );

  const exportToCsv = useCallback(() => {
    const headers = [
      "id", "clientName", "company", "phone", "email", "serviceType",
      "packageTier", "assignedToId", "stage", "priority", "dealValue",
      "leadSource", "address", "serviceZone", "coverageStatus", "nextFollowUpAt",
    ];
    const rows = getVisibleLeads().map((l) =>
      headers.map((h) => {
        const val = l[h as keyof Lead];
        return typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : (val ?? "");
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `megs-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getVisibleLeads]);

  const importFromCsv = useCallback(
    (csv: string) => {
      const lines = csv.trim().split("\n");
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
      const now = new Date().toISOString();
      const newLeads: Lead[] = lines.slice(1).map((line, i) => {
        const values = line.match(/(".*?"|[^,]+)/g)?.map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
        return migrateLead({
          id: row.id || `import-${Date.now()}-${i}`,
          clientName: row.clientName || "Imported Lead",
          phone: row.phone || "",
          email: row.email || "",
          company: row.company,
          serviceType: (row.serviceType as Lead["serviceType"]) || "fiber",
          packageTier: row.packageTier || "",
          assignedToId: row.assignedToId || null,
          stage: (row.stage as LeadStage) || "new_lead",
          priority: (row.priority as Lead["priority"]) || "medium",
          dealValue: row.dealValue ? Number(row.dealValue) : undefined,
          leadSource: (row.leadSource as Lead["leadSource"]) || "website",
          address: row.address,
          serviceZone: row.serviceZone || "Pretoria North",
          coverageStatus: (row.coverageStatus as Lead["coverageStatus"]) || "pending_survey",
          createdAt: now,
          stageEnteredAt: now,
          currentActivity: "call",
          temperature: "warm",
        });
      });

      setData((prev) => ({
        ...prev,
        leads: [...newLeads, ...prev.leads],
      }));

      void (async () => {
        try {
          for (const lead of newLeads) {
            await upsertLead(lead);
          }
        } catch (error) {
          setDbError(error instanceof Error ? error.message : "Import failed");
          await refreshFromSupabase();
        }
      })();
    },
    [refreshFromSupabase]
  );

  const getUserById = useCallback(
    (id: string) => data.users.find((u) => u.id === id),
    [data.users]
  );

  const getLeadActivities = useCallback(
    (leadId: string) =>
      data.activities
        .filter((a) => a.leadId === leadId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data.activities]
  );

  const value = useMemo(
    () => ({
      users: data.users,
      leads: data.leads,
      activities: data.activities,
      isLoaded,
      dbError,
      updateLead,
      addLead,
      deleteLead,
      restoreLead,
      moveLead,
      addActivity,
      reassignLead,
      updateUser,
      addUser,
      exportToCsv,
      importFromCsv,
      getUserById,
      getLeadActivities,
      getVisibleLeads,
    }),
    [
      data, isLoaded, dbError, updateLead, addLead, deleteLead, restoreLead,
      moveLead, addActivity, reassignLead, updateUser, addUser, exportToCsv,
      importFromCsv, getUserById, getLeadActivities, getVisibleLeads,
    ]
  );

  return (
    <CrmStoreContext.Provider value={value}>
      {children}
    </CrmStoreContext.Provider>
  );
}

export function useCrmStore() {
  const context = useContext(CrmStoreContext);
  if (!context) throw new Error("useCrmStore must be used within CrmStoreProvider");
  return context;
}
