import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Mail, Send } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useSeiaAuth } from "@/lib/seia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getEmailSettings,
  saveEmailSettings,
  sendTestEmail,
} from "@/lib/email-settings.functions";
import type { EmailSettings } from "@/lib/notifications/types";

export const Route = createFileRoute("/configuracoes-email")({
  head: () => ({
    meta: [
      { title: "Configurações de e-mail — SEIA" },
      {
        name: "description",
        content:
          "Defina o provedor, o remetente e teste o envio das notificações de solicitações de veículo do SEIA.",
      },
      { property: "og:title", content: "Configurações de e-mail — SEIA" },
      {
        property: "og:description",
        content: "Provedor, remetente e teste de envio das notificações da frota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfiguracoesEmailPage,
});

const PROVIDERS = [
  {
    id: "brevo" as const,
    label: "Brevo (API HTTPS)",
    hint: "Em uso hoje. Não exige DNS próprio, apenas remetente verificado na conta Brevo.",
  },
  {
    id: "resend" as const,
    label: "Resend (API HTTPS)",
    hint: "Exige o segredo RESEND_API_KEY e um domínio verificado na Resend.",
  },
  {
    id: "smtp" as const,
    label: "SMTP próprio",
    hint: "Só funciona quando o SEIA roda em servidor próprio/VPS — a hospedagem atual bloqueia portas SMTP.",
  },
];

function ConfiguracoesEmailPage() {
  const auth = useSeiaAuth();
  const navigate = useNavigate();
  const load = useServerFn(getEmailSettings);
  const save = useServerFn(saveEmailSettings);
  const test = useServerFn(sendTestEmail);

  const [form, setForm] = useState<EmailSettings | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);


  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/entrar", replace: true });
  }, [auth.loading, auth.user, navigate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["email-settings"],
    enabled: Boolean(auth.user && auth.isManager),
    queryFn: () => load({}),
  });

  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
    if (data?.settings && !testTo) setTestTo(auth.user?.email ?? "");
  }, [data, form, testTo, auth.user]);

  function update<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setLastError(null);
    try {
      await save({ data: form });
      toast.success("Configurações de e-mail salvas.");
      refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao salvar.";
      setLastError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setLastError(null);
    setLastResult(null);

    try {
      const result = await test({ data: { to: testTo } });
      if (result.status === "sent") {
        setLastResult(
          [
            `Destinatário: ${result.to}`,
            `De: ${result.from ?? "-"}`,
            `Responder para: ${result.replyTo ?? "-"}`,
            `Provedor: ${result.provider}`,
            `Horário: ${new Date(result.sentAt ?? Date.now()).toLocaleString("pt-BR")}`,
            `Situação: aceito pelo provedor`,
            `ID da mensagem: ${result.messageId ?? "-"}`,
          ].join("\n"),
        );
        toast.success(`E-mail de teste aceito pelo provedor ${result.provider}.`);
      } else {
        const message = result.reason ?? "O provedor não aceitou a mensagem.";
        setLastResult(null);
        setLastError(`[${result.status}] ${message}`);
        toast.error("Falha no envio de teste. Veja o detalhe abaixo do formulário.");
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado no teste.";
      setLastError(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  if (!auth.loading && auth.user && !auth.isManager) {
    return (
      <div className="min-h-screen">
        <AppHeader auth={auth} />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Apenas o gestor de frota pode alterar as configurações de e-mail.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader auth={auth} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Configurações de e-mail
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Defina por onde o SEIA envia as notificações de autorização, recusa e cancelamento — e
            valide tudo com um envio de teste.
          </p>
        </header>

        {isLoading || !form ? (
          <p className="text-sm text-muted-foreground">Carregando configuração…</p>
        ) : (
          <div className="space-y-8">
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-medium">Envio de e-mail ativo</h2>
                  <p className="text-sm text-muted-foreground">
                    Desligado, os avisos continuam aparecendo apenas dentro do sistema.
                  </p>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => update("enabled", v)}
                  aria-label="Ativar envio de e-mail"
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-medium">Provedor</h2>
              <div className="space-y-3">
                {PROVIDERS.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="provider"
                      className="mt-1"
                      checked={form.provider === p.id}
                      onChange={() => update("provider", p.id)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${data?.environment.brevoConnected ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
                >
                  <CheckCircle2 className="size-3" />
                  Brevo {data?.environment.brevoConnected ? "conectada" : "não conectada"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${data?.environment.resendConfigured ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  <CheckCircle2 className="size-3" />
                  Resend {data?.environment.resendConfigured ? "configurada" : "sem chave"}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-1 font-medium">Remetente</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                O campo <strong>De</strong> só aceita endereços de um domínio já autenticado
                (DKIM) na Brevo. O <strong>Responder para</strong> pode ser qualquer endereço —
                use o institucional para que as respostas cheguem à frota.
              </p>

              {form.provider === "brevo" && (
                <div className="mb-4 rounded-lg border border-border bg-secondary/40 p-4 text-xs">
                  <p className="mb-2 font-medium">Situação dos domínios na Brevo</p>
                  {!data?.brevo?.available ? (
                    <p className="text-muted-foreground">
                      Não foi possível consultar a Brevo agora
                      {data?.brevo?.reason ? `: ${data.brevo.reason}` : "."}
                    </p>
                  ) : data.brevo.domains.length === 0 ? (
                    <p className="text-muted-foreground">Nenhum domínio cadastrado.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.brevo.domains.map((d) => (
                        <li key={d.domain} className="flex items-center gap-2">
                          {d.authenticated ? (
                            <CheckCircle2 className="size-3 text-primary" />
                          ) : (
                            <AlertTriangle className="size-3 text-destructive" />
                          )}
                          <span className="font-mono">{d.domain}</span>
                          <span className="text-muted-foreground">
                            {d.authenticated
                              ? "autenticado — pode ser usado como remetente"
                              : "não autenticado — bloqueado como remetente até publicar o DKIM"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fromName">Nome exibido</Label>
                  <Input
                    id="fromName"
                    value={form.fromName}
                    onChange={(e) => update("fromName", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fromEmail">E-mail do remetente (De)</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    list="brevo-senders"
                    value={form.fromEmail}
                    onChange={(e) => update("fromEmail", e.target.value)}
                  />
                  <datalist id="brevo-senders">
                    {(data?.brevo?.senders ?? []).map((s) => (
                      <option key={s.email} value={s.email} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Precisa pertencer a um domínio autenticado na Brevo.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="replyTo">Responder para (Reply-To)</Label>
                  <Input
                    id="replyTo"
                    type="email"
                    placeholder="frotas.01@inova.pr.gov.br"
                    value={form.replyTo ?? ""}
                    onChange={(e) => update("replyTo", e.target.value || null)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Livre — pode ser o endereço institucional mesmo sem DNS autenticado.
                  </p>
                </div>
              </div>
            </section>


            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-medium">Servidor SMTP</h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Usado apenas quando o provedor for “SMTP próprio”. A senha nunca é gravada no banco:
                ela fica guardada como segredo do servidor.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="smtpHost">Host</Label>
                  <Input
                    id="smtpHost"
                    placeholder="smtp.seudominio.gov.br"
                    value={form.smtpHost ?? ""}
                    onChange={(e) => update("smtpHost", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtpPort">Porta</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    placeholder="587"
                    value={form.smtpPort ?? ""}
                    onChange={(e) =>
                      update("smtpPort", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="smtpUser">Usuário</Label>
                  <Input
                    id="smtpUser"
                    value={form.smtpUser ?? ""}
                    onChange={(e) => update("smtpUser", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtpEncryption">Criptografia</Label>
                  <select
                    id="smtpEncryption"
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.smtpEncryption}
                    onChange={(e) =>
                      update("smtpEncryption", e.target.value as EmailSettings["smtpEncryption"])
                    }
                  >
                    <option value="tls">TLS (STARTTLS, porta 587)</option>
                    <option value="ssl">SSL (porta 465)</option>
                    <option value="none">Sem criptografia</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : "Salvar configurações"}
              </Button>
            </div>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-1 flex items-center gap-2 font-medium">
                <Mail className="size-4" /> Enviar e-mail de teste
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Salve antes de testar. O resultado completo do provedor aparece abaixo e fica
                registrado em Notificações.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="destinatario@inova.pr.gov.br"
                />
                <Button variant="outline" onClick={handleTest} disabled={testing || !testTo}>
                  <Send className="size-4" />
                  {testing ? "Enviando…" : "Enviar e-mail de teste"}
                </Button>
              </div>
              {lastError && (
                <div className="mt-4 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="whitespace-pre-wrap break-words text-sm text-destructive">
                    {lastError}
                  </p>
                </div>
              )}
              {lastResult && (
                <div className="mt-4 flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="whitespace-pre-wrap break-words font-mono text-xs">{lastResult}</p>
                </div>
              )}

            </section>
          </div>
        )}
      </main>
    </div>
  );
}
