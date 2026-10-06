import { createFileRoute } from "@tanstack/react-router";
import ListAssist from "../../components/main/content/lottery/listassist";

export const Route = createFileRoute("/_content/listassist")({
  component: ListAssist,
});
