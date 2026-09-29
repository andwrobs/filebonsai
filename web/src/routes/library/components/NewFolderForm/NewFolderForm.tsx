import { NewFolderFormView } from "./NewFolderFormView";
import { useNewFolderForm } from "./useNewFolderForm";

export function NewFolderForm({
	onClose,
	parentId,
}: {
	onClose: () => void;
	parentId: string;
}) {
	const props = useNewFolderForm({ parentId, onCreated: onClose });
	return <NewFolderFormView {...props} onCancel={onClose} />;
}
