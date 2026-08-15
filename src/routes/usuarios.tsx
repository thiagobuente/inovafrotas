import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAccounts, managerResetPassword } from "@/lib/password.functions";
import { useSeiaAuth, EMAIL_DOMAIN } from "@/lib/seia";

type Account = { id: string; email: string; full_name: string; department: string | null };

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Contas e senhas — SEIA Frota Institucional" },
      {
        name: "description",
        content:
          "Painel do gestor de frota para consultar contas institucionais e redefinir senhas de servidores do SEIA.",
      },
      { property: "og:title", content: "Contas e senhas — SEIA" },
      {
        property: "og:description",
        content: "Gestão de contas institucionais e redefinição de senhas no SEIA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const auth = useSeiaAuth();
  const fetchAccounts = useServerFn(listAccounts);
  const resetPassword = useServerFn(managerResetPassword);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.isManager) return;
    fetchAccounts()
      .then((r) => setAccounts(r.accounts as Account[]))
      .catch(() => setAccounts([]));
  }, [auth.isManager, fetchAccounts]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await resetPassword({ data: { email: email.trim().toLowerCase(), password } });
      toast.success(`Senha redefinida para ${result.email}.`);
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível redefinir a senha.");
    } finally {
      setBusy(false);
    }
  }

  if (auth.loading) return null;

  if (!auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-3xl px-4 py-14">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva do gestor de frota.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Contas e senhas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defina uma nova senha para servidores que não conseguem receber o e-mail de redefinição.
          Oriente o usuário a trocá-la após o primeiro acesso.
        </p>

        <form className="surface-panel mt-8 space-y-4 p-6" onSubmit={handleReset}>
          <div className="space-y-2">
            <Label htmlFor="conta">E-mail institucional</Label>
            <Input
              id="conta"
              type="email"
              required
              list="contas-seia"
              placeholder={`nome${EMAIL_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <datalist id="contas-seia">
              {accounts.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.full_name || a.email}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>
          <Button type="submit" disabled={busy}>
            Redefinir senha
          </Button>
        </form>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Contas cadastradas</h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{a.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEmail(a.email)}>
                  Selecionar
                </Button>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">Nenhuma conta encontrada.</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
