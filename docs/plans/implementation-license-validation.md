# Implement License Validation Logic

We will implement the backend logic to activate and validate licenses using the provided external API endpoints and the specified secure offline-capable workflow.

## Lifecycle & Workflow

1.  **Purchase & Generation (External)**:
    -   User clicks "Upgrade" in Elova -> opens `https://elova.dev/pricing`.
    -   User completes purchase via Stripe.
    -   Stripe Webhook triggers `elova-validation` backend.
    -   Backend generates a **License Key** and saves it to Supabase with metadata (tier, payment info).
    -   Backend emails the License Key to the user (via Resend/etc.).

2.  **Activation (In-App)**:
    -   User enters License Key in Elova Profile Settings.
    -   **Validation**: Elova checks if the key is valid (`POST /api/validate`).
    -   **Activation**: Elova binds the key to this machine (`POST /api/activate` with `machine_id`).
    -   **Storage**: Elova stores the returned **Activation Token** (signed) and metadata locally.

3.  **Verification (Ongoing)**:
    -   **Offline**: Elova verifies the stored Activation Token signature using the **Public Key**.
    -   **Online**: Elova periodically checks with the backend (`/api/validate` or `/api/status`) to ensure the license hasn't been revoked/expired.

## Architecture

1.  **Actors**:
    -   **Client (This App)**: Handles `machine_id` generation, signature verification (Public Key), and local storage.
    -   **Licensing Authority**: `elova-validation-ttrx.vercel.app` (Hardcoded in `src/lib/constants.ts`).
    -   **Storage**: Local SQLite (`ConfigManager`) stores:
        -   `system.instance_id` (Machine ID)
        -   `license.key` (User input)
        -   `license.token` (Signed Activation Token)
        -   `license.meta` (Tier, Expiry)
        -   `license.public_key` (For signature verification)

## Implementation Steps

1.  **Frontend Updates**:
    -   **Profile Page**: Update "Upgrade" button to open `https://elova.dev/pricing`.
    -   **License Input**: Handle the "Save/Activate" flow.

2.  **License Manager Service (`src/lib/licensing.ts`)**:
    -   `getMachineId()`: Get or generate persistent UUID.
    -   `activate(licenseKey)`:
        -   Step 1: Validate Key (Optional explicitly, but good practice).
        -   Step 2: **Activate Instance**: Call `POST /api/activate` with `{ key, machine_id }`.
        -   Step 3: **Verify & Store**: Validate response signature, store token & metadata.
    -   `checkLicense()`:
        -   Verify local token signature/expiry.
        -   (Async) Periodically re-validate with backend if online.

3.  **API Routes (`src/app/api/license/...`)**:
    -   `POST /activate`: Gateway to `Licensing.activate`.
    -   `GET /status`: Returns local license status (Tier, Expiry).

4.  **Configuration**:
    -   **Hardcoded Values**: Store the **Public Key** and **Licensing API Endpoints** directly in the code (e.g., `src/lib/constants.ts`) to ensure the application connects to the official licensing server out-of-the-box. Do NOT use `.env` for these core values.
    -   **Licensing Authority**: `elova-validation-ttrx.vercel.app` (Hardcoded in `src/lib/constants.ts`).
    -   **Storage**: Local SQLite (`ConfigManager`) stores:
        -   `system.instance_id` (Machine ID)
        -   `license.key` (User input)
        -   `license.token` (Signed Activation Token)
        -   `license.meta` (Tier, Expiry)
        -   `license.public_key` (For signature verification)

## External API Contract
-   **Validate**: `POST /api/validate` -> `{ valid: boolean, ... }`
-   **Activate**: `POST /api/activate` -> `{ token: string, meta: { ... } }`
