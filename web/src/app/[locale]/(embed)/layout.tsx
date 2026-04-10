export default function EmbedGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        header { display: none !important; }
        main { padding: 8px 0 !important; max-width: 100% !important; }
        body { background: #121212 !important; }
      `}</style>
      {children}
    </>
  );
}
