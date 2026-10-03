# Privacy policy — DoseCircle (template to complete)

> Template written for the app as built. English translation of docs/PRIVACY.md, which
> prevails. **Have it reviewed by a lawyer** and fill in the fields in brackets before
> publishing (website + store listings).

**Data controller:** [Company name], [address], [registration number], contact:
[dedicated email, e.g. privacy@dosecircle.app]. DPO: [name or “not appointed”].

## 1. Data processed

| Category                   | Data                                                                                                        | Source              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------- |
| Account                    | Email address, consent date, app language                                                                   | You                 |
| Health data (GDPR art. 9)  | Medications, amounts, times, treatment dates, notes, answers to reminders (taken / skipped / not confirmed) | You                 |
| Profile                    | First name, time zone, alert delay, last connection                                                         | You / the app       |
| Loved ones (“My Circle”)   | Link between your account and your loved ones' accounts, their first name, invitation codes, alert log      | You / the loved one |
| Devices                    | Notification token and language of your phones (to receive Circle alerts)                                   | The app             |
| Technical                  | Crash reports (no health data, no identity)                                                                 | The app             |
| Advertising (free version) | Device advertising identifier, IP address (approximate location), interactions with ads                     | Google AdMob SDK    |
| Premium subscription       | Purchase history (product, dates, store), account identifier                                                | App Store / Play    |

## 2. Purposes and legal bases

- Dose reminders, backup and sync: performance of the service + **explicit consent** to the
  processing of health data (box ticked at sign-up).
- Alerts to loved ones: consent of the user (invitation) **and** of the loved one (entering
  the code).
- Crash reports: legitimate interest (reliability of the service).
- Advertising in the free version: **consent** collected through Google's form (UMP / TCF),
  changeable at any time (“My account” → “Ad choices”). **Non-personalised ads only**; no
  health data, no keyword, no app content is sent to the ad network.
- Premium subscription: performance of the contract.

No data resale, no profiling, no automated decision-making.

## 3. Recipients / processors

| Processor           | Role                                                        | Location                         | Safeguards                                                |
| ------------------- | ----------------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| Supabase            | Database, authentication, server functions                  | European Union ([chosen region]) | Supabase DPA                                              |
| Expo, Apple, Google | Delivery of alert notifications to loved ones               | United States / EU               | Service terms; content limited to the first name and time |
| Sentry              | Crash reports (no health data)                              | [EU or US depending on the plan] | DPA                                                       |
| Google (AdMob)      | Ads in the free version (non-personalised)                  | Worldwide (Google)               | Google “joint controller” terms / TCF                     |
| RevenueCat          | Validation and tracking of Premium subscriptions            | United States                    | DPA + standard contractual clauses                        |
| Apple / Google      | App distribution, subscription payment, local notifications | —                                | —                                                         |

## 4. Retention periods

- Account and health data: until the account is deleted.
- Alert log and Circle links: until the account is deleted or the loved one leaves.
- Purchase history: deleted at RevenueCat when the account is deleted (the stores keep
  their own invoices under their legal obligations).
- Account deletion: immediate and permanent erasure (database cascade and phone). The
  host's technical backups expire within [7] days.

## 5. Security

Data encrypted on the phone (SQLCipher, key in the Keychain / Keystore), encryption in
transit (HTTPS), strict per-account isolation (Row Level Security, tested automatically),
no secret key in the app, Android backup disabled.

## 6. Your rights

Access, rectification, erasure, portability (JSON export from “My account”), restriction,
objection, withdrawal of consent at any time. Contact: [email]. Complaint: your data
protection authority (in France, the CNIL, www.cnil.fr).

## 7. Loved ones

A loved one is only alerted if they themselves entered, in their own app, the invitation
code received from the user. Either can end the link at any time (“Remove” or “Stop
looking out”). The alert only contains the user's first name and the planned time, never
the name of a medication. The link is erased if either of them deletes their account.

_Last updated: [date]._
