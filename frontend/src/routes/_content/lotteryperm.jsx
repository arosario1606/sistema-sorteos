import { createFileRoute } from "@tanstack/react-router";
import LotteryPerm from "../../components/main/content/lottery/lotteryperm";

export const Route = createFileRoute("/_content/lotteryperm")({
  component: LotteryPerm,
});
