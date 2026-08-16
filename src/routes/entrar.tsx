import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { requestPasswordReset } from "@/lib/password.functions";
import { useSeiaAuth, isInstitutionalEmail, EMAIL_DOMAIN } from "@/lib/seia";

function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export const Route = createFileRoute("/entrar")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Entrar — SEIA Frota Institucional" },
      {
        name: "description",
        content:
          "Acesse o SEIA com seu e-mail institucional @inova.pr.gov.br para solicitar veículos da frota.",
      },
      { property: "og:title", content: "Entrar — SEIA Frota Institucional" },
      {
        property: "og:description",
        content: "Login restrito a servidores com e-mail @inova.pr.gov.br.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EntrarPage,
});

function EntrarPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const sendReset = useServerFn(requestPasswordReset);

  useEffect(() => {
    if (!auth.user) return;
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/painel", replace: true });
  }, [auth.user, navigate, next]);

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!isInstitutionalEmail(email)) {
      toast.error(`Use um e-mail terminado em ${EMAIL_DOMAIN}`);
      return;
    }
    setBusy(true);
    try {
      const result = await sendReset({ data: { email: email.trim().toLowerCase() } });
      if (result.status && result.status !== "sent") {
        toast.warning(
          "Não conseguimos concluir o envio agora. Peça ao gestor de frota para redefinir sua senha.",
        );
      } else {
        toast.success("Enviamos um link de redefinição para o seu e-mail institucional.");
      }
      setForgot(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o e-mail.");
    } finally {
      setBusy(false);
    }
  }


  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isInstitutionalEmail(email)) {
      toast.error(`Use um e-mail terminado em ${EMAIL_DOMAIN}`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar: " + error.message);
      return;
    }
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/painel" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!isInstitutionalEmail(email)) {
      toast.error(`Cadastro permitido apenas para e-mails ${EMAIL_DOMAIN}`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
        data: { full_name: fullName, department },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível cadastrar: " + error.message);
      return;
    }
    if (data.session) {
      await supabase.from("profiles").upsert({
        id: data.session.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName,
        department,
      });
      if (next) {
        window.location.href = next;
        return;
      }
      navigate({ to: "/painel" });
      return;
    }
    toast.success("Cadastro criado. Confirme o e-mail institucional para acessar.");
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto flex max-w-md flex-col px-4 py-14">
        <h1 className="text-2xl font-semibold">Acesso ao SEIA</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Exclusivo para servidores com e-mail <strong>{EMAIL_DOMAIN}</strong>.
        </p>

        <div className="surface-panel mt-8 p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {forgot ? (
                <form className="mt-5 space-y-4" onSubmit={handleForgot}>
                  <p className="text-sm text-muted-foreground">
                    Informe seu e-mail institucional e enviaremos um link para criar uma nova senha.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">E-mail institucional</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      placeholder={`nome${EMAIL_DOMAIN}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Enviar link de redefinição
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:underline"
                    onClick={() => setForgot(false)}
                  >
                    Voltar para o login
                  </button>
                </form>
              ) : (
                <form className="mt-5 space-y-4" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail institucional</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder={`nome${EMAIL_DOMAIN}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Entrar
                  </Button>
                  <button
                    type="button"
                    className="w-full text-sm text-muted-foreground hover:underline"
                    onClick={() => setForgot(true)}
                  >
                    Esqueci minha senha
                  </button>
                </form>
              )}
            </TabsContent>


            <TabsContent value="signup">
              <form className="mt-5 space-y-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dept">Setor / Diretoria</Label>
                  <Input
                    id="dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail institucional</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    placeholder={`nome${EMAIL_DOMAIN}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <Link to="/" className="mt-6 text-center text-sm text-muted-foreground hover:underline">
          Voltar ao início
        </Link>
      </main>
    </div>
  );
}
