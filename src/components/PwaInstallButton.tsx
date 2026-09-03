import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!deferred) {
      if (isIos) {
        setShowIosHelp(true);
      } else {
        toast.info(
          "Seu navegador não oferece instalação automática. No Chrome/Edge, abra o menu e escolha 'Adicionar à tela inicial'.",
        );
      }
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") toast.success("Aplicativo instalado.");
    setDeferred(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={install}>
        <Download className="size-4" />
        <span className="hidden sm:inline">Instalar app</span>
        <span className="sm:hidden">App</span>
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Share className="size-5 text-primary" />
              Adicionar à Tela de Início
            </DialogTitle>
            <DialogDescription className="text-base">
              No iPhone ou iPad, toque em{" "}
              <Share className="mx-1 inline size-4" /> Compartilhar na barra do Safari e
              escolha <strong>Adicionar à Tela de Início</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p>Assim o SEIA abre como um app, em tela cheia, sem a barra de endereço.</p>
          </div>
          <Button variant="outline" onClick={() => setShowIosHelp(false)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
