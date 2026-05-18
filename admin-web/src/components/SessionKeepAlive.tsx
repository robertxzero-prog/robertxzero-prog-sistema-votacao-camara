"use client";

import { useEffect } from "react";
import { startSessionKeepAlive } from "@/services/api";

export function SessionKeepAlive() {
  useEffect(() => {
    startSessionKeepAlive();
  }, []);

  return null;
}

