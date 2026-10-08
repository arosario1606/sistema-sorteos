import { createFileRoute } from "@tanstack/react-router";
import LotteryReg from "../../components/main/content/lottery/lotteryreg";

export const Route = createFileRoute("/_content/lotteryreg")({
  component: LotteryReg,
});
