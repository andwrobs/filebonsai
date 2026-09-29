import { pageTitle } from "~/lib/meta/title";
import type { Route } from "./+types/storage.route";
import { StorageDetails } from "./components/StorageDetails";

export const meta: Route.MetaFunction = () => [
	{ title: pageTitle("Storage") },
	{ name: "description", content: "Your configured Filebonsai storage." },
];

export default function StorageRoute() {
	return <StorageDetails />;
}
