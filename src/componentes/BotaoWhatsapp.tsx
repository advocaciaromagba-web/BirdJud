import Link from "next/link";

/** O numero da Blackbird para atendimento: contato, reclamacao, devolucao. */
export const WHATSAPP_DA_PLATAFORMA = "5516992304561";
export const WHATSAPP_DA_PLATAFORMA_EM_TEXTO = "(16) 99230-4561";

const MENSAGEM = "Olá! Vim pelo site do BirdJud e gostaria de falar com a Blackbird.";

export function enderecoDoWhatsapp(): string {
  return `https://wa.me/${WHATSAPP_DA_PLATAFORMA}?text=${encodeURIComponent(MENSAGEM)}`;
}

/** O simbolo do WhatsApp, em SVG, para nao depender de imagem externa. */
export function SimboloWhatsapp({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="currentColor">
      <path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.5L3 29l6.7-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-3.9-.5-5.6-1.5l-.4-.2-4 1 1-3.9-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.6 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5l-.6-.4z" />
    </svg>
  );
}

/**
 * Botao flutuante do WhatsApp nas paginas publicas: canto inferior direito,
 * sempre a vista. E o canal de contato, reclamacao e devolucao da
 * plataforma; abre a conversa com a mensagem pronta.
 */
export function BotaoWhatsapp() {
  return (
    <Link
      href={enderecoDoWhatsapp()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Blackbird pelo WhatsApp: contato, reclamações e devoluções"
      title="Fale conosco pelo WhatsApp"
      className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#1ebe5d] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40"
    >
      <SimboloWhatsapp className="h-8 w-8" />
    </Link>
  );
}
