# iOS

On hold by your choice. When it resumes: native browsing, background transfers, the share sheet, and Tidy with haptics.

The unresolved decision on native authentication for background transfers can be worked on without starting the app.

See [the backlog index](README.md) for how to pick up and retire items.

## IOS-01 Decision: native auth and background transfers

`P2` · `M` · Decision · iOS, Backend

Depends on: none

Context: PR #1 (merged 2026-09-23) added optional Authentik OIDC sign-in. Native auth must fit whichever access model is accepted.

**Why.** status.md lists this as unresolved. It can be decided without starting the app.

**Outcome.** Covers cookie session vs bearer token for URLSession background uploads, Keychain storage, CSRF for native clients, and revocation and expiry during long transfers.

**Acceptance**

- Compatible with the existing session model or states the change

**Read:** `docs/api/conventions.md`  
**Checks:** `decision-review`

## IOS-02 iOS Catalog slice

`P3` · `L` · Build · iOS

Depends on: [IOS-01](#ios-01-decision-native-auth-and-background-transfers)

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** The deferred second client from decision 0005.

**Outcome.** SwiftUI and TCA browsing of the root and folders, folder creation and every state, through the generated Swift transport and a handwritten adapter.

**Acceptance**

- Generated code untouched
- All Catalog states rendered in the simulator

**Checks:** xcodebuild test; simulator inspection

## IOS-03 Background uploads

`P3` · `L` · Build · iOS

Depends on: [IOS-02](#ios-02-ios-catalog-slice)

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** Transfer ownership is independent of any screen (AGENTS.md).

**Outcome.** A background URLSession owned by a durable transfer dependency, with whole-body retry and reconciliation after relaunch.

**Acceptance**

- Survives app termination
- Reconciles uncertain completion

**Checks:** xcodebuild test; simulator inspection

## IOS-04 Share extension

`P3` · `M` · Build · iOS

Depends on: [IOS-03](#ios-03-background-uploads)

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** Saving something to Filebonsai from anywhere.

**Outcome.** 'Save to Filebonsai' from Photos and Files: choose a folder and hand off to the background transfer dependency.

**Acceptance**

- The extension never owns the transfer

**Checks:** Simulator inspection

## IOS-05 Photos import with duplicate skip

`P3` · `M` · Build · iOS · Fun

Depends on: [IOS-03](#ios-03-background-uploads), [ORG-10](organize.md#org-10-duplicate-finder)

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** Getting a camera roll into Filebonsai.

**Outcome.** Import selected albums, skipping duplicates by SHA-256 and keeping capture-date metadata.

**Acceptance**

- Re-import creates nothing new

**Checks:** Simulator inspection

## IOS-06 Native Tidy with haptics

`P3` · `M` · Build · iOS · Fun

Depends on: [IOS-02](#ios-02-ios-catalog-slice), [TDY-05](tidy-mode.md#tdy-05-tidy-decision-batches)

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** Tidy is natural on a phone.

**Outcome.** The Tidy deck in SwiftUI with haptics, using the same decks and batches as the web client.

**Acceptance**

- VoiceOver actions for every gesture

**Checks:** Simulator inspection

## IOS-07 Spike: Files app integration

`P3` · `M` · Spike · iOS

Depends on: none

Blocked on: iOS is deferred by your preference. Unblock by saying iOS is back on.

**Why.** A File Provider extension would put Filebonsai inside Files.

**Outcome.** Evaluate File Provider extension scope, sync semantics vs Filebonsai's immutable versions, and effort. Recommend.

**Acceptance**

- Recommendation with scope

**Checks:** `spike-notes`
