"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { OwnerSection } from "@/lib/permissions";
import { PLACEHOLDER_DEPARTMENTS } from "@/lib/permissions";

const STORAGE_KEY = "megs-owner-section";

const VALID_SECTIONS: OwnerSection[] = [
  "company",
  "sales",
  "stock",
  "coordination",
  "support",
  "wireless",
  ...PLACEHOLDER_DEPARTMENTS,
  "staff",
];

interface DepartmentContextValue {
  activeSection: OwnerSection;
  setActiveSection: (section: OwnerSection) => void;
}

const DepartmentContext = createContext<DepartmentContextValue | null>(null);

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSectionState] = useState<OwnerSection>("company");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as OwnerSection | null;
    if (stored && VALID_SECTIONS.includes(stored)) {
      setActiveSectionState(stored);
    }
  }, []);

  const setActiveSection = useCallback((section: OwnerSection) => {
    setActiveSectionState(section);
    localStorage.setItem(STORAGE_KEY, section);
  }, []);

  const value = useMemo(
    () => ({ activeSection, setActiveSection }),
    [activeSection, setActiveSection]
  );

  return (
    <DepartmentContext.Provider value={value}>{children}</DepartmentContext.Provider>
  );
}

export function useOwnerSection() {
  const context = useContext(DepartmentContext);
  if (!context) {
    throw new Error("useOwnerSection must be used within DepartmentProvider");
  }
  return context;
}
