import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { catalogKeys } from "~/lib/catalog/catalog.query";
import { storageKeys } from "~/lib/storage/storage.query";
import { transferStore, useTransfers } from "./transfer-store";
import { needsAttention, settled } from "./transfers";

export function TransferTray() {
	const items = useTransfers((state) => state.items);
	const queryClient = useQueryClient();
	const [expanded, setExpanded] = useState(true);
	const bodyId = useId();
	const available = items.filter(
		(item) => item.upload?.state === "AVAILABLE",
	).length;
	const active = items.filter((item) => !settled(item)).length;
	const attention = items.filter(needsAttention).length;
	// A finished upload changes its folder and the committed bytes.
	useEffect(() => {
		if (!available) return;
		void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
		void queryClient.invalidateQueries({ queryKey: storageKeys.summary() });
	}, [available, queryClient]);
	// Open when new work starts or needs a decision; fold away once every upload settled cleanly.
	const previous = useRef({ active: 0, attention: 0 });
	useEffect(() => {
		if (
			active > previous.current.active ||
			attention > previous.current.attention
		) {
			setExpanded(true);
		} else if (!active && !attention) {
			setExpanded(false);
		}
		previous.current = { active, attention };
	}, [active, attention]);
	// Publish the tray height so floating actions can sit above it instead of covering it.
	const tray = useRef<HTMLElement>(null);
	const shown = items.length > 0;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the tray mounts and unmounts with `shown`.
	useEffect(() => {
		const node = tray.current;
		const shell = node?.closest<HTMLElement>(".app-shell");
		if (!node || !shell) return;
		const observer = new ResizeObserver(() =>
			shell.style.setProperty("--tray-height", `${node.offsetHeight}px`),
		);
		observer.observe(node);
		return () => {
			observer.disconnect();
			shell.style.removeProperty("--tray-height");
		};
	}, [shown]);
	useEffect(() => {
		if (!active) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [active]);
	if (!shown) return null;
	const { run } = transferStore.getState();
	return (
		<section
			ref={tray}
			className="transfer-tray"
			data-expanded={expanded}
			aria-labelledby="transfers-heading"
		>
			<header className="transfer-tray-header">
				<h2 id="transfers-heading">Transfers</h2>
				<p className="transfer-summary" role="status">
					{[
						active ? `${active} in progress` : "",
						attention ? `${attention} need attention` : "",
						items.length - active - attention
							? `${items.length - active - attention} finished`
							: "",
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
				<button
					aria-controls={bodyId}
					aria-expanded={expanded}
					className="icon-button"
					onClick={() => setExpanded((value) => !value)}
					type="button"
				>
					{expanded ? (
						<ChevronDown aria-hidden="true" />
					) : (
						<ChevronUp aria-hidden="true" />
					)}
					<span className="visually-hidden">
						{expanded ? "Hide transfers" : "Show transfers"}
					</span>
				</button>
			</header>
			<div className="transfer-tray-body" hidden={!expanded} id={bodyId}>
				<p className="transfer-note">
					Uploads continue while you browse folders. Keep this tab open. Retry
					sends the whole file from byte zero.
				</p>
				<ul>
					{items.map((item) => (
						<li key={item.key}>
							<strong>{item.file.name}</strong>
							<p role="status">{item.message}</p>
							{item.busy ? (
								<progress aria-label={`Upload ${item.file.name}`} />
							) : null}
							{!settled(item) ? (
								<div className="transfer-actions">
									<button
										className="button secondary"
										disabled={item.busy}
										onClick={() => void run(item.key, "check")}
										type="button"
									>
										Check status
									</button>
									{!item.busy &&
									(!item.upload ||
										["INITIATED", "STAGED"].includes(item.upload.state)) ? (
										<button
											className="button secondary"
											onClick={() => void run(item.key, "continue")}
											type="button"
										>
											{item.upload?.state === "STAGED"
												? "Finish upload"
												: "Retry from byte zero"}
										</button>
									) : null}
									{(!item.busy && !item.upload) ||
									(item.upload &&
										["INITIATED", "RECEIVING", "STAGED"].includes(
											item.upload.state,
										)) ? (
										<button
											className="button secondary"
											onClick={() => void run(item.key, "cancel")}
											type="button"
										>
											Cancel upload
										</button>
									) : null}
								</div>
							) : null}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
