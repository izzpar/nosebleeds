"use client";
import { use } from "react";
import DailyRecap from "@/components/DailyRecap";

export default function NhlRecapPage({ params }) {
  const { date } = use(params);
  return <DailyRecap sport="nhl" date={date} />;
}
