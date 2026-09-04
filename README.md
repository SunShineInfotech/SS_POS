# Lovable POS System

🚀 POS System Development Prompt

Prompt:

Build a complete POS (Point of Sale) Management System using modern web technologies (Node.js with Express/Koa, React frontend, and MySQL/PostgreSQL database).

🧠 Core Requirements

1. Architecture

 Backend: Node.js (Express or Koa)

 Frontend: React (mobile responsive + PWA-like UI)

 Database: MySQL / PostgreSQL (support MongoDB optional)

 API-based modular structure

 Role-based authentication & authorization

📦 Master Modules (CRUD with 2 Pages)

Each module should have:

 Page 1: List + Deleted Records (Soft delete)

 Page 2: Add / Update Form

Modules:

 Category

 Product

 Franchise

 Customer

 Vendor

 Expense Category

 Income

 Expense

 Employees

 Tables

 Employee Attendance

🧾 POS Module (Core Feature)

Features:

 Select products dynamically

 Product-level discount:

 ₹ or %

 Total bill discount:

 ₹ or %

 Mixed discount types per product allowed

 Customer selection (Name + Mobile)

 Table selection (show Free/Booked status)

 Round-off logic:

 49.49 → 49

 49.50+ → 50

Billing:

 Hold Invoice system (save & resume)

 Auto-generated bill number (sales)

 Multi-payment modes:

 Cash

 UPI

 Split payments

 Outstanding tracking:

 Show previous pending dues

 Update after payment

📊 Transactions (Passbook Style)

Customer & Vendor Ledger:

 ID

 Date

 Remark

 Bill No

 Credit

 Debit

 Balance

📦 Purchase Module

 Vendor selection

 Manual bill number

 Multiple products (ONLY raw materials)

 Qty, price, GST calculations

💰 Sales Module

 Customer selection

 Auto bill number

 Only finished products

📉 Dashboard (All with Filters)

Filters:

 Franchise dropdown

 Date range

Dashboards:

 Main Dashboard

 Sales, Purchase, Income, Expense

 Outstanding

 Graphs + counts

 Finance Dashboard

 Profit / Loss

 Income vs Expense graphs

 Low Stock Dashboard

 Employee Dashboard

 Attendance

 Performance tracking

📋 Master Fields

Franchise:

 Name, Mobile, Address, Email, Owner Name, Status

Tables:

 Franchise ID, Table Name, Status (Free/Booked)

Employees:

 Franchise ID, Name, Mobile

 Emergency Contact

 Address

 ID Proof (Image)

 Aadhaar, PAN

 Status

Attendance:

 Date, Check-in, Lunch Start/End, Check-out

 Total Time, Working Hours

Product:

 Category

 MRP

 Offer Price

 GST %

 Final Price (after GST)

 Stock

 Type:

 Raw Material

 Finished Product

🔍 UI/UX Features

 Searchable dropdowns (all)

 Table features:

 Column sorting (ASC/DESC)

 Global search (all fields)

 Pagination:

 20 / 40 / 50 / 100 / All

 Export:

 CSV download

📱 Mobile App-Like UI

Bottom Navigation:

 Home

 Customer

 POS

 Vendor

 More

More Section:

 Profile

 Check-in / Check-out / Lunch

 All masters

 Logout

Header:

 Check-in / Check-out buttons

🔐 Permissions System

 Employee-wise page access control

 Only allowed pages visible

⚙️ Advanced Features

 ✅ Auto Backup System

 🧾 Thermal Bill Printing

 📄 Invoice PDF Download

 📲 WhatsApp Invoice Sharing

 🌙 Dark / Light Mode

 🔔 Notifications:

 Low stock alerts

 Pending payments

🎯 Additional Notes

 Responsive UI:

 Mobile → App-like

 Desktop → Full software layout

 Clean, modern UI (Black & White theme preferred)

 Fast performance & optimized queries

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://biz-bright-link.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4fdd1fd2-efdf-4e75-b5f6-0e3c0a2e761b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
