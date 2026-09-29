import { Link } from "react-router";
import { formatBytes } from "~/lib/format/bytes";
import type { StorageSummary } from "~/lib/storage/storage";
import { capabilityRows, providerLabel } from "../../storage";
import type { useStorageDetails } from "./useStorageDetails";

export function StorageDetailsView({
	retry,
	state,
}: ReturnType<typeof useStorageDetails>) {
	return (
		<div className="page" aria-busy={state.status === "loading"}>
			{state.status === "failed" ? (
				<div className="page-message" role="alert">
					<p className="eyebrow">
						{state.failure.kind === "unavailable" ? "Unavailable" : "Error"}
					</p>
					<h1>
						{state.failure.kind === "unavailable"
							? "Storage details are unavailable"
							: "Could not load storage details"}
					</h1>
					<p>{state.failure.message}</p>
					{state.failure.requestId ? (
						<p className="storage-note">
							Request ID: {state.failure.requestId}
						</p>
					) : null}
					<div className="page-message-actions">
						<button className="button primary" onClick={retry} type="button">
							Try again
						</button>
						<Link className="button secondary" to="/">
							Return to Library
						</Link>
					</div>
				</div>
			) : (
				<>
					{/* One heading from loading to ready, so focus on it survives the load. */}
					<header className="page-toolbar">
						<div className="page-heading">
							<h1>
								Storage
								{state.status === "ready" ? (
									<>
										{" "}
										<span className="badge">Read-only</span>
									</>
								) : null}
							</h1>
							{state.status === "ready" ? (
								<p className="page-subtitle">
									The server operator configures storage; this page cannot
									change it.
								</p>
							) : (
								<p className="page-subtitle" role="status">
									Loading storage details…
								</p>
							)}
						</div>
					</header>
					{state.status === "ready" ? (
						<Summary
							maximumBytes={state.maximumBytes}
							summary={state.summary}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

function Summary({
	summary,
	maximumBytes,
}: {
	summary: StorageSummary;
	maximumBytes: bigint | null;
}) {
	return (
		<>
			<div className="storage-grid">
				<section className="storage-card" aria-labelledby="connection-heading">
					<h2 id="connection-heading">Connection</h2>
					<p className="storage-figure storage-name">
						{summary.connection.displayName}
					</p>
					<p className="storage-detail">
						{providerLabel(summary.connection.providerKind)}
					</p>
					<p className="storage-note">
						Credentials, bucket names, and server paths stay on the server.
					</p>
				</section>

				<section className="storage-card" aria-labelledby="usage-heading">
					<h2 id="usage-heading">Stored</h2>
					<p className="storage-figure">{formatBytes(summary.usedBytes)}</p>
					<p className="storage-detail">In files whose upload finished</p>
					<p className="storage-note">
						Uploads still in progress are not counted.
					</p>
				</section>

				<section className="storage-card" aria-labelledby="limits-heading">
					<h2 id="limits-heading">Upload limit</h2>
					<p className="storage-figure">
						{maximumBytes === null
							? "Unavailable"
							: formatBytes(maximumBytes.toString())}
					</p>
					<p className="storage-detail">Largest file per upload</p>
					<p className="storage-note">
						{maximumBytes === null
							? "The limit could not be read right now. The server still enforces it when you upload."
							: "Larger files are refused before anything is sent."}
					</p>
				</section>
			</div>

			<section
				className="storage-capabilities"
				aria-labelledby="capabilities-heading"
			>
				<h2 className="section-title" id="capabilities-heading">
					How this connection handles files
				</h2>
				<ul className="capability-list">
					{capabilityRows(summary).map((row) => (
						<li key={row.label}>
							<span
								className={`capability-state ${row.enabled ? "yes" : "no"}`}
							>
								{row.enabled ? "Yes" : "No"}
							</span>
							<div>
								<strong>{row.label}</strong>
								<p>{row.detail}</p>
							</div>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
