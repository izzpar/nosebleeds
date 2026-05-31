"use client";
import { use } from "react";
import DailyRecap from "@/components/DailyRecap";

export default function NbaRecapPage({ params }) {
  const { date } = use(params);
  return <DailyRecap sport="nba" date={date} />;
}
