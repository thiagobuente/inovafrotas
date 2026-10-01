import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth } from "@/lib/seia";
import { passwordStrengthError, PASSWORD_RULE_MESSAGE } from "@/lib/password-strength";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — SEIA Frota Institucional" },
      {
        name: "description",
        content:
          "Defina uma nova senha de acesso ao SEIA após solicitar a recuperação por e-mail institucional.",
      },
      { property: "og:title", content: "Redefinir senha — SEIA Frota Institucional" },
      {
        property: "og:description",
        content: "Crie uma nova senha para acessar o sistema de frota institucional SEIA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
      return;
    }
    if (!auth.loading) setReady(Boolean(auth.session));
  }, [auth.loading, auth.session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      toast.error(strengthError);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível redefinir: " + error.message);
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto flex max-w-md flex-col px-4 py-14">
        <h1 className="text-2xl font-semibold">Criar nova senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defina uma nova senha de acesso ao SEIA.
        </p>

        <div className="surface-panel mt-8 p-6">
          {!ready && !auth.loading ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Link de recuperação inválido ou expirado. Solicite um novo e-mail de redefinição.
              </p>
              <Button asChild className="w-full">
                <Link to="/entrar">Voltar para o acesso</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                  <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}</p>
                </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Salvar nova senha
              </Button>
            </form>
          )}
        </div>

        <Link to="/" className="mt-6 text-center text-sm text-muted-foreground hover:underline">
          Voltar ao início
        </Link>
      </main>
    </div>
  );
}
