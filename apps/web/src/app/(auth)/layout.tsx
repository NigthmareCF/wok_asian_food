export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <main className="auth-shell">{children}</main>;
}
