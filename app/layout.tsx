export const metadata = { title: "Hindsight", description: "A prediction market that remembers who was right." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
