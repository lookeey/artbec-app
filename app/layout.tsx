import './relationship-improvements.css';
import './data-security.css';
import {ArtbecTheme} from "./theme-controls";
import type { Metadata } from "next";
import "./globals.css";
import "./map-quotes.css";
import "./procurement.css";
import "./staff-cards.css";
import "./performance-insights.css";
import "./home-navigation.css";
import "./oil-monitor.css";
import "./inventory-workspace.css";
import "./client-cards.css";
import "./annual-adjustments.css";
import "./notes-workspace.css";
import "./payroll-alignment.css";
import "./profitability-workspace.css";
import "./reminders.css";
import "./management-hubs.css";

import "./sale-form.css";
import "./personal-tasks.css";
import "./login-workspace.css";
import "./finance-list.css";
import "./product-agenda.css";
import "./complaints.css";
import "./dark-theme.css";
import "./dark-theme-foundations.css";

export const metadata: Metadata = {
  title: "Artbec | Gestão",
  description: "Gestão financeira, operacional e administrativa da Artbec Piscinas.",
  icons: {
    icon: [{url:"/artbec-favicon-transparent.svg",type:"image/svg+xml"}],
    shortcut: "/artbec-favicon-transparent.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased"><ArtbecTheme>{children}</ArtbecTheme></body>
    </html>
  );
}
