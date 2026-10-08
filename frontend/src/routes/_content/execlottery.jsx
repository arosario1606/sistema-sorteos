import { createFileRoute } from "@tanstack/react-router";
import ExecLottery from "../../components/main/content/lottery/execlottery";

export const Route = createFileRoute("/_content/execlottery")({
  component: ExecLottery,
});
