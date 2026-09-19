# DealMatch SQL Setup Walkthrough

This document explains the purpose of each section in the `db/full-setup.sql` file and provides instructions on how to apply it to your Supabase project.

## How to Run the SQL

1.  Log in to your [Supabase Dashboard](https://app.supabase.com/).
2.  Select your **DealMatch** project.
3.  In the left sidebar, click on the **SQL Editor** (represented by a `>_` icon).
4.  Click **New query**.
5.  Open the `db/full-setup.sql` file in this repository and copy its entire content.
6.  Paste the content into the Supabase SQL Editor.
7.  Click the **Run** button at the bottom right.

---

## What the SQL Does

### 1. Extensions
Enables the `pgcrypto` extension, which is required for generating secure unique IDs (UUIDs) for your database records.

### 2. Bank Details
Adds four new columns to your `profiles` table: `bank_name`, `account_number`, `account_name`, and `routing_number`.
*   **Security Feature:** Includes a database-level check to ensure that `account_number` is exactly 10 digits (standard for Nigerian banks).

### 3. Mortgage Workflow & Ticket System
*   **Table Creation:** Ensures the `mortgage_applications` table exists with all necessary fields for borrowers and lenders.
*   **Status Constraints:** Limits the application status to a predefined list: `pending`, `processing`, `reviewing`, `approved`, `declined`, `finished`, `on_hold`.
*   **Ticket ID System:** Creates a secure function and a "trigger" that automatically generates a human-readable ID (like `MTG-A1B2C3D4`) every time a new application is submitted.

### 4. Security Hardening (RLS)
This is the most critical part for your app's security. It implements **Row Level Security (RLS)**:
*   **Profiles:** Users can only view and edit their own profile data.
*   **Mortgage Applications:** Borrowers can only see their own applications.
*   **Lender Access:** Users with the `lender` or `admin` role are granted special permission to view and update all mortgage applications, while remaining restricted from seeing other users' private bank details.

### 5. Schema Refresh
Sends a notification to Supabase to immediately recognize the new changes without needing a restart.
