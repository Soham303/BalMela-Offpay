# PRD: FestToken
## Local-Hosted QR Token and Stall Settlement System

**Version:** 1.0  
**Date:** 29 October 2026  
**Status:** Initial product requirements  
**Target event:** School/college fest with 3,000–4,000 attendees and 20–30 stalls

---

## 1. Product Overview

### 1.1 Purpose

Build a web application that replaces paper tokens used at a school or college fest.

Currently, visitors pay cash at a central counter and receive paper tokens. They spend these tokens at participating stalls. At the end of the event, organizers manually count collected tokens and calculate the amount payable to each stall.

FestToken will digitize this process using QR-based token passes, a browser-based interface, a local backend, and automated collection reports.

The system will run on the organizer's laptop. Stall operators will use their own smartphones to access the application over the internet through a secure tunnel. The application database will remain on the organizer's laptop.

### 1.2 Primary objectives

1. Replace disposable paper tokens with digital token passes.
2. Record cash received and digital tokens issued at the counter.
3. Allow stalls to accept and redeem tokens by scanning QR codes.
4. Maintain a separate transaction ledger for every stall.
5. Automatically calculate each stall's net collections and payout.
6. Prevent a token from being redeemed more than once.
7. Provide a live organizer dashboard.
8. Export all financial records for reconciliation.
9. Minimize infrastructure costs by running the backend and database locally.

### 1.3 Success criteria

The application should:

- Support 20–30 registered stalls.
- Support approximately 3,000–4,000 attendees.
- Work in a mobile browser without requiring attendees to install an app.
- Record every token issuance and redemption with a unique transaction ID.
- Prevent duplicate redemption, including when a stall retries a timed-out request.
- Produce independently verifiable collection totals for every stall.
- Retain transaction history if the browser is refreshed or the laptop is restarted.
- Recover from a temporary network interruption without silently duplicating transactions.

These are design targets. Performance must be demonstrated through testing before the event.

---

## 2. Scope and Business Rules

### 2.1 Included in the first version

- Cash counter and digital token issuance.
- QR-based attendee token passes.
- Stall operator login.
- QR scanning and token redemption.
- Stall-specific collection ledgers.
- Administrator dashboard.
- End-of-event reconciliation and settlement.
- CSV exports and local database backups.
- Local hosting with tunnel-based external access.
- Error handling for connection loss and duplicate requests.

### 2.2 Excluded from the first version

- Online payment gateways.
- Attendee accounts, registration, or personal profiles.
- Transfers between attendees.
- Transfers of token balances between stalls.
- Automatic bank transfers or digital payouts.
- Inventory and item-wise sales management.
- AI features.
- Guaranteed offline transaction processing.

### 2.3 Token and collection model

The system will not use an attendee account or a transferable bank-like wallet.

Instead, a cashier will issue a **digital token pass** after receiving cash. The pass represents prepaid, redeemable token value. The backend tracks its outstanding value and records every redemption against a particular stall.

This is a pass-based token system, not a system for transferring money between users or stalls.

Each successful redemption belongs to exactly one stall. Stall collection reports must never be combined into a single undifferentiated stall balance.

The organizer must configure the cash-to-token conversion rate and permitted token amounts before issuing tokens. Changes to the conversion rate after issuance begins must be prohibited unless a new rate version and an explicit administrative adjustment procedure are introduced.

---

## 3. User Roles and Permissions

### 3.1 Administrator

Can:

- Create, edit, activate, and deactivate stalls.
- Create cashier and stall operator accounts.
- Configure token denominations and conversion rates before issuance begins.
- View all token issuance and redemption records.
- View collections and outstanding token liabilities.
- Approve authorized voids, refunds, or adjustments.
- Export reports and create backups.
- Close the event's financial records after reconciliation.

### 3.2 Cashier

Can:

- Log in to the counter interface.
- Record the amount of cash collected.
- Issue a new token pass.
- Display the pass QR code to the attendee.
- View the issuance receipt and transaction reference.
- Review their own issuance history.

Cashiers cannot change collection rates after issuance starts, alter stall totals, or delete transactions.

### 3.3 Stall operator

Can:

- Log in to the assigned stall.
- Scan an attendee's token pass.
- Enter the purchase amount in festival token units.
- Submit a redemption.
- See the confirmed result and transaction reference.
- View the assigned stall's collection total and transaction history.
- Export their own stall report if permitted by the administrator.

A stall operator must not access another stall's collections, issue tokens, or modify the database.

### 3.4 Auditor or read-only administrator

Can view records and reconciliation reports without creating issuances, redeeming tokens, or changing financial data.

---

## 4. Core User Workflows

### 4.1 Event setup

1. The administrator logs in.
2. The administrator creates all participating stalls.
3. Each stall receives a unique stall ID and an operator account.
4. The organizer configures token denominations and the cash-to-token conversion rate.
5. The organizer tests the QR scanner, backend, database, tunnel, and backup process.
6. The system enters the event-ready state.

### 4.2 Issuing tokens at the cash counter

1. The cashier logs in.
2. The cashier enters the cash amount received.
3. The backend calculates the token value to issue using the configured conversion rate.
4. The backend generates a unique token pass ID and a cryptographically random secret.
5. The database records the issuance, cashier, cash amount, token value, and timestamp.
6. The application displays the pass as a QR code.
7. The attendee saves or displays the QR code on a phone.

The QR code must contain an opaque identifier or credential, not a trusted amount that the browser can edit. The backend remains authoritative.

Every issuance must be recorded once. Refreshing the page or repeating a request must not silently create another pass or increase the issued value a second time.

### 4.3 Redeeming tokens at a stall

1. The stall operator logs in.
2. The operator scans the attendee's QR code.
3. The application sends the pass credential to the backend.
4. The backend verifies that the pass is valid and has sufficient unspent token value.
5. The operator enters the amount being charged.
6. The backend checks the request, validates the stall assignment, and atomically records the redemption.
7. The backend confirms success and returns a transaction reference.
8. The application displays the accepted amount and updated remaining pass value.
9. The amount is added to that stall's collection ledger.

If the pass is invalid, has insufficient value, is void, or cannot be verified, the application must reject the transaction and explain why.

### 4.4 Handling duplicate submissions

If the operator submits a purchase and the response times out:

1. The interface must not automatically create a new purchase.
2. It must query the status of the original transaction or retry with the same idempotency key.
3. If the original transaction succeeded, the backend returns the original result.
4. If the transaction did not succeed, the operator can safely retry according to the server response.
5. The operator must not be shown a success confirmation until the server confirms the transaction.

### 4.5 End-of-event settlement

1. The administrator closes new issuances and redemptions.
2. The system calculates valid redeemed value for each stall.
3. The organizer reviews refunds, approved adjustments, and unresolved discrepancies.
4. The administrator exports a detailed report and a stall settlement summary.
5. The organizer pays each stall according to the agreed settlement rules.
6. The event is marked reconciled after the totals have been checked.

---

## 5. Functional Requirements

### FR-01: Authentication and access control

- All staff interfaces must require authentication.
- Public self-registration must be disabled.
- Every API endpoint must verify the user's identity and permissions.
- Stall operators must only access records belonging to their assigned stall.
- Passwords must be stored using a modern password-hashing algorithm.
- Login failures must be rate-limited.
- Staff sessions must expire after inactivity.
- Deactivated accounts must lose access immediately or when their current session is invalidated.

### FR-02: Token issuance

- Every issuance must have a globally unique ID.
- Every token pass must have a cryptographically random credential.
- The database must record both the cash received and the token value issued.
- The conversion rate used at issuance must be retained in the record.
- Issuance totals must be calculated on the server.
- A cashier must not be able to edit the issued value after creation.
- Voids and corrections must produce new audit records instead of deleting the original issuance.

### FR-03: Token redemption

- Every redemption must reference one valid token pass and exactly one stall.
- The amount must be a positive integer in the configured smallest token unit.
- The pass must have sufficient unspent value.
- Pass validation, value deduction, and transaction insertion must execute as one atomic database transaction.
- Concurrent requests must not spend the same remaining value twice.
- An idempotency key must make a retry of the same logical purchase safe.
- Every successful redemption must have a unique transaction reference.
- A rejected request must not change the pass value or stall collections.

### FR-04: Separate stall ledgers

- Every redemption must be assigned to a stall ID by the backend.
- A stall operator must not choose an arbitrary stall ID to redirect collections.
- The administrator dashboard must show separate gross collection totals for all stalls.
- Approved refunds and adjustments must be recorded separately.
- Historical transactions must retain their original stall assignment.
- A correction must be represented by an auditable reversal or adjustment.

### FR-05: Administrator dashboard

The dashboard must show:

- Total cash received at the counter.
- Total token value issued.
- Total valid token value redeemed.
- Total unspent token value outstanding.
- Total value voided or refunded.
- Collections by stall.
- Net payable amount for each stall.
- Number of issuances and successful redemptions.
- Recent failed or rejected requests.
- Current backend, database, and tunnel status where detectable.

### FR-06: Transaction search and exports

- Administrators must be able to filter records by date, stall, cashier, operator, and transaction ID.
- The application must export detailed CSV transaction records.
- A separate CSV must summarize each stall's payout.
- Exports must include enough fields to reproduce the reconciliation.
- Unauthorized users must not be able to export all stalls' financial records.

### FR-07: Auditability

- Every issuance, redemption, void, refund, adjustment, login failure, and administrative change must be logged where appropriate.
- Financial events must not be silently deleted.
- Logs must identify the actor, timestamp, action, and relevant transaction ID.
- Server timestamps must be generated by the backend, not trusted from the browser.
- The event's finalized reports must be reproducible from the transaction history.

### FR-08: Network failure

- If the backend is unreachable, the application must clearly show that new digital transactions cannot be confirmed.
- A timed-out request must remain in an uncertain state until its server-side status is checked.
- The first version must not treat locally queued offline redemptions as completed payments.
- When connectivity is restored, the operator must be able to check transaction status and continue safely.
- A documented manual fallback must be available for a prolonged outage.

---

## 6. Accounting and Reconciliation

The system must distinguish cash received, token value issued, token value redeemed, and money payable to each stall.

### 6.1 Organizer-level reconciliation

At any point, the token ledger must satisfy:

**Valid token value issued = unspent outstanding value + valid redeemed value**, adjusted for explicitly recorded voids, refunds, or other permitted liability adjustments.

Cash collected at the counter must be reconciled independently against the issuance records and any approved cash corrections.

### 6.2 Stall-level payout

For each stall:

**Net payable = valid redeemed value − approved refunds − agreed deductions.**

The actual meaning of an adjustment or deduction must be defined by the organizer before the event. The system must never infer a commission rate or deduct arbitrary fees.

Unused token value must not automatically be paid to any stall.

The application should support both gross and net amounts, show the transactions behind each total, and allow the organizer to mark a settlement as paid with a timestamp and reference.

### 6.3 Refund policy

Refunds and reversals must require appropriate permission and leave the original transaction intact.

The first version should not automatically restore spent token value after a refund unless the organizer explicitly approves that business rule. Refund behavior must be consistent and documented before the event.

---

## 7. Technical Architecture

### 7.1 Required stack

**Frontend**
- React
- Vite
- TypeScript
- Responsive interface optimized for Android phones and desktop browsers
- Browser-based QR scanning
- Local browser caching for static app resources

**Backend**
- Python
- Flask
- SQLAlchemy
- Database migrations using Alembic or an equivalent migration tool
- A production WSGI server such as Gunicorn for event operation

**Database**
- PostgreSQL running locally on the organizer's laptop
- Database accessible only to local services
- Atomic transactions and database constraints for financial operations

**Networking**
- Cloudflare Tunnel or another suitable tunnel provider
- A single external origin for the frontend and API where practical
- HTTPS for public access
- A reverse proxy for event-day routing

### 7.2 Development mode

During development, the frontend and backend run separately on the laptop:

- React/Vite: `http://localhost:5173`
- Flask API: `http://127.0.0.1:5000`
- PostgreSQL: local database service

Configure Vite to proxy `/api` requests to the Flask API. Browser code should use relative API paths such as `/api/stalls`, not hard-coded localhost URLs.

For testing from another device, route requests through a controlled development tunnel. Configure permitted hostnames explicitly; do not disable Vite's host protection globally. The public development setup must not be used as the final event-day deployment.

### 7.3 Event-day mode

For the event-ready setup:

1. Build the React frontend into static files.
2. Serve the build using a local reverse proxy such as Caddy.
3. Route `/api/*` requests to the backend running on a loopback address.
4. Run Flask under a production WSGI server.
5. Keep PostgreSQL private and inaccessible through the public tunnel.
6. Point the tunnel at the reverse proxy.
7. Require staff authentication for every privileged application function.

The application should not expose database ports, debug consoles, environment files, or development-only endpoints to the internet.

### 7.4 Tunnel requirements

The selected tunnel must:

- Establish a secure connection to the local service.
- Provide HTTPS access from staff phones.
- Allow the organization to identify the correct public URL before operations begin.
- Support the expected request rate and connection behavior.
- Be tested on mobile data from outside the organizer's local network.
- Be monitored for disconnection.

A temporary tunnel is suitable for development demonstrations, but a tunnel's existence is not an uptime guarantee. If a stable URL is required, configure an appropriate persistent tunnel and hostname before the event.

### 7.5 Local persistence and backups

- Database records must survive application restarts.
- The database must not be stored in a temporary directory.
- Backups must be created before the event and periodically while it is operating.
- At least one backup must be copied to a separate storage location.
- Backups containing financial records must be access-controlled.
- The organizer must test restoring a backup on a separate database before event day.

---

## 8. Suggested Database Model

### `users`

- `id`
- `username`
- `password_hash`
- `role`
- `stall_id` (nullable for administrators and cashiers)
- `is_active`
- `created_at`
- `last_login_at`

### `stalls`

- `id`
- `stall_code`
- `name`
- `is_active`
- `created_at`

### `token_passes`

- `id`
- `public_pass_id`
- `credential_hash`
- `issued_value`
- `remaining_value`
- `conversion_rate_version`
- `status`
- `issued_by`
- `created_at`

### `issuances`

- `id`
- `token_pass_id`
- `cash_received`
- `token_value_issued`
- `conversion_rate`
- `cashier_id`
- `created_at`
- `status`

### `redemptions`

- `id`
- `token_pass_id`
- `stall_id`
- `operator_id`
- `amount`
- `idempotency_key`
- `status`
- `created_at`

The idempotency key must have a suitable uniqueness constraint. The transaction model must also prevent an original purchase from being applied twice.

### `adjustments`

- `id`
- `reference_transaction_id`
- `stall_id` (nullable where appropriate)
- `adjustment_type`
- `amount`
- `reason`
- `approved_by`
- `created_at`

### `audit_logs`

- `id`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

Sensitive credentials must not be stored in plaintext. Store only the necessary credential verifier, and never trust token values supplied by an untrusted client.

---

## 9. Security Requirements

1. All important validation must happen in the backend.
2. Financial operations must use atomic database transactions.
3. Every staff account must have an assigned role.
4. No default administrator password may be left active.
5. The service-role or database credentials must never be included in frontend code.
6. Login endpoints must be protected against brute-force attempts.
7. The backend must validate amounts, identifiers, roles, pass status, and transaction state.
8. Browser storage must not be treated as an authoritative financial ledger.
9. Error responses must not expose stack traces, secrets, or database connection details.
10. Administrative actions must be logged and restricted.
11. The database and backend ports must not be publicly exposed.
12. Only authorized staff should access the application through the tunnel.

A token pass QR acts like a bearer credential: someone who copies it may be able to use its remaining value. The application should make that limitation clear and allow an administrator to revoke a compromised pass where possible.

---

## 10. User Interface Requirements

### 10.1 Login page

A compact mobile-first page with username, password, login button, and a clear authentication error.

### 10.2 Cash counter

Display:

- Cash received input.
- Calculated token value.
- Issue-pass button.
- Generated QR code.
- Issuance reference.
- Print or save option where supported.
- Recent issuance list.

### 10.3 Stall checkout

Display:

- Assigned stall name.
- QR scanner.
- Manual credential entry as a fallback for camera problems.
- Validity status.
- Available token value.
- Purchase amount.
- Confirm-redemption button.
- Server-confirmed success or failure.
- Transaction reference.
- Recent stall transactions and current collection total.

The confirmation button must be disabled while the request is in progress, but the backend must remain the definitive protection against duplicates.

### 10.4 Organizer dashboard

Display:

- Summary accounting figures.
- Collection totals by stall.
- Recent transactions.
- Outstanding token value.
- Network and backend status.
- Search, filtering, and CSV export.
- Settlement and backup controls.

### 10.5 Mobile usability

- Large touch targets.
- Readable text and clear contrast.
- Camera permission guidance.
- Clear loading, success, rejection, and timeout states.
- No requirement for attendees to create accounts.
- No use of browser-native alerts as the primary transaction confirmation interface.

---

## 11. Failure Handling

### Laptop crash or power loss

Stop new transaction processing until the backend and database have recovered. Confirm the latest committed transaction state before resuming.

### Internet or tunnel failure

Stall phones cannot reliably reach a laptop across the internet while that connection is unavailable. Show a clear unavailable state and switch to the documented manual fallback.

### Duplicate QR scan

Return the existing redemption result if it is the same transaction retry. Reject a new redemption if the same token value has already been consumed.

### Database error

The API must fail closed: do not display a successful redemption unless the database transaction commits.

### Lost or compromised staff phone

Deactivate the staff session or account and require reauthentication on a replacement device.

### Incorrect issuance

Allow a privileged user to void or correct an issuance through an auditable action. Never edit historical financial records without a trace.

---

## 12. Acceptance Tests

The first version is not event-ready until all of the following pass:

1. A cashier can issue a pass after recording a cash payment.
2. An authorized stall can scan and redeem valid token value.
3. A second stall can redeem remaining value from the same pass.
4. The total for each stall includes only transactions assigned to that stall.
5. The backend rejects a redemption larger than the remaining pass value.
6. Two concurrent purchases cannot spend more than the available value.
7. Retrying a successful request with the same idempotency key does not create a second deduction.
8. Refreshing or reopening the frontend preserves committed transaction state.
9. An unauthorized user cannot perform administrative or other-stall actions.
10. A rejected transaction does not change the pass value or collection totals.
11. An authorized refund or adjustment is visible in audit and settlement reports.
12. CSV exports reproduce the displayed totals.
13. The application can recover from a temporary backend restart.
14. Database backups can be restored and reconciled.
15. The complete application can be reached from test phones on mobile data.
16. A load test simulating 20–30 active stall sessions passes without duplicate deductions, lost committed records, or unacceptable errors.
17. The outage fallback is rehearsed with event staff before the fest.

The performance threshold should be finalized after tests on the actual laptop and network. The system must not be declared ready based solely on its average request rate.

---

## 13. Implementation Phases

### Phase 1 — Foundation

- Set up the React/Vite frontend.
- Set up Flask and PostgreSQL locally.
- Implement database migrations.
- Implement authentication, roles, and stall management.

### Phase 2 — Token issuance

- Implement conversion-rate configuration.
- Create token passes.
- Generate QR codes.
- Record cash receipts and issuance history.
- Add void and audit functionality.

### Phase 3 — Stall redemption

- Implement browser QR scanning.
- Add token validation and redemption.
- Add atomic deduction and idempotency.
- Add separate stall collection ledgers.

### Phase 4 — Dashboard and settlement

- Create aggregate reports.
- Add CSV exports.
- Implement reconciliation rules.
- Add approved refunds, adjustments, and settlement status.

### Phase 5 — Networking and security

- Configure local frontend-to-backend routing.
- Add tunnel access.
- Verify HTTPS and staff authentication.
- Remove development-only endpoints from the event configuration.
- Test access from external mobile networks.

### Phase 6 — Event readiness

- Perform concurrency, duplicate-request, and failure tests.
- Verify database backups and restoration.
- Test power-loss and network-loss procedures.
- Train cashiers and stall operators.
- Freeze the configuration and perform a final reconciliation rehearsal.

---

## 14. Definition of Done

FestToken is ready for the fest only when:

- The complete system runs on the designated laptop.
- The database is persistent and backed up.
- Every cashier and stall operator has the correct permissions.
- QR issuance and redemption are correct under concurrent requests.
- Every successful redemption is assigned to exactly one stall.
- The organizer can reconcile issued value, redeemed value, outstanding value, and stall payouts.
- The application is accessible through the configured tunnel on external phones.
- The event team knows what to do when the backend, laptop, internet, or tunnel fails.

**Final architecture decision:** local React frontend during development, local Flask backend, local PostgreSQL database, and a secure tunnel for remote phones. The application maintains a central token registry to prevent duplicate redemption, while all completed redemptions are recorded in separate stall ledgers. The first version requires live connectivity for confirmed redemptions; true offline redemption is a separate feature with additional consistency and duplicate-spending trade-offs.
