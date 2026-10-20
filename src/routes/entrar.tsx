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
import { passwordStrengthError, PASSWORD_RULE_MESSAGE, REGIONAIS } from "@/lib/password-strength";
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
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [regional, setRegional] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const sendReset = useServerFn(requestPasswordReset);

  useEffect(() => {
    if (!auth.user) return;
    if (!auth.roleLoaded) return;
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: auth.isDriver ? "/motorista" : "/painel", replace: true });
  }, [auth.user, auth.roleLoaded, auth.isDriver, navigate, next]);
  const [asDriver, setAsDriver] = useState(false);

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
    // o redirecionamento por perfil acontece no efeito acima
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!isInstitutionalEmail(email)) {
      toast.error(`Cadastro permitido apenas para e-mails ${EMAIL_DOMAIN}`);
      return;
    }
    if (!regional) {
      toast.error("Selecione a sua regional.");
      return;
    }
    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      toast.error(strengthError);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
        data: { full_name: fullName, department, regional },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível cadastrar: " + error.message);
      return;
    }
    let session = data.session;
    if (!session) {
      const signIn = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signIn.error) {
        toast.error("Conta criada. Faça login para continuar.");
        return;
      }
      session = signIn.data.session;
    }
    if (session) {
      await supabase.from("profiles").upsert({
        id: session.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName,
        department,
        regional,
      });
      if (asDriver) {
        const { error: roleErr } = await supabase.rpc("claim_driver_role");
        if (roleErr) {
          toast.error("Conta criada, mas não foi possível ativar o perfil de motorista.");
          return;
        }
        toast.success("Conta de motorista criada com sucesso.");
        window.location.href = "/motorista";
        return;
      }
      toast.success("Conta criada com sucesso.");
      if (next) {
        window.location.href = next;
        return;
      }
      navigate({ to: "/painel" });
    }
  }

  const signupForm = (
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
                  <Label htmlFor="dept">Setor</Label>
                  <Input
                    id="dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regional">Selecionar Regional</Label>
                  <select
                    id="regional"
                    required
                    value={regional}
                    onChange={(e) => setRegional(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="" disabled>Selecione…</option>
                    {REGIONAIS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
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
                  <div className="relative">
                    <Input
                      id="password2"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {asDriver ? "Criar conta de motorista" : "Criar conta"}
                </Button>
              </form>
            );

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup" onClick={() => setAsDriver(false)}>Criar conta</TabsTrigger>
              <TabsTrigger value="driver" onClick={() => setAsDriver(true)}>Motorista</TabsTrigger>
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
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    Entrar
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full text-sm"
                    onClick={() => setForgot(true)}
                  >
                    Esqueci minha senha
                  </Button>
                </form>
              )}
            </TabsContent>


            <TabsContent value="signup">{signupForm}</TabsContent>
            <TabsContent value="driver">
              <p className="mt-4 rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
                Conta exclusiva para motoristas: não faz solicitações. Ao entrar, você escolhe o veículo e preenche o diário de bordo (início e fim), enviado direto ao gestor.
              </p>
              {signupForm}
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
