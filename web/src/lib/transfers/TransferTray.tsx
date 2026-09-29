import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { catalogKeys } from "~/lib/catalog/catalog.query";
import { storageKeys } from "~/lib/storage/storage.query";
import { Button } from "~/lib/ui/button";
import { useTransfers } from "./transfer-store";
import { needsAttention, settled } from "./transfers";

export function TransferTray() {
	const items = useTransfers((state) => state.items);
	const run = useTransfers((state) => state.run);
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
		const shell = node?.closest<HTMLElement>("[data-app-shell]");
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
	return (
		<section
			ref={tray}
			className="sticky bottom-0 z-10 mt-auto border-t bg-card shadow-raised max-md:bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))]"
			data-expanded={expanded}
			aria-labelledby="transfers-heading"
		>
			<header className="flex min-h-tray-header items-center gap-3 px-gutter">
				<h2 className="text-md font-semibold" id="transfers-heading">
					Transfers
				</h2>
				<p className="flex-1 text-sm text-muted-foreground" role="status">
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
				<Button
					aria-controls={bodyId}
					aria-expanded={expanded}
					// A disclosure, not a popup: the chevron shows its state, so it skips
					// the open-trigger fill and only fills on hover.
					className="aria-expanded:not-hover:bg-transparent aria-expanded:not-hover:text-muted-foreground"
					onPress={() => setExpanded((value) => !value)}
					size="icon"
					variant="ghost"
				>
					{expanded ? (
						<ChevronDown aria-hidden="true" />
					) : (
						<ChevronUp aria-hidden="true" />
					)}
					<span className="sr-only">
						{expanded ? "Hide transfers" : "Show transfers"}
					</span>
				</Button>
			</header>
			<div
				className="max-h-[min(40vh,24rem)] overflow-y-auto px-gutter pb-3"
				hidden={!expanded}
				id={bodyId}
			>
				<p className="mb-2 text-sm text-muted-foreground">
					Uploads continue while you browse folders. Keep this tab open. Retry
					sends the whole file from byte zero.
				</p>
				<ul>
					{items.map((item) => (
						<li
							className="grid gap-1 border-t py-3 text-md wrap-anywhere"
							key={item.key}
						>
							<strong>{item.file.name}</strong>
							<p className="text-sm text-muted-foreground" role="status">
								{item.message}
							</p>
							{item.busy ? (
								<progress
									aria-label={`Upload ${item.file.name}`}
									className="h-1.5 w-full max-w-96 accent-primary"
								/>
							) : null}
							{!settled(item) ? (
								<div className="mt-1 flex flex-wrap gap-2">
									<Button
										isDisabled={item.busy}
										onPress={() => void run(item.key, "check")}
										variant="outline"
									>
										Check status
									</Button>
									{!item.busy &&
									(!item.upload ||
										["INITIATED", "STAGED"].includes(item.upload.state)) ? (
										<Button
											onPress={() => void run(item.key, "continue")}
											variant="outline"
										>
											{item.upload?.state === "STAGED"
												? "Finish upload"
												: "Retry from byte zero"}
										</Button>
									) : null}
									{(!item.busy && !item.upload) ||
									(item.upload &&
										["INITIATED", "RECEIVING", "STAGED"].includes(
											item.upload.state,
										)) ? (
										<Button
											onPress={() => void run(item.key, "cancel")}
											variant="outline"
										>
											Cancel upload
										</Button>
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
