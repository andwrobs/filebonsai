import { StorageDetailsView } from "./StorageDetailsView";
import { useStorageDetails } from "./useStorageDetails";

export function StorageDetails() {
	return <StorageDetailsView {...useStorageDetails()} />;
}
