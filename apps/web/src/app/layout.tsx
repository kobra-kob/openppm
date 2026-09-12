import type { Metadata } from "next";
// Polices auto-hébergées (paquets @fontsource-variable : fichiers woff2 embarqués).
// Archivo → titres (--font-heading), Space Grotesk → corps (--font-sans).
// Contrairement à next/font/google, aucun accès réseau n'est requis au build →
// le conteneur se construit même sans joindre fonts.googleapis.com.
import "@fontsource-variable/archivo";
import "@fontsource-variable/space-grotesk";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "OpenPPM",
  description: "Open Source Strategic Portfolio Management",
};

/** Applique le thème sombre avant la première peinture (anti-FOUC). */
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // On transmet explicitement les messages au provider client : le client
  // reçoit ainsi toujours l'intégralité des traductions résolues côté serveur
  // (pas de dépendance à l'héritage implicite).
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
