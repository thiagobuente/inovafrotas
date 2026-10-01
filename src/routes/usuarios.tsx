import { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listAccounts,
  managerResetPassword,
  managerUpdateAccount,
  managerDeleteAccount,
} from "@/lib/password.functions";
import { passwordStrengthError, PASSWORD_RULE_MESSAGE, REGIONAIS } from "@/lib/password-strength";
import { useSeiaAuth, EMAIL_DOMAIN } from "@/lib/seia";

type Account = { id: string; email: string; full_name: string; department: string | null; regional?: string | null };


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
  const updateAccount = useServerFn(managerUpdateAccount);
  const deleteAccount = useServerFn(managerDeleteAccount);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", department: "", regional: "", email: "" });
  const [removing, setRemoving] = useState<Account | null>(null);

  const loadAccounts = useCallback(() => {
    fetchAccounts()
      .then((r) => setAccounts(r.accounts as Account[]))
      .catch(() => setAccounts([]));
  }, [fetchAccounts]);

  useEffect(() => {
    if (!auth.isManager) return;
    loadAccounts();
  }, [auth.isManager, loadAccounts]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      toast.error(strengthError);
      return;
    }
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

  function openEdit(account: Account) {
    setEditing(account);
    setEditForm({
      full_name: account.full_name ?? "",
      department: account.department ?? "",
      regional: account.regional ?? "",
      email: account.email,
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await updateAccount({
        data: {
          id: editing.id,
          full_name: editForm.full_name,
          department: editForm.department,
          regional: editForm.regional || null,
          ...(editForm.email.trim().toLowerCase() !== editing.email
            ? { email: editForm.email }
            : {}),
        },
      });
      toast.success("Perfil atualizado.");
      setEditing(null);
      loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o perfil.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteAccount({ data: { id: removing.id } });
      toast.success(`Conta ${removing.email} excluída.`);
      setRemoving(null);
      loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_RULE_MESSAGE}</p>
          </div>
          <Button type="submit" disabled={busy}>
            Redefinir senha
          </Button>
        </form>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Contas cadastradas</h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{a.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                  {a.department && (
                    <p className="text-xs text-muted-foreground">Setor: {a.department}</p>
                  )}
                  {a.regional && (
                    <p className="text-xs text-muted-foreground">Regional: {a.regional}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEmail(a.email)}>
                    Selecionar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(a)}>
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={a.id === auth.user?.id}
                    onClick={() => setRemoving(a)}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">Nenhuma conta encontrada.</li>
            )}
          </ul>
        </section>

        <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar perfil</DialogTitle>
              <DialogDescription>
                Atualize os dados cadastrais da conta institucional.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleEdit}>
              <div className="space-y-2">
                <Label htmlFor="edit-nome">Nome completo</Label>
                <Input
                  id="edit-nome"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-setor">Setor</Label>
                <Input
                  id="edit-setor"
                  value={editForm.department}
                  onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-regional">Regional</Label>
                <select
                  id="edit-regional"
                  value={editForm.regional}
                  onChange={(e) => setEditForm((f) => ({ ...f, regional: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Não informada</option>
                  {REGIONAIS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">E-mail institucional</Label>
                <Input
                  id="edit-email"
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Deve terminar em {EMAIL_DOMAIN}.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  Salvar alterações
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta</AlertDialogTitle>
              <AlertDialogDescription>
                A conta {removing?.email} será removida definitivamente. Contas com solicitações
                registradas são preservadas para auditoria.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={handleDelete}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

