import { useState } from "react";
import { todayLocal } from "./dates";

const STORAGE_KEY = "cabinflow_date";

export function usePersistentDate(): [string, (d: string) => void] {
  const [date, setDateState] = useState<string>(() => {
    if (typeof window === "undefined") return todayLocal();
    return localStorage.getItem(STORAGE_KEY) ?? todayLocal();
  });

  const setDate = (d: string) => {
    setDateState(d);
    localStorage.setItem(STORAGE_KEY, d);
  };

  return [date, setDate];
}
